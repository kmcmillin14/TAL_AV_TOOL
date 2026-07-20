# Step 3 — Material Flows: Implementation Plan (v4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each calc task is TDD per superpowers:test-driven-development. UI tasks should invoke superpowers:frontend-design before writing components.

**Goal:** Build Step 3 — an inline-editable Material Flows table where each row's raw (fractional) vehicle demand is `thru × cycle / 3600`. Same-vehicle flows pool into a group; per-group `baseFleet = ceil(Σ rawVehicles)`. No safety multipliers in Step 3 — those live entirely in Step 5 (buffer) so they're auditable in one place.

**Architecture:** Pure calc engine in `src/calc/flowMetrics.ts` (no React, no I/O — testable in isolation). Storage extends `StoredProject` with `flows: Flow[]`. The page reads/writes `project.flows` from React state; calc is synchronous and pure so every keystroke can recompute everything.

**Tech Stack:** React 19 (App Router client component), Zod 4 schema for `flows`, Vitest for calc tests, Toyota Type fonts.

**Replaces:** the v3 plan at this path. v3 used a fixed `loadTimeSec`/`unloadTimeSec` per transfer method for cycle time. v4 keeps those for non-lifting transfers and adds **height-derived lift time** for transfer methods that lift the load: `liftTimeSec = liftHeightFt / liftSpeedFps` when the transfer method has a `lifts: true` flag. Per-flow `liftHeightFt` input. Vehicle JSON gains `calc.liftSpeedFps` and a `lifts` flag on transfer-method entries that lift.

**Earlier history:** v2 had a project-level congestion multiplier; dropped in v3 to avoid overlap with the Step-5 buffer. Step 3 still produces a pure-engineering number with no safety multipliers; Step 4 adds derived charging vehicles; Step 5 adds the single policy multiplier (buffer).

---

## Context and Source Material

- **Screenshot reference:** the user's Step 3 mockup. Columns: # | ORIGIN | DESTINATION | DISTANCE | THRU/HR | WEIGHT | VEHICLE | CYCLE | VEH | UTIL | ×. v3 adds a TURNS column and replaces UTIL with the raw fractional VEH; group cards display the derivation `raw → ⌈ceil⌉`.
- **Spec source of truth (overwritten in Task 1):** `docs/SPECIFICATION.md` Step 3 chapter.
- **Architectural constraints:** `ARCHITECTURE.md` — imperial-first storage, vehicle data from JSON only, `src/calc/` pure (no React/fetch/localStorage), no backend DB, steps modular.
- **Prior plan versions in this file:** archived in git history at this path.

---

## Mathematics — Final Model

Task 1 writes this same content into `docs/SPECIFICATION.md` as the spec-of-record.

### Pipeline overview

```
Step 3:  flows ─► per-flow cycle ─► per-flow rawVehicles ─► per-group baseFleet (ceil of sum)
Step 4:  baseFleet ─► chargingDelta (additive, derived from battery physics)
Step 5:  (baseFleet + chargingDelta) × (1 + bufferPct) ─► ⌈ceil⌉ ─► fleetSold
```

Each stage models a **distinct** physical or policy cause:
- **Step 3** is pure engineering: how much vehicle-time the flows demand.
- **Step 4** is physics: how many extra vehicles are needed to keep `baseFleet` always on the floor while others charge.
- **Step 5** is policy: maintenance, training, demand spikes, sales-team comfort.

No double-counting; no safety multipliers in Step 3.

### Constants

| Symbol     | Name                  | Value | Where                                         |
|------------|-----------------------|-------|-----------------------------------------------|
| `TURN_TIME_SEC`     | Global per-turn penalty | 4 s   | `src/calc/types.ts` (exported constant). |
| `DEFAULT_BUFFER_PCT`| Default buffer fraction | 0.10  | `src/calc/types.ts`; used by Step 5. |
| `T_hr`              | Seconds per hour        | 3600  | Inline literal. |

### Per-flow inputs (stored on each `Flow`)

| Field                | Storage unit | Type                | Notes |
|----------------------|--------------|---------------------|-------|
| `id`                 | —            | string              | `f_<random>`. |
| `origin`             | —            | string              | Free text. |
| `destination`        | —            | string              | Free text. |
| `distanceFt`         | ft           | number ≥ 0          | One-way; cycle multiplies for round-trip. |
| `thruPerHr`          | cycles/hr    | number ≥ 0          | One cycle = one full pick-and-place round trip. |
| `weightLbs`          | lbs          | number ≥ 0          | Gates the vehicle dropdown (`flow.weightLbs > vehicle.maxWeightLbs` → disabled). |
| `turns`              | count        | integer ≥ 0         | Number of 90°+ turns per round trip. |
| `liftHeightFt`       | ft           | number ≥ 0          | Total vertical travel of the load per cycle. 0 when transfer method does not lift. Engineer enters the per-cycle total (e.g., 4 ft for a single Floor→Height delivery; 8 ft for Height-Height = 4 up + 4 down). |
| `vehicleId`          | —            | string \| undefined | References `vehicle.id`. Empty until user picks. |
| `transferMethodIdx`  | —            | number \| undefined | Index into `vehicle.transferMethods[]`. Defaults to 0. |

### Per-flow derived

```
travelLoadedSec  = distanceFt / vehicle.calc.speedLoadedFps
travelEmptySec   = distanceFt / vehicle.calc.speedUnloadedFps
transfer         = vehicle.transferMethods[transferMethodIdx ?? 0]
loadSec          = transfer.loadTimeSec
unloadSec        = transfer.unloadTimeSec
liftTimeSec      = (transfer.lifts && vehicle.calc.liftSpeedFps > 0)
                   ? liftHeightFt / vehicle.calc.liftSpeedFps
                   : 0
turnPenaltySec   = turns × TURN_TIME_SEC

cycleSeconds     = travelLoadedSec + travelEmptySec + loadSec + unloadSec + liftTimeSec + turnPenaltySec
rawVehicles      = thruPerHr × cycleSeconds / 3600
```

`distanceFt` is one-way; the cycle includes the empty return trip. `liftTimeSec` is 0 for transfer methods without a `lifts` flag (Fork, Tow/Tugger, Conveyor Interface).

`rawVehicles` is fractional. Interpretation: it is the fraction of one vehicle's hour that this flow consumes. `0.94` means a flow could be served by a single vehicle running at 94 % occupancy; `1.72` means a single vehicle cannot serve this flow on its own — multiple vehicles must pool. The fractional value carries useful signal and is displayed verbatim in the table.

### Per-group derived (per unique `vehicleId` in `flows`)

```
inGroup        = flows.filter(f => f.vehicleId === groupId)
groupRaw       = Σ rawVehicles  over inGroup        // fractional
baseFleet      = ceil(groupRaw)                     // integer — Step 3's output
headroom       = baseFleet > 0
                  ? (baseFleet − groupRaw) / baseFleet
                  : null                            // 0..1

baseThru       = Σ thruPerHr
demandSec_per_hr = Σ (thruPerHr × cycleSeconds)
avgCycleSec    = baseThru > 0 ? demandSec_per_hr / baseThru : null
```

`baseFleet` is the **engineering answer**: integer vehicles required to pool-serve all assigned flows of this type. The next steps add charging vehicles (Step 4) and buffer (Step 5) on top.

`headroom` is the fraction of the rounded-up fleet that isn't absorbed by demand. Always in `[0, 1)` when `groupRaw > 0`. Display only.

### Project totals (Step 3 ends here)

```
totalFlows     = flows.length
totalThru      = Σ thruPerHr across all flows
totalRawFleet  = Σ groupRaw across groups
totalBaseFleet = Σ baseFleet across groups
```

### Hard gates per flow

A vehicle is **disabled** in the row's dropdown when `flow.weightLbs > vehicle.calc.maxWeightLbs`. Hard gate; no override. Matches Step 2's rule.

### Verification against the v1 mockup

Feeding the same 8 rows from the screenshot (using the screenshot's cycle values 138/98/118/165/115/81/85/101 s):

| Row | thru | cycle (s) | rawVehicles = thru × cycle / 3600 |
|-----|-----:|----------:|----------------------------------:|
| 1   |   45 |  138      | 1.725 |
| 2   |   30 |   98      | 0.817 |
| 3   |   15 |  118      | 0.492 |
| 4   |   38 |  165      | 1.742 |
| 5   |   25 |  115      | 0.799 |
| 6   |   22 |   81      | 0.495 |
| 7   |   28 |   85      | 0.661 |
| 8   |   18 |  101      | 0.505 |

| Group | groupRaw | baseFleet (ceil) | headroom |
|-------|---------:|-----------------:|---------:|
| CB18 (rows 1,2,4,5,6) | 5.578 | **6** | (6 − 5.578) / 6 = 7.0 % |
| ML2  (rows 3,7,8)     | 1.658 | **2** | (2 − 1.658) / 2 = 17.1 % |

Step 3 says "6 CB18s and 2 ML2s." Step 4 will add charging vehicles based on each vehicle's battery profile. Step 5 will wrap a buffer % around the total. The screenshot's `11 / 3` came from a v0 model with η = 0.70 (a ~1.43× hidden multiplier); v3 surfaces every uplift explicitly so the proposal team can defend each one.

These numbers become the test data in Tasks 6–7.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `docs/SPECIFICATION.md` | **overwrite** | Step 3 chapter authoritative; pipeline preview for Steps 4 / 5. |
| `docs/CHANGELOG.md` | modify | Append a Step 3 entry citing the v3 model. |
| `src/calc/types.ts` | modify | Add `Flow`, `FlowDerived`, `GroupSummary`, `ProjectFlowSummary`. Export `TURN_TIME_SEC`, `DEFAULT_BUFFER_PCT`. |
| `src/calc/flowMetrics.ts` | **create** | Pure: `cycleSeconds`, `rawVehicles`, `flowDerived`, `groupSummary`, `projectFlowSummary`. |
| `src/calc/__tests__/flowMetrics.test.ts` | **create** | Vitest. Mockup-row table as test data; edge-case coverage per function. |
| `src/lib/validations/schemas.ts` | modify | Add `flowSchema` and `flows: z.array(flowSchema).default([])`. |
| `src/lib/storage.ts` | modify | Add `flows: []` to `defaultFields()`. |
| `src/lib/__tests__/storage.flows.test.ts` | **create** | Round-trip test for `flows[]`. |
| `app/projects/[id]/step3/page.tsx` | replace | Real page in place of placeholder. |
| `src/components/step3/FlowsTable.tsx` | **create** | Table with inline-edited rows. |
| `src/components/step3/FlowRow.tsx` | **create** | One editable row + computed columns. |
| `src/components/step3/GroupSummaryCard.tsx` | **create** | Per-vehicle card showing `raw → ⌈ceil⌉`. |
| `src/components/step3/VehicleSelect.tsx` | **create** | Per-row dropdown with weight-gated disable. |
| `src/components/step3/vehicleColor.ts` | **create** | Deterministic vehicle-id → palette color. |
| `app/globals.css` | modify | Add `.step3-page`, `.flow-group-grid`, `.flow-group-card`, `.flows-table`, `.flow-row`, `.veh-dot` rules. |

**Module-boundary check** (ARCHITECTURE.md §4): `flowMetrics.ts` imports only types — no React, no fetch, no localStorage. UI components never compute math inline.

---

## Tasks

### Task 1 — Spec doc (`docs/SPECIFICATION.md`)

**Files:**
- Overwrite: `docs/SPECIFICATION.md`

- [ ] **Step 1: Write the spec**

Overwrite `docs/SPECIFICATION.md` with:

````markdown
# TAL Fleet Calculator — Specification

The functional spec ("what the app does"). For architectural rules ("how it's built"), see `ARCHITECTURE.md`. For decision history, see `docs/CHANGELOG.md`.

---

## Step 3 — Material Flows

### Purpose

Step 3 decomposes the facility's material movement into discrete **flows** (origin → destination pairs) and derives, live as the user types, the cycle time and raw fractional vehicle demand per flow, plus per-vehicle aggregate `baseFleet`. Output of Step 3 is a pure-engineering number with no safety multipliers; Step 4 (charging) and Step 5 (buffer) layer on top.

### Pipeline overview

```
Step 3:  per-flow cycle → per-flow rawVehicles → per-group baseFleet (ceil of sum)
Step 4:  baseFleet → chargingDelta (additive, from battery physics)
Step 5:  (baseFleet + chargingDelta) × (1 + bufferPct) → ⌈ceil⌉ → fleetSold
```

Each stage models a distinct cause: Step 3 is engineering, Step 4 is physics, Step 5 is policy. There is no productivity factor η and no congestion multiplier — those conflate causes and create overlap risk.

### Per-flow inputs

- `origin` — free text (e.g. "Dock A")
- `destination` — free text (e.g. "Storage 1")
- `distanceFt` — one-way distance, feet, ≥ 0
- `thruPerHr` — cycles per hour, ≥ 0
- `weightLbs` — per-cycle load weight, lbs, ≥ 0
- `turns` — number of 90°+ turns per round trip, integer ≥ 0
- `vehicleId` — id of a vehicle from `src/content/vehicles/*.json`
- `transferMethodIdx` — index into `vehicle.transferMethods[]`; defaults to 0

### Constants

- `TURN_TIME_SEC = 4` — global per-turn penalty.
- `T_hr = 3600` — seconds per hour.
- `DEFAULT_BUFFER_PCT = 0.10` — used in Step 5, declared here for cross-step visibility.

### Per-flow derived

```
cycleSeconds = distanceFt × (1/speedLoadedFps + 1/speedUnloadedFps)
             + transferMethod.loadTimeSec
             + transferMethod.unloadTimeSec
             + turns × TURN_TIME_SEC

rawVehicles  = thruPerHr × cycleSeconds / 3600
```

`distanceFt` is one-way; the cycle includes the empty return trip. `rawVehicles` is fractional: `0.94` means this flow alone consumes 94 % of one vehicle's hour; `1.72` means a single vehicle cannot serve it — vehicles must pool.

### Per-group derived (per unique `vehicleId`)

```
groupRaw    = Σ rawVehicles  over flows with this vehicleId
baseFleet   = ceil(groupRaw)
headroom    = baseFleet > 0 ? (baseFleet − groupRaw) / baseFleet : null
baseThru    = Σ thruPerHr
avgCycleSec = baseThru > 0 ? Σ(thruPerHr × cycleSeconds) / baseThru : null
```

`baseFleet` is Step 3's output: the integer number of vehicles of this type required to pool-serve all assigned flows, **before** charging or buffer.

### Project totals

```
totalFlows     = flows.length
totalThru      = Σ thruPerHr across all flows
totalRawFleet  = Σ groupRaw across groups
totalBaseFleet = Σ baseFleet across groups
```

### Step 4 preview (not built in this plan)

Adds `chargingDelta` per group based on:
- `vehicle.calc.batteryKwh`
- `vehicle.calc.energyKwhPerFt`
- `vehicle.calc.chargeKw` or `chargeTimeMin`
- `vehicle.calc.chargerType` ("opportunity" vs "swap")
- daily operating hours (from Step 1)

Formula will be specified in Step 4's own plan. `chargingDelta` is a non-negative integer; it adds to `baseFleet` linearly.

### Step 5 preview (not built in this plan)

```
fleetPerGroup = ceil( (baseFleet + chargingDelta) × (1 + project.bufferPct) )
fleetTotal    = Σ fleetPerGroup
```

`project.bufferPct` defaults to 0.10. Surfaced as a project-level slider in Step 5. It is the **only** multiplier in the entire pipeline; it covers maintenance, training, demand spikes, and anything else not modeled by Step 3 or Step 4.

### Hard gates per flow

A vehicle is **disabled** in the row's dropdown when `flow.weightLbs > vehicle.calc.maxWeightLbs`. Hard gate; no override.

### UI behavior

- Table is fully inline-editable. Every keystroke writes to storage (using the same `watch()` save pattern from Step 1).
- "Add Flow" appends an empty row with placeholder text.
- Deleting uses the trailing × control.
- Group cards appear in the order vehicles were first assigned.
- Distance shown in m when metric, ft when imperial. Weight in kg / lbs respectively. **Storage always imperial** per ARCHITECTURE.md §3.
- Each vehicle id gets a deterministic display color (hash → palette).

### Headroom color thresholds (display only)

- ≥ 30 % — green (comfortable headroom)
- 15–30 % — green
- 5–15 % — yellow (tight)
- < 5 %   — red (no margin — likely needs another vehicle or workload re-balance)

### Acceptance criteria

1. Adding the 8 rows from the verification table (with the spec's cycle values; turns = 0) produces:
   - CB18: `groupRaw ≈ 5.58`, `baseFleet = 6`.
   - ML2:  `groupRaw ≈ 1.66`, `baseFleet = 2`.
2. Editing any flow field instantly re-derives all downstream numbers — no save button, no page reload.
3. Picking a vehicle whose `maxWeightLbs` is less than the row's `weightLbs` is not possible (disabled in dropdown).
4. Reloading the page restores all flows and computed values.
5. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
6. All Vitest cases for cycle / raw / group / project pass.

### Verification table (test data)

| Row | thru | cycle (s) | rawVehicles |
|-----|-----:|----------:|------------:|
| 1   |   45 |  138      | 1.725 |
| 2   |   30 |   98      | 0.817 |
| 3   |   15 |  118      | 0.492 |
| 4   |   38 |  165      | 1.742 |
| 5   |   25 |  115      | 0.799 |
| 6   |   22 |   81      | 0.495 |
| 7   |   28 |   85      | 0.661 |
| 8   |   18 |  101      | 0.505 |

| Group | groupRaw | baseFleet |
|-------|---------:|----------:|
| CB18 (1,2,4,5,6) | 5.578 | 6 |
| ML2  (3,7,8)     | 1.658 | 2 |

Project totals: `totalFlows = 8`, `totalThru = 221`, `totalRawFleet ≈ 7.24`, `totalBaseFleet = 8`.
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/SPECIFICATION.md`
Expected: ≥ 100 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md
git commit -m "docs(spec): Step 3 v3 — raw demand + ceil, no congestion"
```

---

### Task 2 — Extend `src/calc/types.ts`

**Files:**
- Modify: `src/calc/types.ts`

- [ ] **Step 1: Append Step-3 types**

Append to `src/calc/types.ts`:

```typescript
// ---- Step 3: Material Flows ----

export interface Flow {
  id: string
  origin: string
  destination: string
  distanceFt: number           // ≥ 0; one-way
  thruPerHr: number            // cycles/hr, ≥ 0
  weightLbs: number            // ≥ 0
  turns: number                // count, integer ≥ 0
  vehicleId?: string
  transferMethodIdx?: number   // defaults to 0
}

export interface FlowDerived {
  cycleSeconds: number | null
  rawVehicles: number | null   // fractional; demand-only
}

export interface GroupSummary {
  vehicleId: string
  flowsCount: number
  baseThru: number
  avgCycleSec: number | null
  groupRaw: number             // Σ rawVehicles
  baseFleet: number            // ceil(groupRaw)
  headroom: number | null      // (baseFleet − groupRaw) / baseFleet
}

export interface ProjectFlowSummary {
  totalFlows: number
  totalThru: number
  totalRawFleet: number
  totalBaseFleet: number
}

export const TURN_TIME_SEC = 4
export const DEFAULT_BUFFER_PCT = 0.10   // used by Step 5
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/calc/types.ts
git commit -m "feat(types): Flow, FlowDerived, GroupSummary + constants for Step 3"
```

---

### Task 3 — `cycleSeconds` (TDD)

> **Sub-skill:** superpowers:test-driven-development.

**Files:**
- Create: `src/calc/flowMetrics.ts`
- Create: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Create `src/calc/__tests__/flowMetrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cycleSeconds } from '../flowMetrics'
import { TURN_TIME_SEC } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const cb18: Pick<Vehicle, 'calc' | 'transferMethods'> = {
  calc: { speedLoadedFps: 9.84, speedUnloadedFps: 11.5 } as Vehicle['calc'],
  transferMethods: [
    { method: 'Fork', loadTimeSec: 5, unloadTimeSec: 5 },
    { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8 },
  ],
}

describe('cycleSeconds', () => {
  it('sums travel-loaded + travel-empty + load + unload + turns × TURN_TIME_SEC', () => {
    // 100 ft loaded at 9.84 fps  = 10.16 s
    // 100 ft empty  at 11.5  fps =  8.70 s
    // load 5 + unload 5         = 10.00 s
    // 2 turns × 4 s             =  8.00 s
    // total                     = 36.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 2, 0)).toBeCloseTo(36.86, 1)
  })

  it('handles zero turns', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 0)).toBeCloseTo(28.86, 1)
  })

  it('uses transferMethodIdx to pick load/unload times', () => {
    // 100 ft + Lift Platform (idx 1) + 0 turns: 10.16 + 8.70 + 8 + 8 = 34.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 1)).toBeCloseTo(34.86, 1)
  })

  it('defaults transferMethodIdx to 0 when omitted', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0)).toBeCloseTo(28.86, 1)
  })

  it('returns load+unload+turn penalty when distance is 0', () => {
    expect(cycleSeconds(0, cb18 as Vehicle, 1, 0)).toBeCloseTo(14, 5)
  })

  it('returns null when distance is negative', () => {
    expect(cycleSeconds(-1, cb18 as Vehicle, 0, 0)).toBeNull()
  })

  it('returns null when turns is negative', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, -1, 0)).toBeNull()
  })

  it('returns null when vehicle has no transferMethods', () => {
    const broken = { ...cb18, transferMethods: [] }
    expect(cycleSeconds(100, broken as Vehicle, 0, 0)).toBeNull()
  })

  it('returns null when transferMethodIdx is out of range', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 99)).toBeNull()
  })

  it('returns null when speedLoadedFps is 0', () => {
    const broken = { ...cb18, calc: { ...cb18.calc, speedLoadedFps: 0 } }
    expect(cycleSeconds(100, broken as Vehicle, 0, 0)).toBeNull()
  })

  it('returns null when speedUnloadedFps is 0', () => {
    const broken = { ...cb18, calc: { ...cb18.calc, speedUnloadedFps: 0 } }
    expect(cycleSeconds(100, broken as Vehicle, 0, 0)).toBeNull()
  })

  it('pins TURN_TIME_SEC at 4 (changes here are a spec change)', () => {
    expect(TURN_TIME_SEC).toBe(4)
  })
})
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/calc/flowMetrics.ts`:

```typescript
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { TURN_TIME_SEC } from './types'

/**
 * Round-trip cycle time for one move on a flow.
 *
 *   cycle = (distance / speedLoaded) + (distance / speedEmpty)
 *         + load + unload + turns × TURN_TIME_SEC
 *
 * Returns null when inputs make the calculation undefined. Callers must
 * handle null by displaying "—" rather than rendering a number.
 */
export function cycleSeconds(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  transferMethodIdx: number = 0,
): number | null {
  if (distanceFt < 0) return null
  if (turns < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null
  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty  = vehicle.calc.speedUnloadedFps
  if (sLoaded <= 0 || sEmpty <= 0) return null
  const travelLoaded = distanceFt / sLoaded
  const travelEmpty  = distanceFt / sEmpty
  return travelLoaded + travelEmpty
       + transfer.loadTimeSec + transfer.unloadTimeSec
       + turns * TURN_TIME_SEC
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: 12 / 12 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): cycleSeconds with turn penalty and edge guards"
```

---

### Task 4 — `rawVehicles` (TDD)

> **Sub-skill:** superpowers:test-driven-development.

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append to test file:

```typescript
import { rawVehicles } from '../flowMetrics'

describe('rawVehicles', () => {
  it('matches verification row 1: 45/hr × 138s → 1.725', () => {
    expect(rawVehicles(45, 138)).toBeCloseTo(1.725, 3)
  })

  it('matches verification row 7: 28/hr × 85s → 0.661', () => {
    expect(rawVehicles(28, 85)).toBeCloseTo(0.661, 3)
  })

  it('returns 0 when throughput is 0', () => {
    expect(rawVehicles(0, 100)).toBe(0)
  })

  it('returns 0 when throughput is negative', () => {
    expect(rawVehicles(-1, 100)).toBe(0)
  })

  it('returns null when cycle is null', () => {
    expect(rawVehicles(10, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**

Append to `src/calc/flowMetrics.ts`:

```typescript
/**
 * Fractional raw vehicle demand for a flow. No factors applied.
 * Returns null when cycle is null. Returns 0 when demand is 0 or negative.
 */
export function rawVehicles(
  thruPerHr: number,
  cycleSeconds: number | null,
): number | null {
  if (cycleSeconds == null) return null
  if (thruPerHr <= 0) return 0
  return (thruPerHr * cycleSeconds) / 3600
}
```

- [ ] **Step 4: Pass**
- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): rawVehicles = thru × cycle / 3600"
```

---

### Task 5 — `flowDerived` orchestrator (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append:

```typescript
import { flowDerived } from '../flowMetrics'
import type { Flow } from '../types'

describe('flowDerived (orchestrator)', () => {
  const cb18Veh = cb18 as Vehicle

  it('returns nulls when vehicle is undefined', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 10, weightLbs: 500, turns: 0,
    }
    expect(flowDerived(flow, undefined)).toEqual({
      cycleSeconds: null,
      rawVehicles: null,
    })
  })

  it('ties cycle → raw together (with turns)', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 30, weightLbs: 500, turns: 1,
      vehicleId: 'cb18',
    }
    const d = flowDerived(flow, cb18Veh)
    // cycle = 10.16 + 8.70 + 5 + 5 + 4 = 32.86 s
    expect(d.cycleSeconds).toBeCloseTo(32.86, 1)
    // raw = 30 × 32.86 / 3600 = 0.274
    expect(d.rawVehicles).toBeCloseTo(0.274, 3)
  })
})
```

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**

Append:

```typescript
import type { Flow, FlowDerived } from './types'

/**
 * Compose cycleSeconds and rawVehicles for one flow. Pure wrapper.
 */
export function flowDerived(
  flow: Flow,
  vehicle: Vehicle | undefined,
): FlowDerived {
  if (!vehicle) return { cycleSeconds: null, rawVehicles: null }
  const cycle = cycleSeconds(
    flow.distanceFt,
    vehicle,
    flow.turns,
    flow.transferMethodIdx ?? 0,
  )
  return {
    cycleSeconds: cycle,
    rawVehicles: rawVehicles(flow.thruPerHr, cycle),
  }
}
```

- [ ] **Step 4: Pass**
- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): flowDerived orchestrator"
```

---

### Task 6 — `groupSummary` (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append:

```typescript
import { groupSummary } from '../flowMetrics'

describe('groupSummary', () => {
  const cb18Flows = [
    { id: '1', origin: 'Dock A',    destination: 'Storage 1', distanceFt: 590, thruPerHr: 45, weightLbs: 1984, turns: 0, vehicleId: 'cb18' },
    { id: '2', origin: 'Storage 1', destination: 'Pack Line', distanceFt: 394, thruPerHr: 30, weightLbs: 1764, turns: 0, vehicleId: 'cb18' },
    { id: '4', origin: 'Dock A',    destination: 'Storage 2', distanceFt: 722, thruPerHr: 38, weightLbs: 2425, turns: 0, vehicleId: 'cb18' },
    { id: '5', origin: 'Storage 2', destination: 'Pack Line', distanceFt: 476, thruPerHr: 25, weightLbs: 2094, turns: 0, vehicleId: 'cb18' },
    { id: '6', origin: 'Inbound',   destination: 'Storage 1', distanceFt: 312, thruPerHr: 22, weightLbs: 2646, turns: 0, vehicleId: 'cb18' },
  ]
  const derivedCb18 = new Map([
    ['1', { cycleSeconds: 138, rawVehicles: 1.725 }],
    ['2', { cycleSeconds:  98, rawVehicles: 0.817 }],
    ['4', { cycleSeconds: 165, rawVehicles: 1.742 }],
    ['5', { cycleSeconds: 115, rawVehicles: 0.799 }],
    ['6', { cycleSeconds:  81, rawVehicles: 0.495 }],
  ])

  it('aggregates the CB18 group', () => {
    const g = groupSummary('cb18', cb18Flows, derivedCb18)
    expect(g.flowsCount).toBe(5)
    expect(g.baseThru).toBe(160)
    expect(g.groupRaw).toBeCloseTo(5.578, 2)
    expect(g.baseFleet).toBe(6)                       // ceil(5.578)
    expect(g.avgCycleSec).toBeCloseTo(125.5, 0)
    expect(g.headroom).toBeCloseTo(0.070, 2)          // (6 − 5.578) / 6
  })

  const ml2Flows = [
    { id: '3', origin: 'Pack Line', destination: 'Dock B',    distanceFt: 295, thruPerHr: 15, weightLbs: 110, turns: 0, vehicleId: 'ml2' },
    { id: '7', origin: 'Pick Wall', destination: 'Pack Line', distanceFt: 197, thruPerHr: 28, weightLbs:  77, turns: 0, vehicleId: 'ml2' },
    { id: '8', origin: 'Storage 1', destination: 'Pick Wall', distanceFt: 246, thruPerHr: 18, weightLbs:  62, turns: 0, vehicleId: 'ml2' },
  ]
  const derivedMl2 = new Map([
    ['3', { cycleSeconds: 118, rawVehicles: 0.492 }],
    ['7', { cycleSeconds:  85, rawVehicles: 0.661 }],
    ['8', { cycleSeconds: 101, rawVehicles: 0.505 }],
  ])

  it('aggregates the ML2 group', () => {
    const g = groupSummary('ml2', ml2Flows, derivedMl2)
    expect(g.flowsCount).toBe(3)
    expect(g.baseThru).toBe(61)
    expect(g.groupRaw).toBeCloseTo(1.658, 2)
    expect(g.baseFleet).toBe(2)                        // ceil(1.658)
    expect(g.avgCycleSec).toBeCloseTo(97.8, 0)
    expect(g.headroom).toBeCloseTo(0.171, 2)           // (2 − 1.658) / 2
  })

  it('returns null avgCycle and headroom when group is empty', () => {
    const g = groupSummary('cb18', [], new Map())
    expect(g.flowsCount).toBe(0)
    expect(g.baseThru).toBe(0)
    expect(g.groupRaw).toBe(0)
    expect(g.baseFleet).toBe(0)
    expect(g.avgCycleSec).toBeNull()
    expect(g.headroom).toBeNull()
  })
})
```

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**

Append:

```typescript
import type { GroupSummary } from './types'

/**
 * Aggregate per-vehicle group summary. `derivedByFlowId` is precomputed
 * by the caller so React doesn't recompute cycles inside this function.
 */
export function groupSummary(
  vehicleId: string,
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
): GroupSummary {
  const inGroup = flows.filter(f => f.vehicleId === vehicleId)

  let baseThru = 0
  let demandSecPerHr = 0
  let groupRaw = 0

  for (const f of inGroup) {
    const d = derivedByFlowId.get(f.id)
    if (!d) continue
    baseThru += f.thruPerHr
    if (d.cycleSeconds != null) demandSecPerHr += f.thruPerHr * d.cycleSeconds
    if (d.rawVehicles != null) groupRaw += d.rawVehicles
  }

  const baseFleet = Math.ceil(groupRaw)
  const avgCycleSec = baseThru > 0 ? demandSecPerHr / baseThru : null
  const headroom = baseFleet > 0 ? (baseFleet - groupRaw) / baseFleet : null

  return {
    vehicleId,
    flowsCount: inGroup.length,
    baseThru,
    avgCycleSec,
    groupRaw,
    baseFleet,
    headroom,
  }
}
```

- [ ] **Step 4: Pass**
- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): groupSummary — pool and ceil"
```

---

### Task 7 — `projectFlowSummary` (TDD)

**Files:**
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Failing test**

Append:

```typescript
import { projectFlowSummary } from '../flowMetrics'

describe('projectFlowSummary', () => {
  it('matches the verification totals: 8 flows · 221 thru · 8 base fleet', () => {
    const allFlows = [
      { id: '1', origin: '', destination: '', distanceFt: 1, thruPerHr: 45, weightLbs: 0, turns: 0, vehicleId: 'cb18' },
      { id: '2', origin: '', destination: '', distanceFt: 1, thruPerHr: 30, weightLbs: 0, turns: 0, vehicleId: 'cb18' },
      { id: '3', origin: '', destination: '', distanceFt: 1, thruPerHr: 15, weightLbs: 0, turns: 0, vehicleId: 'ml2' },
      { id: '4', origin: '', destination: '', distanceFt: 1, thruPerHr: 38, weightLbs: 0, turns: 0, vehicleId: 'cb18' },
      { id: '5', origin: '', destination: '', distanceFt: 1, thruPerHr: 25, weightLbs: 0, turns: 0, vehicleId: 'cb18' },
      { id: '6', origin: '', destination: '', distanceFt: 1, thruPerHr: 22, weightLbs: 0, turns: 0, vehicleId: 'cb18' },
      { id: '7', origin: '', destination: '', distanceFt: 1, thruPerHr: 28, weightLbs: 0, turns: 0, vehicleId: 'ml2' },
      { id: '8', origin: '', destination: '', distanceFt: 1, thruPerHr: 18, weightLbs: 0, turns: 0, vehicleId: 'ml2' },
    ]
    const derived = new Map([
      ['1', { cycleSeconds: 138, rawVehicles: 1.725 }],
      ['2', { cycleSeconds:  98, rawVehicles: 0.817 }],
      ['3', { cycleSeconds: 118, rawVehicles: 0.492 }],
      ['4', { cycleSeconds: 165, rawVehicles: 1.742 }],
      ['5', { cycleSeconds: 115, rawVehicles: 0.799 }],
      ['6', { cycleSeconds:  81, rawVehicles: 0.495 }],
      ['7', { cycleSeconds:  85, rawVehicles: 0.661 }],
      ['8', { cycleSeconds: 101, rawVehicles: 0.505 }],
    ])
    const s = projectFlowSummary(allFlows, derived)
    expect(s.totalFlows).toBe(8)
    expect(s.totalThru).toBe(221)
    expect(s.totalRawFleet).toBeCloseTo(7.236, 2)
    expect(s.totalBaseFleet).toBe(8)                  // 6 + 2
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
  derivedByFlowId: Map<string, FlowDerived>,
): ProjectFlowSummary {
  const ids: string[] = []
  for (const f of flows) {
    if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
  }
  let totalRawFleet = 0
  let totalBaseFleet = 0
  for (const vid of ids) {
    const g = groupSummary(vid, flows, derivedByFlowId)
    totalRawFleet += g.groupRaw
    totalBaseFleet += g.baseFleet
  }
  return {
    totalFlows: flows.length,
    totalThru: flows.reduce((s, f) => s + f.thruPerHr, 0),
    totalRawFleet,
    totalBaseFleet,
  }
}
```

- [ ] **Step 4: Pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: 23 / 23 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): projectFlowSummary"
```

---

### Task 8 — Schema + storage

**Files:**
- Modify: `src/lib/validations/schemas.ts`
- Modify: `src/lib/storage.ts`
- Create: `src/lib/__tests__/storage.flows.test.ts`

- [ ] **Step 1: Extend Zod schema**

In `src/lib/validations/schemas.ts`, before `projectSchema`, add:

```typescript
export const flowSchema = z.object({
  id: z.string(),
  origin: z.string().default(''),
  destination: z.string().default(''),
  distanceFt: z.number().min(0).default(0),
  thruPerHr: z.number().min(0).default(0),
  weightLbs: z.number().min(0).default(0),
  turns: z.number().int().min(0).default(0),
  vehicleId: z.string().optional(),
  transferMethodIdx: z.number().int().min(0).optional(),
})
```

Inside `projectSchema = z.object({...})`, after `interlocks`, add:

```typescript
  flows: z.array(flowSchema).default([]),
```

- [ ] **Step 2: Storage defaults**

In `src/lib/storage.ts`, inside `defaultFields()`, append (before the closing `})`):

```typescript
  flows: [],
```

- [ ] **Step 3: Round-trip test**

Create `src/lib/__tests__/storage.flows.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createProject, getProject, updateProject } from '../storage'

describe('flows round-trip', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('persists flows through create + update + read', () => {
    const p = createProject({ projectName: 'Test' })
    expect(p.flows).toEqual([])

    updateProject(p.id, {
      flows: [{ id: 'f1', origin: 'A', destination: 'B', distanceFt: 100, thruPerHr: 10, weightLbs: 500, turns: 1, vehicleId: 'cb18' }],
    })
    const read = getProject(p.id)
    expect(read?.flows).toHaveLength(1)
    expect(read?.flows?.[0]).toMatchObject({ id: 'f1', distanceFt: 100, turns: 1, vehicleId: 'cb18' })
  })
})
```

- [ ] **Step 4: Pass**

Run: `npx vitest run src/lib/__tests__/storage.flows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/schemas.ts src/lib/storage.ts src/lib/__tests__/storage.flows.test.ts
git commit -m "feat(storage): flows[] on StoredProject"
```

---

### Task 9 — Vehicle color helper

**Files:**
- Create: `src/components/step3/vehicleColor.ts`

- [ ] **Step 1: Create**

```typescript
// Skip red — reserved for hard-fail semantics elsewhere in the app.
const ASSIGNABLE = [
  '#4f9eff',  // blue
  '#3ec888',  // green
  '#f5a524',  // amber
  '#a78bfa',  // violet
  '#22d3ee',  // cyan
] as const

export function vehicleColor(vehicleId: string): string {
  let hash = 0
  for (let i = 0; i < vehicleId.length; i++) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) | 0
  }
  return ASSIGNABLE[Math.abs(hash) % ASSIGNABLE.length]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/step3/vehicleColor.ts
git commit -m "feat(step3): deterministic vehicle-id → palette color"
```

---

### Task 10 — Step 3 page shell

> **Sub-skill:** superpowers:frontend-design — review the Claude Design reference at `/Users/kylemcmillin/Desktop/TAL AV Eng Tool/Claude Design/tal-av-tool/project/tal/` before editing the page or styling.

**Files:**
- Replace: `app/projects/[id]/step3/page.tsx`

- [ ] **Step 1: Overwrite placeholder**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { getProject, updateProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { Flow, FlowDerived } from '@/src/calc/types'
import {
  flowDerived,
  groupSummary,
  projectFlowSummary,
} from '@/src/calc/flowMetrics'
import FlowsTable from '@/src/components/step3/FlowsTable'
import GroupSummaryCard from '@/src/components/step3/GroupSummaryCard'

export default function Step3Page() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  useEffect(() => {
    setProject(getProject(id))
    fetchVehiclesCached().then(setVehicles).catch(() => {})
  }, [id])

  const vehicleById = useMemo(
    () => new Map(vehicles.map(v => [v.id, v])),
    [vehicles],
  )

  const flows: Flow[] = project?.flows ?? []

  const derivedByFlowId = useMemo(() => {
    const m = new Map<string, FlowDerived>()
    for (const f of flows) {
      const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
      m.set(f.id, flowDerived(f, veh))
    }
    return m
  }, [flows, vehicleById])

  const groups = useMemo(() => {
    const ids: string[] = []
    for (const f of flows) {
      if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    }
    return ids.map(vid => groupSummary(vid, flows, derivedByFlowId))
  }, [flows, derivedByFlowId])

  const footer = useMemo(
    () => projectFlowSummary(flows, derivedByFlowId),
    [flows, derivedByFlowId],
  )

  const persistFlows = (next: Flow[]) => {
    if (!project) return
    const updated = updateProject(project.id, { flows: next })
    if (updated) setProject(updated)
  }

  if (!project) return <div className="app-shell" />

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
            />
          ))}
        </div>

        <FlowsTable
          flows={flows}
          vehicles={vehicles}
          derivedByFlowId={derivedByFlowId}
          unitSystem={unitSystem}
          onFlowsChange={persistFlows}
        />

        <div className="step3-footer">
          {footer.totalFlows} flows · {footer.totalThru} cycles/hr ·
          raw {footer.totalRawFleet.toFixed(2)} → base fleet {footer.totalBaseFleet}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Page is broken until Tasks 11–13 land. Hold the commit.**

---

### Task 11 — `GroupSummaryCard`

> **Sub-skill:** superpowers:frontend-design.

**Files:**
- Create: `src/components/step3/GroupSummaryCard.tsx`

- [ ] **Step 1: Create**

```tsx
'use client'

import { vehicleColor } from './vehicleColor'
import type { GroupSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  summary: GroupSummary
  vehicle?: Vehicle
}

function formatCycle(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function headroomClass(h: number | null): string {
  if (h == null) return ''
  if (h < 0.05) return 'red'
  if (h < 0.15) return 'yellow'
  return 'green'
}

export default function GroupSummaryCard({ summary, vehicle }: Props) {
  const color = vehicleColor(summary.vehicleId)
  const name = vehicle?.name ?? summary.vehicleId
  const headPct = summary.headroom == null ? null : Math.round(summary.headroom * 100)

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
        <div>
          <div className="label">BASE FLEET</div>
          <div className="value">{summary.baseFleet}<span className="unit">veh</span></div>
          <div className="derivation mono">
            raw {summary.groupRaw.toFixed(2)} → ⌈ceil⌉
          </div>
        </div>
        <div>
          <div className="label">HEADROOM</div>
          <div className={`value ${headroomClass(summary.headroom)}`}>
            {headPct == null ? '—' : `${headPct}%`}
          </div>
        </div>
        <div>
          <div className="label">AVG CYCLE</div>
          <div className="value">{formatCycle(summary.avgCycleSec)}</div>
        </div>
        <div>
          <div className="label">TOTAL THRU</div>
          <div className="value">{summary.baseThru}<span className="unit">/hr</span></div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit with Task 13.**

---

### Task 12 — `VehicleSelect`

**Files:**
- Create: `src/components/step3/VehicleSelect.tsx`

- [ ] **Step 1: Create**

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

export function VehicleDot({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return null
  return <span className="veh-dot" style={{ background: vehicleColor(vehicleId) }} />
}
```

- [ ] **Step 2: Commit with Task 13.**

---

### Task 13 — `FlowsTable` + `FlowRow`

> **Sub-skill:** superpowers:frontend-design.

**Files:**
- Create: `src/components/step3/FlowsTable.tsx`
- Create: `src/components/step3/FlowRow.tsx`

- [ ] **Step 1: Create `FlowRow.tsx`**

```tsx
'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import VehicleSelect, { VehicleDot } from './VehicleSelect'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
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

export default function FlowRow({ index, flow, vehicles, derived, unitSystem, onChange, onDelete }: Props) {
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

  return (
    <tr className="flow-row">
      <td className="mono">{String(index + 1).padStart(2, '0')}</td>
      <td><input className="flow-cell" value={flow.origin}      onChange={e => onChange({ ...flow, origin: e.target.value })}      placeholder="Origin" /></td>
      <td><input className="flow-cell" value={flow.destination} onChange={e => onChange({ ...flow, destination: e.target.value })} placeholder="Destination" /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={distDisplay}    onChange={e => setDistance(e.target.value)} /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={flow.thruPerHr} onChange={e => onChange({ ...flow, thruPerHr: Math.max(0, Number(e.target.value) || 0) })} /></td>
      <td><input className="flow-cell mono" type="number" min="0" value={weightDisplay}  onChange={e => setWeight(e.target.value)} /></td>
      <td><input className="flow-cell mono" type="number" min="0" step="1" value={flow.turns} onChange={e => onChange({ ...flow, turns: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
      <td>
        <span className="veh-cell"><VehicleDot vehicleId={flow.vehicleId} /></span>
        <VehicleSelect
          vehicles={vehicles}
          value={flow.vehicleId}
          flowWeightLbs={flow.weightLbs}
          onChange={vid => onChange({ ...flow, vehicleId: vid })}
        />
      </td>
      <td className="mono">{fmtCycle(derived.cycleSeconds)}</td>
      <td className="mono">{derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)}</td>
      <td><button type="button" className="flow-delete" onClick={onDelete} aria-label="Delete flow">×</button></td>
    </tr>
  )
}
```

- [ ] **Step 2: Create `FlowsTable.tsx`**

```tsx
'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import FlowRow from './FlowRow'

interface Props {
  flows: Flow[]
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onFlowsChange: (next: Flow[]) => void
}

function genId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 10)
}

function emptyFlow(): Flow {
  return { id: genId(), origin: '', destination: '', distanceFt: 0, thruPerHr: 0, weightLbs: 0, turns: 0 }
}

export default function FlowsTable({ flows, vehicles, derivedByFlowId, unitSystem, onFlowsChange }: Props) {
  const update = (id: string, next: Flow) => onFlowsChange(flows.map(f => f.id === id ? next : f))
  const remove = (id: string) => onFlowsChange(flows.filter(f => f.id !== id))
  const add = () => onFlowsChange([...flows, emptyFlow()])

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
              <th>#</th>
              <th>ORIGIN</th>
              <th>DESTINATION</th>
              <th>{distLabel}</th>
              <th>THRU/HR</th>
              <th>{weightLabel}</th>
              <th>TURNS</th>
              <th>VEHICLE</th>
              <th>CYCLE</th>
              <th>RAW VEH</th>
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
                derived={derivedByFlowId.get(f.id) ?? { cycleSeconds: null, rawVehicles: null }}
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

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
Expected: no new errors.

- [ ] **Step 4: Manual verify**

Visit `http://localhost:3000/projects/<id>/step3`:
- "0 flows + Add Flow" CTA on first visit.
- Adding a flow shows a row with inline inputs.
- Typing distance / thru / weight / turns + picking a vehicle populates Cycle and Raw Veh.
- Picking a vehicle whose maxWeight < weight is greyed out.
- Group card shows `BASE FLEET N | derivation: raw X.XX → ⌈ceil⌉ | HEADROOM | AVG CYCLE | TOTAL THRU`.

- [ ] **Step 5: Commit**

```bash
git add app/projects/[id]/step3/page.tsx src/components/step3/*.{ts,tsx}
git commit -m "feat(step3): inline-editable Material Flows page"
```

---

### Task 14 — CSS

> **Sub-skill:** superpowers:frontend-design.

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append**

```css
/* ===== Step 3 — Material Flows ===== */
.step3-page { display: flex; flex-direction: column; gap: 18px; }

.flow-group-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 14px;
}
.flow-group-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px;
}
.flow-group-head {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
}
.veh-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; border: 1px solid;
  font-family: var(--tal-font-family); font-size: 12px; font-weight: 600;
}
.veh-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.flow-group-count {
  font-family: var(--tal-font-numeric); font-size: 11px;
  color: var(--text-tertiary); letter-spacing: 0.08em;
}
.flow-group-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.flow-group-stats .label {
  font-family: var(--tal-font-numeric); font-size: 10px;
  color: var(--text-tertiary); letter-spacing: 0.1em;
}
.flow-group-stats .value {
  font-family: var(--tal-font-numeric); font-size: 24px; font-weight: 600;
  color: var(--text-primary); margin-top: 4px;
}
.flow-group-stats .value .unit { font-size: 12px; color: var(--text-tertiary); margin-left: 4px; }
.flow-group-stats .value.green  { color: var(--good); }
.flow-group-stats .value.yellow { color: var(--warn); }
.flow-group-stats .value.red    { color: var(--bad);  }
.flow-group-stats .derivation {
  margin-top: 6px; font-size: 10px; color: var(--text-tertiary);
}

.flows-table-wrap {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px;
}
.flows-table-head-row {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
}
.flows-count { font-family: var(--tal-font-numeric); font-size: 12px; color: var(--text-tertiary); }
.flows-table { width: 100%; border-collapse: collapse; font-family: var(--tal-font-family); font-size: 13px; }
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
.flow-cell:hover { border-color: var(--border); }
.flow-cell:focus { border-color: var(--border-strong); outline: none; background: var(--bg-hover); }
.flow-cell.mono  { font-family: var(--tal-font-numeric); }
.flow-veh-select {
  background: transparent; color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px;
}
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

- [ ] **Step 2: Visual check** in browser.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style(step3): table + group cards"
```

---

### Task 15 — CHANGELOG

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Prepend entry**

Add at the top (under `# Changelog`):

```markdown
## 2026-05-22 — Step 3 (v3): Material Flows

**Motivation:** Step 3 sizes the per-vehicle fleet from the engineer's flow definitions, producing a pure-engineering number with no safety multipliers. Step 4 (charging) and Step 5 (buffer) layer on top, each with distinct, named scope so the proposal team can defend every multiplier individually.

**Math (full derivation in `docs/SPECIFICATION.md`):**
- `cycleSec = distanceFt × (1/speedLoaded + 1/speedEmpty) + load + unload + turns × 4`
- `rawVehicles = thru × cycle / 3600`  (fractional, no factor)
- `baseFleet = ceil(Σ rawVehicles)` per vehicle type — Step 3's output
- No productivity factor η, no congestion multiplier. The one and only fleet uplift is the buffer in Step 5; physical losses from battery downtime are the additive Step 4 chargingDelta.

**Changes:**
- Rewrote `docs/SPECIFICATION.md` Step 3 chapter.
- New `src/calc/flowMetrics.ts` (pure) with TDD coverage: cycleSeconds, rawVehicles, flowDerived, groupSummary, projectFlowSummary.
- Added `flows: Flow[]` to `StoredProject` (schemas.ts + storage.ts + round-trip test).
- New page `app/projects/[id]/step3/page.tsx`, replacing the placeholder.
- New components: FlowsTable, FlowRow, VehicleSelect, GroupSummaryCard, vehicleColor.
- New CSS in `app/globals.css`.

**User-visible behavior:**
- Step 3 navigates from Step 2 and from PersistentHeader step dots.
- The flows table is fully inline-editable; every keystroke writes to storage.
- Group cards show the derivation `raw X.XX → ⌈ceil⌉` so the math is auditable on the page.
- Persistence: reloading restores everything.

**Pipeline preview:**
- Step 4 (charging) adds `chargingDelta` per group based on battery / cycle energy / charge rate.
- Step 5 (buffer) wraps `ceil((baseFleet + chargingDelta) × (1 + bufferPct))` per group — the sole multiplicative uplift in the pipeline.

**Open follow-ups (deferred):**
- Per-flow transfer-method picker (currently auto-uses `vehicle.transferMethods[0]`).
- CSV import.
- Per-vehicle `turnTimeSec` override (currently global 4 s).
```

- [ ] **Step 2: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): Step 3 v3 entry"
```

---

### Task 16 — Acceptance pass

> **Sub-skill:** superpowers:verification-before-completion.

- [ ] **Step 1: Run all calc + storage tests**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts src/lib/__tests__/storage.flows.test.ts`
Expected: PASS — full count from Tasks 3-8 (~24 tests).

- [ ] **Step 2: Reproduce the verification table in-browser**

Create a fresh project, enter the 8 flows from the spec's verification section (distance + thru as listed; turns = 0; transfer = default). Confirm:
- CB18 group card: `baseFleet = 6`, `groupRaw ≈ 5.58`.
- ML2 group card: `baseFleet = 2`, `groupRaw ≈ 1.66`.
- Footer: `8 flows · 221 cycles/hr · raw 7.24 → base fleet 8`.

- [ ] **Step 3: Edit any single flow's distance** — confirm Cycle and Raw Veh on that row, plus the group card's baseFleet and headroom, update instantly.

- [ ] **Step 4: Reload** — all values restore.

- [ ] **Step 5: Assign ML2 to a flow with weight 1984 lb** — disabled in dropdown.

- [ ] **Step 6: Delete a flow** — group card re-aggregates; if all flows of a vehicle are removed, that group card disappears.

- [ ] **Step 7: Calc-purity grep**

Run: `grep -rE "from 'react'|localStorage|fetch\\(" src/calc/`
Expected: nothing.

- [ ] **Step 8: Commit only if 1–7 surface a regression that needed code changes.**

---

## Self-Review

**Spec coverage:**
- Cycle with turns → Task 3.
- Raw vehicles → Task 4.
- flowDerived → Task 5.
- Group baseFleet (no congestion) → Task 6.
- Project totals → Task 7.
- Schema + persistence → Task 8.
- Vehicle color → Task 9.
- Page shell → Task 10.
- Group card UI → Task 11.
- Vehicle dropdown w/ weight gate → Task 12.
- Flows table + row → Task 13.
- CSS → Task 14.
- Changelog → Task 15.
- Acceptance → Task 16.

**Placeholders:** none — every step contains real code or commands.

**Type consistency:**
- `Flow` shape consistent across `types.ts`, `flowSchema`, `FlowRow` props, tests.
- `FlowDerived = { cycleSeconds, rawVehicles }` everywhere; no leftover `FlowMetrics` from earlier drafts.
- `GroupSummary` (no `groupCongested` or `FlowCalcConstants`) matches the v3 model and the `GroupSummaryCard` props.
- `groupSummary(vehicleId, flows, derivedByFlowId)` — three params, no constants object.

**Open design decisions (defaulted, documented in spec):**
1. Turn time is a global constant (4 s). Per-vehicle override deferred.
2. Per-flow transfer method defaults to index 0. Override UI deferred.
3. CSV import deferred to v3.1.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-step3-material-flows.md` (v3 replaces v2 at the same path).

**Execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task. Best given calc tasks are small, TDD-shaped, self-contained.

**2. Inline** — execute in this session via `executing-plans`, batch with checkpoints.

**3. Hold for review** — read the plan, push back, then run.

Which?
