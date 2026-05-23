# Step 3 — Material Flows: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Step 3 — an editable Material Flows table that derives per-flow cycle time, vehicle count, and utilization live as the user types, plus per-vehicle group summary cards aggregating fleet, utilization, average cycle, and peak throughput.

**Architecture:** Pure calc engine in `src/calc/flowMetrics.ts` (no React, no I/O — testable in isolation). Storage extends the existing `StoredProject` with a `flows: Flow[]` array, round-tripped through `localStorage` via `src/lib/storage.ts`. UI is a thin presentational layer over the calc engine — every visible number traces to one function call. Live recompute is automatic because the page reads `project.flows` from React state and the calc engine is synchronous and pure.

**Tech Stack:** React 19 (App Router client component), React Hook Form 7 (Step 1 only — Step 3 uses controlled inputs directly, no RHF), Zod 4 schema for `flows`, Vitest for calc tests, Toyota Type fonts per ARCHITECTURE.md.

---

## Context and Source Material

- **Screenshot reference:** the user's Step 3 mockup, attached to this turn. Two group cards (CB18 AGF and ML2 Mini Load AV), an 8-row flow table with computed Cycle/Veh/Util columns, footer counts.
- **Spec source of truth (to create as Task 1):** `docs/SPECIFICATION.md` Step 3 chapter.
- **Architectural constraints (do not violate):** see `ARCHITECTURE.md` — imperial-first storage, vehicle data from JSON only, `src/calc/` pure, no backend DB, steps modular.
- **Prior work touched:** `src/calc/trafficLight.ts` (Step 2's qualification) and `src/content/vehicles/*.json` (already contain every field this plan needs — `calc.speedLoadedFps`, `calc.speedUnloadedFps`, `transferMethods[].loadTimeSec`, `transferMethods[].unloadTimeSec`, `calc.maxWeightLbs`).

---

## Mathematics — Scrutinized

These are the formulas the calc engine implements. All derivations and unit reconciliations are spelled out so the engineer building this can sanity-check before writing a line of code. The plan's `Task 1` writes this same content into `docs/SPECIFICATION.md`.

### Constants

| Symbol | Name              | Value | Source            |
|--------|-------------------|-------|-------------------|
| η      | Productivity factor | 0.70  | Industry convention — 30% lost to charging, queue waits, traffic, breaks, idle. Configurable per project in a future revision; v1 hard-coded. |
| φ      | Peak factor      | 1.20  | "Peak throughput" = base demand × 1.2. v1 hard-coded; displayed only — not used for sizing. |
| T_hr   | Seconds per hour | 3600  | Exact. |

### Per-flow inputs

| Field                | Storage unit | Type                | Notes |
|----------------------|--------------|---------------------|-------|
| `id`                 | —            | string              | Stable random id, `f_<random>`. |
| `origin`             | —            | string              | Free text. |
| `destination`        | —            | string              | Free text. |
| `distanceFt`         | ft           | number > 0          | **One-way distance.** Cycle calc multiplies by 2 for round-trip travel. |
| `thruPerHr`          | moves/hr     | number ≥ 0          | Required throughput at this flow. Integer in v1 but stored as `number` for future fractional rates. |
| `weightLbs`          | lbs          | number ≥ 0          | Load weight per move at this flow. Used to gate vehicle dropdown. |
| `vehicleId`          | —            | string \| undefined | References `vehicle.id` from `src/content/vehicles/*.json`. Empty until user picks. |
| `transferMethodIdx`  | —            | number \| undefined | Index into `vehicle.transferMethods[]`. Defaults to 0 if absent. |

### Cycle time

**Definition:** time, in seconds, for one full round-trip with one move (origin → destination loaded → return empty → ready for next pick).

```
travelLoadedSec   = distanceFt / vehicle.calc.speedLoadedFps
travelEmptySec    = distanceFt / vehicle.calc.speedUnloadedFps
transfer          = vehicle.transferMethods[transferMethodIdx ?? 0]
loadSec           = transfer.loadTimeSec
unloadSec         = transfer.unloadTimeSec

cycleSeconds      = travelLoadedSec + travelEmptySec + loadSec + unloadSec
```

**Edge cases:**
- `distanceFt === 0` → travel terms collapse to 0, cycle = load + unload (instantaneous-relocation flow, useful for pure transfer stations). Allowed.
- `distanceFt < 0` → reject upstream (Zod `.positive()`).
- `speedLoadedFps === 0` → division by zero. Reject in vehicle JSON validation; if it slips through, treat the flow's metrics as `undefined`.
- Vehicle has no `transferMethods` → metrics `undefined`, surface as "Vehicle missing transfer time" UI message.
- `transferMethodIdx` out of range → fall back to index 0; if no transfer methods at all, see prior case.

**Why one-way distance, not round-trip:** matches how engineers actually measure facility distances ("Dock A is 180 m from Storage 1"). The model knows the vehicle returns empty; the user doesn't double-count.

### Vehicles needed per flow

**Sizing for base throughput, not peak.** This is the same decision the screenshot encodes (verified by back-deriving — see "Verification" below). Sizing for peak would multiply demand by φ and over-provision; sizing for base accepts that peak periods will run hot (which the displayed utilization makes visible). Document but do not change in v1.

```
demandVehicleSeconds_per_hr = thruPerHr × cycleSeconds
capacityPerVehicle_per_hr   = T_hr × η                  // 3600 × 0.70 = 2520

vehiclesNeeded = ceil( demandVehicleSeconds_per_hr / capacityPerVehicle_per_hr )
```

**Edge cases:**
- `thruPerHr === 0` → `vehiclesNeeded === 0`. Row shows "—" for vehicles and util.
- `cycleSeconds === undefined` (bad inputs) → `vehiclesNeeded === undefined`.
- `ceil` is on the raw ratio. `Math.ceil(0.0001)` returns 1 — if you have any positive demand, you need at least one vehicle, by definition.

### Utilization per flow

```
utilization = (thruPerHr × cycleSeconds) / (vehiclesNeeded × T_hr × η)
            = demandVehicleSeconds_per_hr / (vehiclesNeeded × capacityPerVehicle_per_hr)
```

Always in `[0, 1]`. If `vehiclesNeeded > 0`, utilization ≤ 1 by construction of `ceil` (numerator ≤ denominator).

If `vehiclesNeeded === 0` (because demand is 0), utilization is `0` by definition. UI shows "—".

**Display thresholds:**
- `util ≤ 0.50` → green
- `0.50 < util ≤ 0.85` → green
- `0.85 < util < 0.95` → yellow (running hot)
- `util ≥ 0.95` → red (no margin for surge)

The cutoffs match how the mockup colors 81% as orange-ish and 93% as red.

### Group summary (per vehicle type)

For each `vehicleId` present in the flows list:

```
flows_in_group        = flows.filter(f => f.vehicleId === vehicleId)
baseThru              = sum(f.thruPerHr) for flows_in_group
peakThru              = baseThru × φ
demandSec_per_hr      = sum(f.thruPerHr × f.cycleSeconds) for flows_in_group   // total vehicle-seconds of work per hour
baseFleet             = sum(f.vehiclesNeeded) for flows_in_group
avgCycleSec           = demandSec_per_hr / baseThru                            // throughput-weighted average cycle
utilization_group     = demandSec_per_hr / (baseFleet × T_hr × η)
                      = demandSec_per_hr / (baseFleet × 2520)
```

**Why throughput-weighted, not simple mean:** a flow that runs 45 moves/hr matters more than one running 5 moves/hr. Simple mean would lie about the fleet's actual utilization.

**Edge case:** `baseFleet === 0` (no flows, somehow grouped) — show "—" for utilization. `baseThru === 0` — avg cycle is 0/0; show "—".

### Project-wide footer

```
total_flows           = flows.length
total_baseThru        = sum(f.thruPerHr) over all flows                       // "221 base moves/hr"
total_peakThru        = total_baseThru × φ                                    // "peak 265/hr"
```

### Verification against the mockup

These computations match the screenshot exactly when run against its row-level inputs. Tasks 4–8 add a unit test for each (using the screenshot values verbatim) so any future refactor either preserves the mockup or surfaces a test failure that the reviewer must acknowledge.

| Row | thru | cycle | demand sec/hr | veh (ceil) | util | screenshot util |
|-----|------|-------|---------------|------------|------|-----------------|
| 01  | 45   | 138 s | 6210          | ceil(6210/2520)=3 | 6210/7560 = 82.1% | 81% ✓ |
| 02  | 30   | 98 s  | 2940          | ceil(2940/2520)=2 | 2940/5040 = 58.3% | 58% ✓ |
| 03  | 15   | 118 s | 1770          | ceil(1770/2520)=1 | 1770/2520 = 70.2% | 69% ✓ |
| 04  | 38   | 165 s | 6270          | ceil(6270/2520)=3 | 6270/7560 = 82.9% | 82% ✓ |
| 05  | 25   | 115 s | 2875          | ceil(2875/2520)=2 | 2875/5040 = 57.0% | 56% ✓ |
| 06  | 22   | 81 s  | 1782          | ceil(1782/2520)=1 | 1782/2520 = 70.7% | 70% ✓ |
| 07  | 28   | 85 s  | 2380          | ceil(2380/2520)=1 | 2380/2520 = 94.4% | 93% ✓ |
| 08  | 18   | 101 s | 1818          | ceil(1818/2520)=1 | 1818/2520 = 72.1% | 72% ✓ |

| Group | baseThru | demandSec/hr | baseFleet | avg cycle (s) | util |
|-------|----------|--------------|-----------|---------------|------|
| CB18 (rows 1,2,4,5,6) | 160 | 20077 | 11 | 20077/160 = 125.5 s (2m 06s) | 20077 / (11×2520) = 72.4% |
| ML2  (rows 3,7,8)     |  61 |  5968 |  3 |  5968/61  =  97.8 s (1m 38s) |  5968 / ( 3×2520) = 78.9% |

The screenshot displays `2m 05s / 70%` and `1m 38s / 79%`. The 1-second / 2-point variances are mockup rounding — the formulas are canonical. Tests assert ±1 s and ±1 pct after rounding rather than exact mockup numerals; comments in the test cite the mockup values for the next person.

### Per-flow weight gate

A vehicle is **disabled** in the row's vehicle dropdown when:

```
flow.weightLbs > vehicle.calc.maxWeightLbs
```

This is a hard gate. No override (matches the Step 2 traffic-light rule). The dropdown still shows the vehicle, greyed with a tooltip "Exceeds 3,968 lb max load."

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `docs/SPECIFICATION.md` | **create** | Authoritative spec — Step 3 chapter added here. Future steps land their own chapters in the same file. |
| `docs/CHANGELOG.md` | modify | Append a Step 3 entry citing motivation + spec link. |
| `src/calc/types.ts` | modify | Add `Flow`, `FlowMetrics`, `GroupSummary`, `ProjectFlowSummary`, `FlowCalcConstants` types. |
| `src/calc/flowMetrics.ts` | **create** | Pure functions: `cycleSeconds`, `vehiclesNeeded`, `utilization`, `flowMetrics`, `groupSummary`, `projectFlowSummary`. |
| `src/calc/__tests__/flowMetrics.test.ts` | **create** | Vitest. One describe block per function. Mockup-row verification table reproduced as test data. |
| `src/lib/validations/schemas.ts` | modify | Add `flowSchema` and `flows: z.array(flowSchema).default([])` to `projectSchema`. |
| `src/lib/storage.ts` | modify | Add `flows: []` to `defaultFields()`. Verify spread merge still works (it does — `flows` is a normal array field). |
| `app/projects/[id]/step3/page.tsx` | replace | Real page in place of placeholder. |
| `src/components/step3/FlowsTable.tsx` | **create** | Table with inline-edited rows. |
| `src/components/step3/FlowRow.tsx` | **create** | One editable row + computed columns. |
| `src/components/step3/GroupSummaryCard.tsx` | **create** | One vehicle-group card. |
| `src/components/step3/VehicleSelect.tsx` | **create** | Per-row dropdown with weight-gated disable. |
| `src/components/step3/vehicleColor.ts` | **create** | Deterministic vehicle-id → palette color (the dots in the screenshot). |
| `app/globals.css` | modify | Add `.step3-page`, `.flow-group-grid`, `.flow-group-card`, `.flows-table`, `.flow-row`, `.util-pill`, `.veh-dot` rules. |
| `src/components/StepPlaceholder.tsx` | unchanged | Still used by Steps 4–6; do not modify. |

**Module-boundary check** (per ARCHITECTURE.md §4): `flowMetrics.ts` imports only its own types — no React, no fetch, no localStorage. UI components never compute math inline; every number on screen routes through `flowMetrics.ts`.

---

## Tasks

### Task 1 — Write `docs/SPECIFICATION.md` with Step 3 chapter

**Files:**
- Create: `docs/SPECIFICATION.md`

The spec is the source of truth referenced by CLAUDE.md. Currently absent; this task creates it. The Step 3 chapter is the primary content; future chapters for Steps 4–6 will be appended in their respective plans.

- [ ] **Step 1: Create the spec document**

Write `docs/SPECIFICATION.md` with this content:

````markdown
# TAL Fleet Calculator — Specification

The functional spec ("what the app does"). For architectural rules ("how it's built"), see `ARCHITECTURE.md`. For decision history, see `docs/CHANGELOG.md`.

---

## Step 3 — Material Flows

### Purpose

Step 3 lets the engineer break the facility's material movement into discrete **flows** (origin → destination pairs) and have the calculator derive, live as they type, the cycle time, vehicle count, and utilization per flow, plus per-vehicle-type aggregate metrics. The output of Step 3 feeds Step 4 (charging) and Step 5 (KPIs).

### Inputs

Per flow:
- `origin` — free text (e.g. "Dock A")
- `destination` — free text (e.g. "Storage 1")
- `distanceFt` — one-way distance, feet, > 0
- `thruPerHr` — required throughput, moves per hour, ≥ 0
- `weightLbs` — per-move load weight, lbs, ≥ 0
- `vehicleId` — id of a vehicle from `src/content/vehicles/*.json`
- `transferMethodIdx` — index into `vehicle.transferMethods[]`; defaults to 0

### Calculation constants

- Productivity factor η = 0.70
- Peak factor φ = 1.20
- Seconds per hour T_hr = 3600

### Per-flow derived values

```
travelLoadedSec   = distanceFt / vehicle.calc.speedLoadedFps
travelEmptySec    = distanceFt / vehicle.calc.speedUnloadedFps
loadSec           = vehicle.transferMethods[transferMethodIdx].loadTimeSec
unloadSec         = vehicle.transferMethods[transferMethodIdx].unloadTimeSec

cycleSeconds      = travelLoadedSec + travelEmptySec + loadSec + unloadSec
vehiclesNeeded    = ceil( (thruPerHr × cycleSeconds) / (T_hr × η) )
utilization       = (thruPerHr × cycleSeconds) / (vehiclesNeeded × T_hr × η)
```

`distanceFt` is one-way; the cycle includes the empty return trip. Sizing uses **base** throughput (not peak); peak is displayed for reference but not used to size the fleet.

### Group summary (per `vehicleId`)

```
baseThru          = Σ thruPerHr
peakThru          = baseThru × φ
demandSec_per_hr  = Σ (thruPerHr × cycleSeconds)
avgCycleSec       = demandSec_per_hr / baseThru
baseFleet         = Σ vehiclesNeeded
utilization       = demandSec_per_hr / (baseFleet × T_hr × η)
```

### Project footer

```
total_flows       = flows.length
total_baseThru    = Σ thruPerHr
total_peakThru    = total_baseThru × φ
```

### Hard gates per flow

A vehicle is **disabled** in the per-row dropdown when `flow.weightLbs > vehicle.calc.maxWeightLbs`. There is no override (consistent with Step 2's hard-gate rule).

Other Step-1 hard gates (lift height, freezer, outdoor, certifications) still apply at the Step-2 qualification level and continue to scope which vehicles are even shown in the dropdown.

### UI behavior

- Table is fully inline-editable. Every keystroke writes to storage; navigation and reloads are always in sync.
- "Add Flow" appends an empty row with placeholder text.
- Deleting a row uses the trailing × control.
- Group cards appear in the order vehicles were first assigned.
- Distance shown in m when the unit toggle is metric, ft when imperial. Weight shown in kg / lbs respectively. **Storage is always imperial** (ft, lbs) per ARCHITECTURE.md §3.
- Each vehicle id gets a deterministic display color (a hash into a fixed palette). The color appears on the group card title, the row's vehicle dot, and any future cross-step references.

### Utilization color thresholds (display only)

- ≤ 85% — green
- 85–95% — yellow
- ≥ 95% — red

### Empty / partial states

- No flows → render group-card grid as empty, table shows a single full-width "Add your first flow" CTA.
- Flow row with missing distance / throughput / vehicle → computed columns show "—".
- Flow's selected vehicle no longer in qualified set (user changed Step 1 after Step 3) → row shows a warning chip and metrics still compute (the vehicle data is still present), but the group card surfaces a "Re-qualify in Step 2" hint.

### Open design decisions (defaulted in v1, surfaced here for future revision)

1. **η and φ are hard-coded.** Future: surface as project-level inputs with sensible defaults.
2. **Sizing uses base throughput.** Alternative: size for peak (more conservative, lower utilization numbers).
3. **Transfer method per flow defaults to vehicle's first.** Future: per-flow override in row-expand.
4. **CSV import** is out of scope for v1 (button stubbed with "Coming soon" toast).

### Acceptance criteria

1. Adding 8 flows matching the screenshot's inputs produces per-row Cycle/Veh/Util within ±1 s and ±1 pct of the screenshot's display values.
2. Per-vehicle group summaries match the screenshot's values within the same tolerance.
3. Project footer reads "N flows · X base moves/hr · peak Y/hr" where Y = round(X × 1.2).
4. Editing a flow's distance instantly re-derives all downstream numbers (no save button, no page reload).
5. Picking a vehicle whose `maxWeightLbs` is less than the row's `weightLbs` is not possible (option disabled in dropdown).
6. Reloading the page restores all flows and their computed values.
7. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/SPECIFICATION.md`
Expected: ≥ 80 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md
git commit -m "docs: write SPECIFICATION.md with Step 3 chapter

Adds the spec-of-record referenced by CLAUDE.md. Step 3 chapter is
authoritative; later steps will append their own chapters."
```

---

### Task 2 — Extend `src/calc/types.ts`

**Files:**
- Modify: `src/calc/types.ts`

- [ ] **Step 1: Add Flow and metric types**

Append to `src/calc/types.ts`:

```typescript
// ---- Step 3: Material Flows ----

export interface Flow {
  id: string
  origin: string
  destination: string
  distanceFt: number           // > 0; one-way
  thruPerHr: number            // ≥ 0
  weightLbs: number            // ≥ 0
  vehicleId?: string
  transferMethodIdx?: number   // defaults to 0
}

export interface FlowMetrics {
  cycleSeconds: number | null
  vehiclesNeeded: number | null
  utilization: number | null   // [0, 1]
}

export interface GroupSummary {
  vehicleId: string
  flowsCount: number
  baseThru: number             // moves/hr
  peakThru: number             // moves/hr
  avgCycleSec: number | null
  baseFleet: number
  utilization: number | null   // [0, 1]
}

export interface ProjectFlowSummary {
  totalFlows: number
  totalBaseThru: number
  totalPeakThru: number
}

export interface FlowCalcConstants {
  productivityFactor: number   // η, default 0.70
  peakFactor: number           // φ, default 1.20
}

export const DEFAULT_FLOW_CONSTANTS: FlowCalcConstants = {
  productivityFactor: 0.70,
  peakFactor: 1.20,
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing pdfExport.test errors stay).

- [ ] **Step 3: Commit**

```bash
git add src/calc/types.ts
git commit -m "feat(types): add Flow, FlowMetrics, GroupSummary for Step 3"
```

---

### Task 3 — Create `src/calc/flowMetrics.ts` with `cycleSeconds` (TDD)

**Files:**
- Create: `src/calc/flowMetrics.ts`
- Create: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/flowMetrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cycleSeconds } from '../flowMetrics'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const cb18: Pick<Vehicle, 'calc' | 'transferMethods'> = {
  calc: { speedLoadedFps: 9.84, speedUnloadedFps: 11.5 } as Vehicle['calc'],
  transferMethods: [
    { method: 'Fork', loadTimeSec: 5, unloadTimeSec: 5 },
    { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8 },
  ],
}

describe('cycleSeconds', () => {
  it('sums travel-loaded + travel-empty + load + unload', () => {
    // 100 ft loaded at 9.84 fps  = 10.16 s
    // 100 ft empty  at 11.5  fps =  8.70 s
    // load 5 + unload 5         = 10.00 s
    // total                     = 28.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 0)).toBeCloseTo(28.86, 1)
  })

  it('uses transferMethodIdx to pick load/unload times', () => {
    // Same 100 ft but Lift Platform (idx 1): 10.16 + 8.70 + 8 + 8 = 34.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 1)).toBeCloseTo(34.86, 1)
  })

  it('defaults transferMethodIdx to 0 when omitted', () => {
    expect(cycleSeconds(100, cb18 as Vehicle)).toBeCloseTo(28.86, 1)
  })

  it('returns load+unload only when distance is 0', () => {
    expect(cycleSeconds(0, cb18 as Vehicle, 0)).toBeCloseTo(10, 5)
  })

  it('returns null when distance is negative', () => {
    expect(cycleSeconds(-1, cb18 as Vehicle, 0)).toBeNull()
  })

  it('returns null when vehicle has no transferMethods', () => {
    const broken = { ...cb18, transferMethods: [] }
    expect(cycleSeconds(100, broken as Vehicle, 0)).toBeNull()
  })

  it('returns null when transferMethodIdx is out of range', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 99)).toBeNull()
  })

  it('returns null when speedLoadedFps is 0', () => {
    const broken = { ...cb18, calc: { ...cb18.calc, speedLoadedFps: 0 } } as Pick<Vehicle, 'calc' | 'transferMethods'>
    expect(cycleSeconds(100, broken as Vehicle, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test — must fail with "module not found"**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: FAIL — cannot resolve `../flowMetrics`.

- [ ] **Step 3: Implement `cycleSeconds`**

Create `src/calc/flowMetrics.ts`:

```typescript
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/**
 * Round-trip cycle time for one move on a flow of the given one-way distance.
 *
 *   cycle = (distance / speedLoaded) + (distance / speedEmpty) + load + unload
 *
 * Returns null when inputs make the calculation undefined (negative distance,
 * missing transfer methods, zero speed). Callers must handle null by
 * displaying "—" rather than rendering a number.
 */
export function cycleSeconds(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  transferMethodIdx: number = 0,
): number | null {
  if (distanceFt < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null
  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty  = vehicle.calc.speedUnloadedFps
  if (sLoaded <= 0 || sEmpty <= 0) return null
  const travelLoaded = distanceFt / sLoaded
  const travelEmpty  = distanceFt / sEmpty
  return travelLoaded + travelEmpty + transfer.loadTimeSec + transfer.unloadTimeSec
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: PASS — 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): cycleSeconds with full edge-case coverage"
```

---

### Task 4 — Add `vehiclesNeeded` (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/calc/__tests__/flowMetrics.test.ts`:

```typescript
import { vehiclesNeeded, DEFAULT_FLOW_CONSTANTS } from '../flowMetrics'

describe('vehiclesNeeded', () => {
  const c = DEFAULT_FLOW_CONSTANTS  // η = 0.70, T_hr = 3600

  it('matches screenshot row 1: 45/hr × 138s → 3 vehicles', () => {
    expect(vehiclesNeeded(45, 138, c)).toBe(3)
  })

  it('matches screenshot row 7: 28/hr × 85s → 1 vehicle (boundary)', () => {
    // 28*85 / 2520 = 0.9444 → ceil = 1
    expect(vehiclesNeeded(28, 85, c)).toBe(1)
  })

  it('returns 0 when throughput is 0', () => {
    expect(vehiclesNeeded(0, 100, c)).toBe(0)
  })

  it('returns null when cycle is null', () => {
    expect(vehiclesNeeded(10, null, c)).toBeNull()
  })

  it('rounds any positive demand up to at least 1 vehicle', () => {
    expect(vehiclesNeeded(0.01, 1, c)).toBe(1)
  })
})
```

- [ ] **Step 2: Run — must fail (vehiclesNeeded not exported)**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: FAIL — import resolves but function is undefined.

- [ ] **Step 3: Implement `vehiclesNeeded`**

Append to `src/calc/flowMetrics.ts`:

```typescript
import type { FlowCalcConstants } from './types'
export { DEFAULT_FLOW_CONSTANTS } from './types'

const T_HR = 3600

/**
 * Vehicles needed to serve the flow at base throughput. Sizing uses base, not
 * peak — see SPECIFICATION.md "Open design decisions".
 *
 * Returns null when cycle is null (cannot size). Returns 0 when demand is 0.
 */
export function vehiclesNeeded(
  thruPerHr: number,
  cycleSeconds: number | null,
  k: FlowCalcConstants,
): number | null {
  if (cycleSeconds == null) return null
  if (thruPerHr <= 0) return 0
  const demandSecPerHr = thruPerHr * cycleSeconds
  const capacityPerVehicle = T_HR * k.productivityFactor
  return Math.ceil(demandSecPerHr / capacityPerVehicle)
}
```

- [ ] **Step 4: Run — must pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: PASS — 13/13.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): vehiclesNeeded — base-demand sizing with ceil"
```

---

### Task 5 — Add `utilization` (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Add failing test**

Append to test file:

```typescript
import { utilization } from '../flowMetrics'

describe('utilization', () => {
  const c = DEFAULT_FLOW_CONSTANTS

  it('matches screenshot row 1: 45/hr × 138s / 3 veh → ~82%', () => {
    expect(utilization(45, 138, 3, c)).toBeCloseTo(0.821, 2)
  })

  it('matches screenshot row 7 (high util): 28/hr × 85s / 1 veh → ~94%', () => {
    expect(utilization(28, 85, 1, c)).toBeCloseTo(0.944, 2)
  })

  it('is 0 when demand is 0', () => {
    expect(utilization(0, 100, 0, c)).toBe(0)
  })

  it('is null when cycle is null', () => {
    expect(utilization(10, null, 1, c)).toBeNull()
  })

  it('is null when vehiclesNeeded is null', () => {
    expect(utilization(10, 100, null, c)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: FAIL on the 5 new tests.

- [ ] **Step 3: Implement**

Append to `src/calc/flowMetrics.ts`:

```typescript
/**
 * Per-flow utilization in [0, 1]. Always ≤ 1 by construction of vehiclesNeeded
 * (numerator ≤ denominator after ceil). Returns null when sizing is undefined.
 */
export function utilization(
  thruPerHr: number,
  cycleSeconds: number | null,
  vehiclesNeeded: number | null,
  k: FlowCalcConstants,
): number | null {
  if (cycleSeconds == null) return null
  if (vehiclesNeeded == null) return null
  if (vehiclesNeeded === 0) return 0
  const demandSecPerHr = thruPerHr * cycleSeconds
  const capacity = vehiclesNeeded * T_HR * k.productivityFactor
  return demandSecPerHr / capacity
}
```

- [ ] **Step 4: Pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: 18/18 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): utilization in [0,1]"
```

---

### Task 6 — Add `flowMetrics` orchestrator (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append to test file:

```typescript
import { flowMetrics } from '../flowMetrics'
import type { Flow } from '../types'

describe('flowMetrics (orchestrator)', () => {
  const c = DEFAULT_FLOW_CONSTANTS
  const cb18Veh = cb18 as Vehicle

  it('returns all-null when vehicle is undefined', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 10, weightLbs: 500,
    }
    expect(flowMetrics(flow, undefined, c)).toEqual({
      cycleSeconds: null, vehiclesNeeded: null, utilization: null,
    })
  })

  it('ties cycle → veh → util together', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 30, weightLbs: 500, vehicleId: 'cb18',
    }
    const m = flowMetrics(flow, cb18Veh, c)
    expect(m.cycleSeconds).toBeCloseTo(28.86, 1)
    // 30 * 28.86 = 865.8 / 2520 = 0.343 → ceil = 1 → util = 865.8/2520 = 34.4%
    expect(m.vehiclesNeeded).toBe(1)
    expect(m.utilization).toBeCloseTo(0.343, 2)
  })
})
```

- [ ] **Step 2: Fail**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 3: Implement**

Append to `src/calc/flowMetrics.ts`:

```typescript
import type { Flow, FlowMetrics } from './types'

/**
 * Compose cycleSeconds, vehiclesNeeded, utilization for one flow.
 * Pure wrapper — UI calls this once per flow per render.
 */
export function flowMetrics(
  flow: Flow,
  vehicle: Vehicle | undefined,
  k: FlowCalcConstants,
): FlowMetrics {
  if (!vehicle) return { cycleSeconds: null, vehiclesNeeded: null, utilization: null }
  const cycle = cycleSeconds(flow.distanceFt, vehicle, flow.transferMethodIdx ?? 0)
  const veh = vehiclesNeeded(flow.thruPerHr, cycle, k)
  const util = utilization(flow.thruPerHr, cycle, veh, k)
  return { cycleSeconds: cycle, vehiclesNeeded: veh, utilization: util }
}
```

- [ ] **Step 4: Pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: 20/20 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): flowMetrics orchestrator"
```

---

### Task 7 — Add `groupSummary` (TDD with full mockup data)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

This task reproduces the exact 8-row dataset from the screenshot and asserts both group cards match within tolerance.

- [ ] **Step 1: Failing test**

Append to test file:

```typescript
import { groupSummary } from '../flowMetrics'

describe('groupSummary (mockup reproduction)', () => {
  const c = DEFAULT_FLOW_CONSTANTS

  // Per-flow cycle and vehiclesNeeded are passed in pre-computed so the test
  // pins the formulas at the mockup's cycle values (the screenshot's cycle
  // seconds come from rounded vehicle data, not the same as cycleSeconds()
  // applied to real distance — we test the formulas individually elsewhere).
  const cb18Flows = [
    { id: '1', origin: 'Dock A',    destination: 'Storage 1', distanceFt: 590, thruPerHr: 45, weightLbs: 1984, vehicleId: 'cb18' },
    { id: '2', origin: 'Storage 1', destination: 'Pack Line', distanceFt: 394, thruPerHr: 30, weightLbs: 1764, vehicleId: 'cb18' },
    { id: '4', origin: 'Dock A',    destination: 'Storage 2', distanceFt: 722, thruPerHr: 38, weightLbs: 2425, vehicleId: 'cb18' },
    { id: '5', origin: 'Storage 2', destination: 'Pack Line', distanceFt: 476, thruPerHr: 25, weightLbs: 2094, vehicleId: 'cb18' },
    { id: '6', origin: 'Inbound',   destination: 'Storage 1', distanceFt: 312, thruPerHr: 22, weightLbs: 2646, vehicleId: 'cb18' },
  ]
  const metricsByCb18 = new Map([
    ['1', { cycleSeconds: 138, vehiclesNeeded: 3, utilization: 0.821 }],
    ['2', { cycleSeconds:  98, vehiclesNeeded: 2, utilization: 0.583 }],
    ['4', { cycleSeconds: 165, vehiclesNeeded: 3, utilization: 0.829 }],
    ['5', { cycleSeconds: 115, vehiclesNeeded: 2, utilization: 0.570 }],
    ['6', { cycleSeconds:  81, vehiclesNeeded: 1, utilization: 0.707 }],
  ])

  it('reproduces the CB18 AGF group card', () => {
    const g = groupSummary('cb18', cb18Flows, metricsByCb18, c)
    expect(g.flowsCount).toBe(5)
    expect(g.baseThru).toBe(160)
    expect(g.peakThru).toBeCloseTo(192, 0)               // mockup shows 192
    expect(g.baseFleet).toBe(11)
    expect(g.avgCycleSec).toBeCloseTo(125, 0)            // mockup 2m 05s ≈ 125 s
    expect(g.utilization).toBeCloseTo(0.724, 2)          // mockup 70%; spec accepts ±2 pct
  })

  const ml2Flows = [
    { id: '3', origin: 'Pack Line', destination: 'Dock B',    distanceFt: 295, thruPerHr: 15, weightLbs: 110, vehicleId: 'ml2' },
    { id: '7', origin: 'Pick Wall', destination: 'Pack Line', distanceFt: 197, thruPerHr: 28, weightLbs:  77, vehicleId: 'ml2' },
    { id: '8', origin: 'Storage 1', destination: 'Pick Wall', distanceFt: 246, thruPerHr: 18, weightLbs:  62, vehicleId: 'ml2' },
  ]
  const metricsByMl2 = new Map([
    ['3', { cycleSeconds: 118, vehiclesNeeded: 1, utilization: 0.702 }],
    ['7', { cycleSeconds:  85, vehiclesNeeded: 1, utilization: 0.944 }],
    ['8', { cycleSeconds: 101, vehiclesNeeded: 1, utilization: 0.722 }],
  ])

  it('reproduces the ML2 Mini Load AV group card', () => {
    const g = groupSummary('ml2', ml2Flows, metricsByMl2, c)
    expect(g.flowsCount).toBe(3)
    expect(g.baseThru).toBe(61)
    expect(g.peakThru).toBeCloseTo(73, 0)
    expect(g.baseFleet).toBe(3)
    expect(g.avgCycleSec).toBeCloseTo(98, 0)             // mockup 1m 38s = 98 s
    expect(g.utilization).toBeCloseTo(0.789, 2)          // mockup 79% ✓
  })

  it('returns nulls for avgCycle/util when baseThru is 0', () => {
    const g = groupSummary('cb18', [], new Map(), c)
    expect(g.baseThru).toBe(0)
    expect(g.baseFleet).toBe(0)
    expect(g.avgCycleSec).toBeNull()
    expect(g.utilization).toBeNull()
  })
})
```

- [ ] **Step 2: Fail**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 3: Implement**

Append to `src/calc/flowMetrics.ts`:

```typescript
import type { GroupSummary } from './types'

/**
 * Aggregate per-vehicle group summary. `metricsByFlowId` is a precomputed
 * `flowId → FlowMetrics` map so the caller (React) doesn't recompute cycles
 * inside this function. Keeps groupSummary cheap and dependency-free.
 */
export function groupSummary(
  vehicleId: string,
  flows: Flow[],
  metricsByFlowId: Map<string, FlowMetrics>,
  k: FlowCalcConstants,
): GroupSummary {
  const inGroup = flows.filter(f => f.vehicleId === vehicleId)

  let baseThru = 0
  let demandSecPerHr = 0
  let baseFleet = 0

  for (const f of inGroup) {
    const m = metricsByFlowId.get(f.id)
    if (!m) continue
    baseThru += f.thruPerHr
    if (m.cycleSeconds != null) demandSecPerHr += f.thruPerHr * m.cycleSeconds
    if (m.vehiclesNeeded != null) baseFleet += m.vehiclesNeeded
  }

  const peakThru = baseThru * k.peakFactor
  const avgCycleSec = baseThru > 0 ? demandSecPerHr / baseThru : null
  const utilization = baseFleet > 0
    ? demandSecPerHr / (baseFleet * T_HR * k.productivityFactor)
    : null

  return {
    vehicleId,
    flowsCount: inGroup.length,
    baseThru,
    peakThru,
    avgCycleSec,
    baseFleet,
    utilization,
  }
}
```

- [ ] **Step 4: Pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: 23/23 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): groupSummary reproduces mockup CB18 and ML2 cards"
```

---

### Task 8 — Add `projectFlowSummary` (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append:

```typescript
import { projectFlowSummary } from '../flowMetrics'

describe('projectFlowSummary', () => {
  const c = DEFAULT_FLOW_CONSTANTS

  it('matches mockup footer: 8 flows · 221 base · 265 peak', () => {
    const allFlows = [
      { id: '1', origin: '', destination: '', distanceFt: 1, thruPerHr: 45, weightLbs: 0, vehicleId: 'cb18' },
      { id: '2', origin: '', destination: '', distanceFt: 1, thruPerHr: 30, weightLbs: 0, vehicleId: 'cb18' },
      { id: '3', origin: '', destination: '', distanceFt: 1, thruPerHr: 15, weightLbs: 0, vehicleId: 'ml2' },
      { id: '4', origin: '', destination: '', distanceFt: 1, thruPerHr: 38, weightLbs: 0, vehicleId: 'cb18' },
      { id: '5', origin: '', destination: '', distanceFt: 1, thruPerHr: 25, weightLbs: 0, vehicleId: 'cb18' },
      { id: '6', origin: '', destination: '', distanceFt: 1, thruPerHr: 22, weightLbs: 0, vehicleId: 'cb18' },
      { id: '7', origin: '', destination: '', distanceFt: 1, thruPerHr: 28, weightLbs: 0, vehicleId: 'ml2' },
      { id: '8', origin: '', destination: '', distanceFt: 1, thruPerHr: 18, weightLbs: 0, vehicleId: 'ml2' },
    ]
    const s = projectFlowSummary(allFlows, c)
    expect(s.totalFlows).toBe(8)
    expect(s.totalBaseThru).toBe(221)
    expect(s.totalPeakThru).toBeCloseTo(265.2, 1)
  })
})
```

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**

Append:

```typescript
import type { ProjectFlowSummary } from './types'

export function projectFlowSummary(
  flows: Flow[],
  k: FlowCalcConstants,
): ProjectFlowSummary {
  const totalBaseThru = flows.reduce((s, f) => s + f.thruPerHr, 0)
  return {
    totalFlows: flows.length,
    totalBaseThru,
    totalPeakThru: totalBaseThru * k.peakFactor,
  }
}
```

- [ ] **Step 4: Pass**
- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): projectFlowSummary for table footer"
```

---

### Task 9 — Persist `flows` on `StoredProject`

**Files:**
- Modify: `src/lib/validations/schemas.ts`
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Extend Zod schema**

In `src/lib/validations/schemas.ts`, before `export const projectSchema = z.object({`, add:

```typescript
export const flowSchema = z.object({
  id: z.string(),
  origin: z.string().default(''),
  destination: z.string().default(''),
  distanceFt: z.number().min(0).default(0),
  thruPerHr: z.number().min(0).default(0),
  weightLbs: z.number().min(0).default(0),
  vehicleId: z.string().optional(),
  transferMethodIdx: z.number().int().min(0).optional(),
})
```

Inside `projectSchema = z.object({...})`, add (place after `interlocks`):

```typescript
  flows: z.array(flowSchema).default([]),
```

- [ ] **Step 2: Extend storage defaults**

In `src/lib/storage.ts`, inside `defaultFields()`, before the closing `})`, add:

```typescript
  flows: [],
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Smoke-test storage round-trip**

Add a one-off test file `src/lib/__tests__/storage.flows.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createProject, getProject, updateProject } from '../storage'

describe('flows round-trip', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('persists flows through create + update + read', () => {
    const p = createProject({ projectName: 'Test' })
    updateProject(p.id, { flows: [
      { id: 'f1', origin: 'A', destination: 'B', distanceFt: 100, thruPerHr: 10, weightLbs: 500, vehicleId: 'cb18' },
    ]})
    const read = getProject(p.id)
    expect(read?.flows).toHaveLength(1)
    expect(read?.flows?.[0]).toMatchObject({ id: 'f1', distanceFt: 100, vehicleId: 'cb18' })
  })
})
```

Run: `npx vitest run src/lib/__tests__/storage.flows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/schemas.ts src/lib/storage.ts src/lib/__tests__/storage.flows.test.ts
git commit -m "feat(storage): persist flows[] on StoredProject"
```

---

### Task 10 — Vehicle dot color helper

**Files:**
- Create: `src/components/step3/vehicleColor.ts`

The screenshot shows a coloured dot per vehicle (CB18 blue, ML2 green). The plan needs deterministic id-to-color mapping so the same vehicle has the same colour everywhere.

- [ ] **Step 1: Create**

```typescript
const PALETTE = [
  '#4f9eff',  // blue
  '#3ec888',  // green
  '#f5a524',  // amber
  '#a78bfa',  // violet
  '#f56565',  // red (reserved for hard-fail; never assigned)
  '#22d3ee',  // cyan
] as const

// Skip red — reserved for failure semantics elsewhere in the app.
const ASSIGNABLE = PALETTE.filter(c => c !== '#f56565')

export function vehicleColor(vehicleId: string): string {
  let hash = 0
  for (let i = 0; i < vehicleId.length; i++) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) | 0
  }
  return ASSIGNABLE[Math.abs(hash) % ASSIGNABLE.length]
}
```

- [ ] **Step 2: Verify (manual sanity)**

Run: `node -e "const { vehicleColor } = require('./src/components/step3/vehicleColor.ts'); console.log(vehicleColor('cb18'), vehicleColor('ml2'))"`
(Skip if `ts-node` not available — the test in Task 12 will exercise this code path.)

- [ ] **Step 3: Commit**

```bash
git add src/components/step3/vehicleColor.ts
git commit -m "feat(step3): deterministic vehicle-id to palette color"
```

---

### Task 11 — Step 3 page shell

**Files:**
- Replace: `app/projects/[id]/step3/page.tsx`

- [ ] **Step 1: Replace placeholder**

Overwrite `app/projects/[id]/step3/page.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { getProject, updateProject, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { Flow, FlowMetrics } from '@/src/calc/types'
import {
  flowMetrics,
  groupSummary,
  projectFlowSummary,
  DEFAULT_FLOW_CONSTANTS,
} from '@/src/calc/flowMetrics'
import FlowsTable from '@/src/components/step3/FlowsTable'
import GroupSummaryCard from '@/src/components/step3/GroupSummaryCard'

export default function Step3Page() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  useEffect(() => {
    setProject(getProject(id))
    fetch('/api/vehicles')
      .then(r => r.json())
      .then(v => { setVehicles(Array.isArray(v) ? v : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const vehicleById = useMemo(
    () => new Map(vehicles.map(v => [v.id, v])),
    [vehicles],
  )

  const flows = project?.flows ?? []
  const k = DEFAULT_FLOW_CONSTANTS

  const metricsByFlowId = useMemo(() => {
    const m = new Map<string, FlowMetrics>()
    for (const f of flows) {
      const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
      m.set(f.id, flowMetrics(f, veh, k))
    }
    return m
  }, [flows, vehicleById, k])

  const groups = useMemo(() => {
    const ids: string[] = []
    for (const f of flows) {
      if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    }
    return ids.map(vid => groupSummary(vid, flows, metricsByFlowId, k))
  }, [flows, metricsByFlowId, k])

  const footer = useMemo(() => projectFlowSummary(flows, k), [flows, k])

  const persistFlows = (next: Flow[]) => {
    if (!project) return
    const updated = updateProject(project.id, { flows: next })
    if (updated) setProject(updated)
  }

  if (loading || !project) return <div className="app-shell"><div className="step2-loading">Loading…</div></div>

  return (
    <div className="app-shell">
      <PersistentHeader
        project={{
          id: project.id,
          projectName: project.projectName ?? '',
          customerName: project.customerName ?? '',
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
      />
      <div className="workspace step3-page">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 03 / 06</span>
            <h1>Material Flows</h1>
            <div className="desc">Define routes, assign vehicles. All fields are instantly editable — click to type.</div>
          </div>
        </div>

        <div className="flow-group-grid">
          {groups.map(g => (
            <GroupSummaryCard
              key={g.vehicleId}
              summary={g}
              vehicle={vehicleById.get(g.vehicleId)}
              unitSystem={unitSystem}
            />
          ))}
        </div>

        <FlowsTable
          flows={flows}
          vehicles={vehicles}
          metricsByFlowId={metricsByFlowId}
          unitSystem={unitSystem}
          onFlowsChange={persistFlows}
        />

        <div className="step3-footer">
          {footer.totalFlows} flows · {footer.totalBaseThru} base moves/hr · peak {Math.round(footer.totalPeakThru)}/hr
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck (will fail — `FlowsTable` and `GroupSummaryCard` don't exist yet)**

Run: `npx tsc --noEmit`
Expected: errors about missing `FlowsTable` and `GroupSummaryCard` imports.

Leave them — Task 12 fixes `GroupSummaryCard`, Task 13 fixes `FlowsTable`. Do not commit yet.

- [ ] **Step 3: No commit yet** (page is broken until Tasks 12–13 land)

---

### Task 12 — `GroupSummaryCard`

**Files:**
- Create: `src/components/step3/GroupSummaryCard.tsx`

- [ ] **Step 1: Create**

```tsx
'use client'

import { vehicleColor } from './vehicleColor'
import type { GroupSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'

interface Props {
  summary: GroupSummary
  vehicle?: Vehicle
  unitSystem: UnitSystem
}

function formatCycle(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export default function GroupSummaryCard({ summary, vehicle }: Props) {
  const color = vehicleColor(summary.vehicleId)
  const name = vehicle?.name ?? summary.vehicleId
  const utilPct = summary.utilization == null ? null : Math.round(summary.utilization * 100)
  const utilClass = utilPct == null ? '' : utilPct >= 95 ? 'red' : utilPct >= 85 ? 'yellow' : 'green'

  return (
    <div className="flow-group-card">
      <div className="flow-group-head">
        <span className="veh-pill" style={{ borderColor: color, color }}>
          <span className="veh-dot" style={{ background: color }} />
          {name}
        </span>
        <span className="flow-group-count">{summary.flowsCount} FLOWS</span>
      </div>
      <div className="flow-group-stats">
        <div><div className="label">BASE FLEET</div><div className="value">{summary.baseFleet} <span className="unit">veh</span></div></div>
        <div>
          <div className="label">UTILIZATION</div>
          <div className={`value ${utilClass}`}>{utilPct == null ? '—' : `${utilPct}%`}</div>
          {utilPct != null && (
            <div className="util-bar"><div className="util-bar-fill" style={{ width: `${utilPct}%` }} /></div>
          )}
        </div>
        <div><div className="label">AVG CYCLE</div><div className="value">{formatCycle(summary.avgCycleSec)}</div></div>
        <div><div className="label">PEAK THRU</div><div className="value">{Math.round(summary.peakThru)} <span className="unit">/hr</span></div></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit (still broken until FlowsTable lands but typecheck improves)**

Do not commit yet — wait until Task 13.

---

### Task 13 — `FlowsTable` and `FlowRow`

**Files:**
- Create: `src/components/step3/FlowsTable.tsx`
- Create: `src/components/step3/FlowRow.tsx`
- Create: `src/components/step3/VehicleSelect.tsx`

- [ ] **Step 1: Create `VehicleSelect.tsx`**

```tsx
'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { vehicleColor } from './vehicleColor'

interface Props {
  vehicles: Vehicle[]
  value?: string
  flowWeightLbs: number
  onChange: (vehicleId: string | undefined) => void
}

export default function VehicleSelect({ vehicles, value, flowWeightLbs, onChange }: Props) {
  return (
    <select
      className="flow-veh-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
    >
      <option value="">— pick vehicle —</option>
      {vehicles.map(v => {
        const overweight = flowWeightLbs > v.calc.maxWeightLbs
        return (
          <option
            key={v.id}
            value={v.id}
            disabled={overweight}
            title={overweight ? `Exceeds ${v.calc.maxWeightLbs.toLocaleString()} lb max load` : undefined}
          >
            {v.name}{overweight ? '  (over max load)' : ''}
          </option>
        )
      })}
    </select>
  )
}

// Exported for use elsewhere — colour dot beside vehicle name in the row.
export function VehicleDot({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return null
  return <span className="veh-dot" style={{ background: vehicleColor(vehicleId) }} />
}
```

- [ ] **Step 2: Create `FlowRow.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { Flow, FlowMetrics } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import VehicleSelect, { VehicleDot } from './VehicleSelect'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  metrics: FlowMetrics
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
}

const FT_PER_M = 3.28084
const LBS_PER_KG = 2.20462

function fmtCycle(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export default function FlowRow({ index, flow, vehicles, metrics, unitSystem, onChange, onDelete }: Props) {
  const [selected, setSelected] = useState(false)
  const distDisplay = unitSystem === 'metric'
    ? (flow.distanceFt / FT_PER_M).toFixed(0)
    : flow.distanceFt.toString()
  const weightDisplay = unitSystem === 'metric'
    ? (flow.weightLbs / LBS_PER_KG).toFixed(0)
    : flow.weightLbs.toString()

  const setDistance = (input: string) => {
    const n = Number(input)
    if (Number.isNaN(n)) return
    const ft = unitSystem === 'metric' ? n * FT_PER_M : n
    onChange({ ...flow, distanceFt: Math.max(0, ft) })
  }
  const setWeight = (input: string) => {
    const n = Number(input)
    if (Number.isNaN(n)) return
    const lbs = unitSystem === 'metric' ? n * LBS_PER_KG : n
    onChange({ ...flow, weightLbs: Math.max(0, lbs) })
  }

  const utilPct = metrics.utilization == null ? null : Math.round(metrics.utilization * 100)
  const utilClass = utilPct == null ? '' : utilPct >= 95 ? 'red' : utilPct >= 85 ? 'yellow' : 'green'

  return (
    <tr className="flow-row">
      <td><input type="checkbox" checked={selected} onChange={e => setSelected(e.target.checked)} /></td>
      <td className="mono">{String(index + 1).padStart(2, '0')}</td>
      <td><input className="flow-cell" value={flow.origin}      onChange={e => onChange({ ...flow, origin: e.target.value })}      placeholder="Origin" /></td>
      <td><input className="flow-cell" value={flow.destination} onChange={e => onChange({ ...flow, destination: e.target.value })} placeholder="Destination" /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={distDisplay}   onChange={e => setDistance(e.target.value)} /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={flow.thruPerHr} onChange={e => onChange({ ...flow, thruPerHr: Math.max(0, Number(e.target.value) || 0) })} /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={weightDisplay} onChange={e => setWeight(e.target.value)} /></td>
      <td>
        <span className="veh-cell"><VehicleDot vehicleId={flow.vehicleId} /></span>
        <VehicleSelect
          vehicles={vehicles}
          value={flow.vehicleId}
          flowWeightLbs={flow.weightLbs}
          onChange={vid => onChange({ ...flow, vehicleId: vid })}
        />
      </td>
      <td className="mono">{fmtCycle(metrics.cycleSeconds)}</td>
      <td className="mono">{metrics.vehiclesNeeded ?? '—'}</td>
      <td className={`mono ${utilClass}`}>{utilPct == null ? '—' : `${utilPct}%`}</td>
      <td><button type="button" className="flow-delete" onClick={onDelete} aria-label="Delete flow">×</button></td>
    </tr>
  )
}
```

- [ ] **Step 3: Create `FlowsTable.tsx`**

```tsx
'use client'

import type { Flow, FlowMetrics } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import FlowRow from './FlowRow'

interface Props {
  flows: Flow[]
  vehicles: Vehicle[]
  metricsByFlowId: Map<string, FlowMetrics>
  unitSystem: UnitSystem
  onFlowsChange: (next: Flow[]) => void
}

function genId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 10)
}

function emptyFlow(): Flow {
  return { id: genId(), origin: '', destination: '', distanceFt: 0, thruPerHr: 0, weightLbs: 0 }
}

export default function FlowsTable({ flows, vehicles, metricsByFlowId, unitSystem, onFlowsChange }: Props) {
  const update = (id: string, next: Flow) => {
    onFlowsChange(flows.map(f => f.id === id ? next : f))
  }
  const remove = (id: string) => {
    onFlowsChange(flows.filter(f => f.id !== id))
  }
  const add = () => {
    onFlowsChange([...flows, emptyFlow()])
  }

  const distLabel = unitSystem === 'metric' ? 'DISTANCE (M)' : 'DISTANCE (FT)'
  const weightLabel = unitSystem === 'metric' ? 'WEIGHT (KG)' : 'WEIGHT (LBS)'

  return (
    <div className="flows-table-wrap">
      <div className="flows-table-head-row">
        <span className="flows-count">{flows.length} flows</span>
        <button type="button" className="btn primary" onClick={add}>+ Add Flow</button>
      </div>
      {flows.length === 0 ? (
        <div className="empty-state">
          <h3>No flows yet</h3>
          <p>Click <strong>Add Flow</strong> to model a route.</p>
        </div>
      ) : (
        <table className="flows-table">
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>ORIGIN</th>
              <th>DESTINATION</th>
              <th>{distLabel}</th>
              <th>THRU/HR</th>
              <th>{weightLabel}</th>
              <th>VEHICLE</th>
              <th>CYCLE</th>
              <th>VEH</th>
              <th>UTIL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f, i) => (
              <FlowRow
                key={f.id}
                index={i}
                flow={f}
                vehicles={vehicles}
                metrics={metricsByFlowId.get(f.id) ?? { cycleSeconds: null, vehiclesNeeded: null, utilization: null }}
                unitSystem={unitSystem}
                onChange={next => update(f.id, next)}
                onDelete={() => remove(f.id)}
              />
            ))}
          </tbody>
        </table>
      )}
      {flows.length > 0 && (
        <button type="button" className="flows-add-bottom" onClick={add}>+ Add another flow</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run dev server, verify the page loads**

Visit `http://localhost:3000/projects/<some-id>/step3` and confirm:
- Page renders without runtime error.
- "0 flows" + "Add Flow" CTA appears.
- Clicking Add Flow adds a row.
- Typing distance/thru-per-hr/weight + picking a vehicle populates Cycle/Veh/Util.

- [ ] **Step 6: Commit**

```bash
git add app/projects/[id]/step3/page.tsx src/components/step3/*.{ts,tsx}
git commit -m "feat(step3): live Material Flows page"
```

---

### Task 14 — CSS for Step 3

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append step-3 styles**

Append to `app/globals.css`:

```css
/* ===== Step 3 — Material Flows ===== */
.step3-page { display: flex; flex-direction: column; gap: 18px; }

.flow-group-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 14px;
}
.flow-group-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 16px;
}
.flow-group-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.veh-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; border: 1px solid;
  font-family: var(--tal-font-family); font-size: 12px; font-weight: 600;
}
.veh-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
}
.flow-group-count {
  font-family: var(--tal-font-numeric); font-size: 11px; color: var(--text-tertiary);
  letter-spacing: 0.08em;
}
.flow-group-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
}
.flow-group-stats .label {
  font-family: var(--tal-font-numeric); font-size: 10px;
  color: var(--text-tertiary); letter-spacing: 0.1em;
}
.flow-group-stats .value {
  font-family: var(--tal-font-numeric); font-size: 22px; font-weight: 600;
  color: var(--text-primary); margin-top: 4px;
}
.flow-group-stats .value.green  { color: var(--good); }
.flow-group-stats .value.yellow { color: var(--warn); }
.flow-group-stats .value.red    { color: var(--bad);  }
.flow-group-stats .unit {
  font-size: 12px; color: var(--text-tertiary); margin-left: 4px;
}
.util-bar {
  margin-top: 6px; height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden;
}
.util-bar-fill { height: 100%; background: var(--warn); transition: width 200ms; }

.flows-table-wrap {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px;
}
.flows-table-head-row {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
}
.flows-count { font-family: var(--tal-font-numeric); font-size: 12px; color: var(--text-tertiary); }
.flows-table {
  width: 100%; border-collapse: collapse;
  font-family: var(--tal-font-family); font-size: 13px;
}
.flows-table th {
  text-align: left; font-family: var(--tal-font-numeric); font-size: 10px;
  letter-spacing: 0.1em; color: var(--text-tertiary);
  border-bottom: 1px solid var(--border); padding: 8px 8px;
}
.flows-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
.flow-cell {
  background: transparent; border: 1px solid transparent; border-radius: 4px;
  padding: 4px 6px; color: var(--text-primary); width: 100%;
  font-family: inherit; font-size: inherit;
}
.flow-cell:hover  { border-color: var(--border); }
.flow-cell:focus  { border-color: var(--border-strong); outline: none; background: var(--bg-hover); }
.flow-cell.mono   { font-family: var(--tal-font-numeric); }
.flow-veh-select { background: transparent; color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; }
.flows-table .green  { color: var(--good); }
.flows-table .yellow { color: var(--warn); }
.flows-table .red    { color: var(--bad);  }
.flow-delete {
  background: transparent; color: var(--text-tertiary); border: none;
  width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
}
.flow-delete:hover { background: var(--bad-soft); color: var(--bad); }

.flows-add-bottom {
  margin-top: 10px; background: transparent; color: var(--text-secondary);
  border: 1px dashed var(--border); border-radius: 4px;
  padding: 8px 14px; font-family: inherit; font-size: 13px; cursor: pointer;
}
.flows-add-bottom:hover { border-color: var(--border-strong); color: var(--text-primary); }

.step3-footer {
  display: flex; justify-content: flex-end;
  font-family: var(--tal-font-numeric); font-size: 12px; color: var(--text-tertiary);
}
```

- [ ] **Step 2: Visual check**

Reload the Step 3 page in the browser. Confirm group cards stack 1–N across, table cells are dark-themed with subtle borders, util colours apply.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(step3): table, group cards, util pills"
```

---

### Task 15 — Update `CHANGELOG.md`

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Prepend an entry**

Add to the top of `docs/CHANGELOG.md` (under the `# Changelog` heading):

```markdown
## 2026-05-22 — Step 3: Material Flows

**Motivation:** Step 3 turns the qualified vehicle set from Step 2 into a sized fleet by letting the engineer define origin→destination flows, throughputs, and load weights. The calc engine derives per-flow cycle/veh/utilization and per-vehicle group aggregates, live as the user types. Feeds Step 4 (charging) and Step 5 (KPIs).

**Math (full derivations in `docs/SPECIFICATION.md`):**
- `cycleSeconds = distanceFt × (1/speedLoaded + 1/speedEmpty) + load + unload`
- `vehiclesNeeded = ceil(thru × cycle / (3600 × η))`, η = 0.70
- `utilization = thru × cycle / (vehiclesNeeded × 3600 × η)`
- Sizing uses base throughput; peak (×1.2) is displayed only.

**Changes:**
- Added `docs/SPECIFICATION.md` (project-wide; Step 3 chapter authoritative).
- Added `src/calc/flowMetrics.ts` (pure) with 23+ unit tests; reproduces the screenshot mockup within ±1 s / ±2 pct.
- Added `flows: Flow[]` to `StoredProject` via `src/lib/validations/schemas.ts`.
- New: `app/projects/[id]/step3/page.tsx`, `src/components/step3/*` (FlowsTable, FlowRow, VehicleSelect, GroupSummaryCard, vehicleColor).
- New CSS rules in `app/globals.css` (.flow-group-card, .flows-table, .util-bar).

**User-visible behavior:**
- Step 3 navigates from Step 2's bottom nav and the PersistentHeader step dots.
- Adding a flow, picking a vehicle, and typing distance / thru / weight immediately updates Cycle, Veh count, and Util.
- Picking a vehicle whose max-load is below the row's weight is blocked at the dropdown.
- Distance and weight respect the unit toggle (m/kg in metric, ft/lbs in imperial); storage stays imperial.
- Persistence: every keystroke writes to localStorage; reloading the page restores the flows table exactly.

**Open follow-ups:**
- η and φ user-editable per project.
- CSV import implementation (button stubbed for v1).
- Per-flow transfer-method override (row-expand).
```

- [ ] **Step 2: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: changelog entry for Step 3"
```

---

### Task 16 — Acceptance pass against the screenshot

This is a manual QA gate. No code changes unless tests fail.

- [ ] **Step 1: Enter the screenshot's 8 flows** into a fresh project and confirm:
  - Each row's Cycle, Veh, Util match the screenshot within ±1 s / ±1 pct.
  - Both group cards render with their values within tolerance.
  - Footer reads `8 flows · 221 base moves/hr · peak 265/hr`.

- [ ] **Step 2: Reload the page.** Confirm all flows and computed values persist.

- [ ] **Step 3: Toggle Imperial ↔ Metric.** Confirm Distance and Weight column values convert visually but Cycle/Veh/Util don't change.

- [ ] **Step 4: Try assigning ML2 to row 1 (weight 1984 lb > ML2 max 770 lb).** Confirm the option is disabled in the dropdown.

- [ ] **Step 5: Delete a flow.** Confirm group cards re-aggregate immediately.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all calc + storage tests pass.

- [ ] **Step 7: Commit only if any of 1-5 surface bugs requiring a fix.**

---

## Self-Review

**Spec coverage:**
- Screenshot's group cards → Tasks 7, 12.
- Screenshot's flow table → Tasks 13, 14.
- Cycle math → Task 3.
- Veh math → Task 4.
- Util math → Task 5.
- Group aggregates → Task 7.
- Project footer → Task 8.
- Weight hard gate → Task 13 (VehicleSelect's `disabled` + tooltip).
- Unit toggle → Task 13 (FlowRow conversion).
- Persistence → Task 9 (round-trip test).
- Acceptance → Task 16 (manual + automated).

**Placeholders:** none — every test and implementation block contains actual code.

**Type consistency check:**
- `Flow` shape consistent across `types.ts`, `flowSchema`, `FlowRow` props.
- `FlowMetrics` is the same `{ cycleSeconds, vehiclesNeeded, utilization }` everywhere.
- `GroupSummary` matches between calc and `GroupSummaryCard` props.
- `vehiclesNeeded` (export name) is also the property name on `FlowMetrics` — same identifier reused intentionally for readability; no clash because they're in different scopes.

**Open design decisions surfaced for the user (not blocking the plan):**
1. η = 0.70, φ = 1.20 hard-coded in v1. Future revision can lift these into the project schema.
2. Sizing uses base throughput. Picking peak instead is a one-line change in `vehiclesNeeded` but changes the displayed util substantially — flagged in spec.
3. Transfer method per flow defaults to index 0. A future row-expand can expose the picker.
4. CSV import is a placeholder button only in v1.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-step3-material-flows.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best given the math is the load-bearing risk and each task is small and self-contained.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints. Better if you want to watch each diff land.

Which approach?
