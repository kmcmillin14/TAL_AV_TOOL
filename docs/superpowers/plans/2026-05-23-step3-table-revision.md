# Step 3 — Table Revision: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Calc tasks are TDD per superpowers:test-driven-development.

**Goal:** Revise the Step 3 Material Flows table per `docs/superpowers/specs/2026-05-23-step3-table-revision-design.md`: remove the Weight column (and its dropdown gate), move Vehicle to the leftmost editable column, add a per-row transfer-method chip picker, and add a click-to-open Cycle breakdown popover.

**Architecture:** Calc layer gains a pure `cycleBreakdown()` that returns the per-component split; `cycleSeconds()` becomes a thin delegate so all 12 existing tests continue to pass with zero behavior change. UI consumes the breakdown via `FlowDerived.breakdown` (cached in the existing `derivedByFlowId` map — no extra recomputation). Two new components in `src/components/step3/`: `TransferMethodChips` and `CyclePopover`.

**Tech Stack:** Next.js 16.2.5 App Router (client components), TypeScript strict, React 19, Vitest, Zod 4, Toyota Type fonts.

**Project rules (from `CLAUDE.md` + `ARCHITECTURE.md`):** Imperial-first; calc must stay pure (no React/fetch/localStorage in `src/calc/`); spec-first (update `docs/SPECIFICATION.md` + `docs/CHANGELOG.md` before code); Toyota Type only; folder hygiene (delete orphans in same commit). Auto-commit rule: after every task commit, `git push origin main`.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `docs/SPECIFICATION.md` | modify | Drop `weightLbs` from Step 3 per-flow inputs; replace "Hard gates per flow" paragraph. |
| `docs/CHANGELOG.md` | modify | Prepend a 2026-05-23 entry. |
| `src/calc/types.ts` | modify | Add `CycleBreakdown` type; drop `weightLbs` from `Flow`; add `breakdown` to `FlowDerived`. |
| `src/calc/flowMetrics.ts` | modify | Add `cycleBreakdown`; refactor `cycleSeconds` to delegate; update `flowDerived` to populate `breakdown`. |
| `src/calc/__tests__/flowMetrics.test.ts` | modify | Add `cycleBreakdown` describe block. |
| `src/lib/validations/schemas.ts` | modify | Drop `weightLbs` from `flowSchema`. |
| `src/lib/__tests__/storage.flows.test.ts` | modify | Drop `weightLbs` from the fixture. |
| `src/components/step3/FlowRow.tsx` | modify | Reorder cells; drop weight cell + setter; mount `TransferMethodChips` + `CyclePopover`; reset `transferMethodIdx` on vehicle change. |
| `src/components/step3/FlowsTable.tsx` | modify | Reorder headers; drop weight header; drop `weightLbs` from `emptyFlow()`. |
| `src/components/step3/VehicleSelect.tsx` | modify | Drop `flowWeightLbs` prop and overweight disable branch. |
| `src/components/step3/TransferMethodChips.tsx` | **create** | Chip picker for `transferMethods[i]`. |
| `src/components/step3/CyclePopover.tsx` | **create** | Absolute-positioned popover showing the breakdown; closes on outside-click + Escape. |
| `app/globals.css` | modify | Append rules for `.transfer-chips`, `.transfer-chip`, `.flow-calc-trigger`, `.cycle-popover`. |

**Module-boundary check** (ARCHITECTURE.md §4): `flowMetrics.ts` still imports only types — no React, no fetch, no localStorage. `TransferMethodChips` and `CyclePopover` are `'use client'` components that take props only — no direct storage or fetch.

---

## Tasks

### Task 1 — Spec + Changelog

**Files:**
- Modify: `docs/SPECIFICATION.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Drop `weightLbs` from Step 3 per-flow inputs in `docs/SPECIFICATION.md`**

In `docs/SPECIFICATION.md`, find the "Per-flow inputs" bulleted list under "Step 3 — Material Flows". Remove the line:

```
- `weightLbs` — per-cycle load weight, lbs, ≥ 0
```

- [ ] **Step 2: Replace the "Hard gates per flow" paragraph**

In `docs/SPECIFICATION.md`, find:

```markdown
### Hard gates per flow

A vehicle is **disabled** in the row's dropdown when `flow.weightLbs > vehicle.calc.maxWeightLbs`. Hard gate; no override. Matches Step 2's rule.
```

Replace with:

```markdown
### Hard gates per flow

Step 3 imposes **no** per-flow hard gates. Step 2 already qualifies the vehicle library against the project-wide `maxLoadWeightLbs`; engineers picking a vehicle here have already seen that qualification matrix. Per-flow weight is not collected.
```

- [ ] **Step 3: Prepend a CHANGELOG entry**

Open `docs/CHANGELOG.md`. Immediately under the `# Changelog` heading, prepend:

```markdown
## 2026-05-23 — Step 3 table revision

**Motivation:** First-use feedback on the Step 3 table. Weight wasn't used in any calc — only by a dropdown disable that duplicates Step 2's qualification. Vehicle belongs on the left (it's the first thing the engineer decides). Vehicles with multiple transfer methods (CB18, 8tb50a) couldn't be modeled correctly because the picker was hidden. Cycle was opaque — a single number with no derivation.

**Changes:**
- Removed `weightLbs` from `Flow`, `flowSchema`, the table column, and the dropdown weight gate. Old exported projects with `weightLbs` still load (Zod strips unknown keys).
- Moved Vehicle to the leftmost editable column.
- Added a per-row transfer-method chip picker (`TransferMethodChips`). Switching vehicles resets `transferMethodIdx` to 0.
- Added a click-to-open Cycle breakdown popover (`CyclePopover`) anchored to the Cycle cell. Shows travel-loaded / travel-empty / load / unload / lift / turns / total.
- Calc layer gained a pure `cycleBreakdown()`; `cycleSeconds()` now delegates to it. Zero behavior change for existing callers.

**Pipeline preview unchanged:** Step 4 adds `chargingDelta`; Step 5 wraps the buffer.
```

- [ ] **Step 4: Commit + push**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: Step 3 table revision spec + changelog

Remove per-flow weightLbs from the spec, drop the dropdown weight
gate paragraph (Step 2 already qualifies on project-wide weight),
and log the upcoming UI revision.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2 — `cycleBreakdown` (TDD) + refactor `cycleSeconds` + extend `FlowDerived`

> **Sub-skill:** superpowers:test-driven-development.

**Files:**
- Modify: `src/calc/types.ts`
- Modify: `src/calc/flowMetrics.ts`
- Modify: `src/calc/__tests__/flowMetrics.test.ts`

- [ ] **Step 1: Add `CycleBreakdown` type and extend `FlowDerived`**

In `src/calc/types.ts`, find the existing `FlowDerived` interface:

```typescript
export interface FlowDerived {
  cycleSeconds: number | null
  rawVehicles: number | null   // fractional; demand-only
}
```

Replace with:

```typescript
export interface CycleBreakdown {
  travelLoadedSec: number
  travelEmptySec: number
  loadSec: number
  unloadSec: number
  liftTimeSec: number
  turnPenaltySec: number
  totalSec: number
}

export interface FlowDerived {
  cycleSeconds: number | null
  rawVehicles: number | null   // fractional; demand-only
  breakdown: CycleBreakdown | null
}
```

- [ ] **Step 2: Write the failing `cycleBreakdown` tests**

In `src/calc/__tests__/flowMetrics.test.ts`, append at the bottom of the file (after the last existing `describe` block):

```typescript
import { cycleBreakdown } from '../flowMetrics'

describe('cycleBreakdown', () => {
  it('returns components that sum to totalSec (CB18, 100 ft, 2 turns, Fork, 0 lift)', () => {
    const b = cycleBreakdown(100, cb18 as Vehicle, 2, 0, 0)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.travelLoadedSec).toBeCloseTo(100 / 9.84, 3)
    expect(b.travelEmptySec).toBeCloseTo(100 / 11.5, 3)
    expect(b.loadSec).toBe(5)
    expect(b.unloadSec).toBe(5)
    expect(b.liftTimeSec).toBe(0)
    expect(b.turnPenaltySec).toBe(8)
    const sum = b.travelLoadedSec + b.travelEmptySec
              + b.loadSec + b.unloadSec
              + b.liftTimeSec + b.turnPenaltySec
    expect(b.totalSec).toBeCloseTo(sum, 5)
  })

  it('adds lift time when transfer method has lifts: true and liftSpeedFps > 0', () => {
    // Same CB18 fixture but transfer index 1 doesn't have lifts: true in this fixture;
    // build a local lifting vehicle to make the assertion airtight.
    const lifter: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      calc: {
        speedLoadedFps: 9.84,
        speedUnloadedFps: 11.5,
        liftSpeedFps: 0.5,
      } as Vehicle['calc'],
      transferMethods: [
        { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8, lifts: true },
      ],
    }
    const b = cycleBreakdown(0, lifter as Vehicle, 0, 10, 0)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.liftTimeSec).toBe(20)        // 10 ft / 0.5 fps = 20 s
    expect(b.totalSec).toBeCloseTo(8 + 8 + 20, 5)
  })

  it('returns null for the same edge cases as cycleSeconds', () => {
    expect(cycleBreakdown(-1, cb18 as Vehicle, 0, 0, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, -1, 0, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 0, -1, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 0, 0, 99)).toBeNull()
    const noTransfers = { ...cb18, transferMethods: [] }
    expect(cycleBreakdown(100, noTransfers as Vehicle, 0, 0, 0)).toBeNull()
  })
})
```

- [ ] **Step 3: Run — fail**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: FAIL — `cycleBreakdown is not exported from '../flowMetrics'`.

- [ ] **Step 4: Implement `cycleBreakdown` and refactor `cycleSeconds`**

Open `src/calc/flowMetrics.ts`. Replace the current top of the file (the imports, `cycleSeconds` body) with:

```typescript
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { TURN_TIME_SEC } from './types'
import type {
  Flow,
  FlowDerived,
  CycleBreakdown,
  GroupSummary,
  ProjectFlowSummary,
} from './types'

/**
 * Per-component breakdown of a flow's round-trip cycle time. Pure.
 *
 *   travelLoaded + travelEmpty + load + unload + lift + turns = total
 *
 * `liftTimeSec` is 0 unless the chosen transfer method has `lifts: true`
 * AND the vehicle declares a positive `liftSpeedFps`. Returns `null` for
 * the same input conditions that make `cycleSeconds` undefined.
 */
export function cycleBreakdown(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  liftHeightFt: number,
  transferMethodIdx: number = 0,
): CycleBreakdown | null {
  if (distanceFt < 0) return null
  if (turns < 0) return null
  if (liftHeightFt < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null

  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty = vehicle.calc.speedUnloadedFps
  if (!sLoaded || sLoaded <= 0) return null
  if (!sEmpty || sEmpty <= 0) return null

  const travelLoadedSec = distanceFt / sLoaded
  const travelEmptySec = distanceFt / sEmpty
  const loadSec = transfer.loadTimeSec
  const unloadSec = transfer.unloadTimeSec
  const liftSpeed = vehicle.calc.liftSpeedFps
  const liftTimeSec = transfer.lifts && liftSpeed && liftSpeed > 0
    ? liftHeightFt / liftSpeed
    : 0
  const turnPenaltySec = turns * TURN_TIME_SEC
  const totalSec =
    travelLoadedSec + travelEmptySec +
    loadSec + unloadSec +
    liftTimeSec + turnPenaltySec

  return {
    travelLoadedSec,
    travelEmptySec,
    loadSec,
    unloadSec,
    liftTimeSec,
    turnPenaltySec,
    totalSec,
  }
}

/**
 * Round-trip cycle time in seconds. Thin delegate over `cycleBreakdown`.
 *
 *   cycle = (distance / speedLoaded) + (distance / speedUnloaded)
 *         + load + unload
 *         + (lifts ? liftHeightFt / liftSpeedFps : 0)
 *         + turns × TURN_TIME_SEC
 *
 * Returns `null` when inputs make the calculation undefined. Callers display
 * "—" rather than render a number.
 */
export function cycleSeconds(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  liftHeightFt: number,
  transferMethodIdx: number = 0,
): number | null {
  return cycleBreakdown(distanceFt, vehicle, turns, liftHeightFt, transferMethodIdx)?.totalSec ?? null
}
```

- [ ] **Step 5: Update `flowDerived` to populate `breakdown`**

In the same file, replace `flowDerived` with:

```typescript
/**
 * Compose `cycleBreakdown` and `rawVehicles` for one flow. Pure wrapper.
 * The breakdown is precomputed once per flow so the UI can render the
 * per-component popover without recomputing.
 */
export function flowDerived(
  flow: Flow,
  vehicle: Vehicle | undefined,
): FlowDerived {
  if (!vehicle) return { cycleSeconds: null, rawVehicles: null, breakdown: null }
  const breakdown = cycleBreakdown(
    flow.distanceFt,
    vehicle,
    flow.turns,
    flow.liftHeightFt,
    flow.transferMethodIdx ?? 0,
  )
  const cycle = breakdown?.totalSec ?? null
  return {
    cycleSeconds: cycle,
    rawVehicles: rawVehicles(flow.thruPerHr, cycle),
    breakdown,
  }
}
```

- [ ] **Step 6: Run — pass**

Run: `npx vitest run src/calc/__tests__/flowMetrics.test.ts`
Expected: all `cycleSeconds`, `rawVehicles`, `flowDerived`, `groupSummary`, `projectFlowSummary`, and `cycleBreakdown` tests PASS. ~3 new tests added → ≥ 26 tests in this file.

- [ ] **Step 7: Full suite + typecheck + calc purity**

Run, in parallel:
- `npx vitest run`
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `grep -rE "from 'react'|localStorage|fetch\(" src/calc/`

Expected:
- vitest: ≥ 87 tests PASS.
- tsc: no errors after grep filter.
- grep: empty output (calc layer pure).

- [ ] **Step 8: Commit + push**

```bash
git add src/calc/types.ts src/calc/flowMetrics.ts src/calc/__tests__/flowMetrics.test.ts
git commit -m "feat(calc): cycleBreakdown + thread breakdown through FlowDerived

Add a pure cycleBreakdown() returning travel/load/unload/lift/turns/total
components. cycleSeconds() now delegates to it; behavior unchanged.
FlowDerived gains a breakdown field so the UI can render the per-component
popover without recomputing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3 — Remove Weight column (schema + UI + tests, atomic)

**Files:**
- Modify: `src/calc/types.ts`
- Modify: `src/lib/validations/schemas.ts`
- Modify: `src/lib/__tests__/storage.flows.test.ts`
- Modify: `src/components/step3/FlowRow.tsx`
- Modify: `src/components/step3/FlowsTable.tsx`
- Modify: `src/components/step3/VehicleSelect.tsx`

- [ ] **Step 1: Drop `weightLbs` from `Flow` interface**

In `src/calc/types.ts`, find the `Flow` interface. Remove the `weightLbs: number` line. The interface should read:

```typescript
export interface Flow {
  id: string
  origin: string
  destination: string
  distanceFt: number           // ≥ 0; one-way
  thruPerHr: number            // cycles/hr, ≥ 0
  turns: number                // count, integer ≥ 0
  liftHeightFt: number         // ft, ≥ 0; total vertical travel per cycle
  vehicleId?: string
  transferMethodIdx?: number   // defaults to 0
}
```

- [ ] **Step 2: Drop `weightLbs` from `flowSchema`**

In `src/lib/validations/schemas.ts`, find `flowSchema`. Remove the `weightLbs` line so it reads:

```typescript
export const flowSchema = z.object({
  id: z.string(),
  origin: z.string().default(''),
  destination: z.string().default(''),
  distanceFt: z.number().min(0).default(0),
  thruPerHr: z.number().min(0).default(0),
  turns: z.number().int().min(0).default(0),
  liftHeightFt: z.number().min(0).default(0),
  vehicleId: z.string().optional(),
  transferMethodIdx: z.number().int().min(0).optional(),
})
```

- [ ] **Step 3: Drop `weightLbs` from the storage fixture**

In `src/lib/__tests__/storage.flows.test.ts`, find the flow fixture inside `updateProject(...)`. Remove the `weightLbs: 500,` line. The flow should read:

```typescript
flows: [{
  id: 'f1',
  origin: 'A',
  destination: 'B',
  distanceFt: 100,
  thruPerHr: 10,
  turns: 1,
  liftHeightFt: 0,
  vehicleId: 'cb18',
}],
```

- [ ] **Step 4: Drop `flowWeightLbs` from `VehicleSelect`**

Replace the entire body of `src/components/step3/VehicleSelect.tsx` with:

```tsx
'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { vehicleColor } from './vehicleColor'

interface Props {
  vehicles: Vehicle[]
  value?: string
  onChange: (vehicleId: string | undefined) => void
}

export default function VehicleSelect({ vehicles, value, onChange }: Props) {
  return (
    <select
      className="flow-veh-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
    >
      <option value="">— pick vehicle —</option>
      {vehicles.map(v => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
    </select>
  )
}

export function VehicleDot({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return <span className="veh-dot veh-dot-empty" />
  return <span className="veh-dot" style={{ background: vehicleColor(vehicleId) }} />
}
```

- [ ] **Step 5: Strip weight from `FlowRow`**

In `src/components/step3/FlowRow.tsx`, remove:
- The `weightDisplay` const (lines around 48–50).
- The `setWeight` function (lines around 59–62).
- The `overweight` const (lines around 71–73).
- The entire `<td>` containing the weight `<input className={`flow-cell mono ${overweight ? 'flow-cell-bad' : ''}`} ...>` block (lines around 127–141).
- The `flowWeightLbs={flow.weightLbs}` prop in the `<VehicleSelect>` call (around line 174).

(Column reorder happens in Task 4 — for now, just delete the weight cell and prop. The order of the remaining cells stays the same.)

- [ ] **Step 6: Strip weight from `FlowsTable`**

In `src/components/step3/FlowsTable.tsx`:

1. Remove the `weightLabel` const inside the `FlowsTable` function (around line 47).
2. Remove the `<th>{weightLabel}</th>` element from the table header.
3. Update `emptyFlow()`:

```typescript
function emptyFlow(): Flow {
  return {
    id: genId(),
    origin: '',
    destination: '',
    distanceFt: 0,
    thruPerHr: 0,
    turns: 0,
    liftHeightFt: 0,
  }
}
```

- [ ] **Step 7: Typecheck + vitest + dev server probe**

Run, in parallel:
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `npx vitest run`
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/projects/p_test/step3` (if dev server is running)

Expected: tsc clean, all tests PASS, dev server returns 200.

- [ ] **Step 8: Commit + push**

```bash
git add src/calc/types.ts src/lib/validations/schemas.ts src/lib/__tests__/storage.flows.test.ts src/components/step3/FlowRow.tsx src/components/step3/FlowsTable.tsx src/components/step3/VehicleSelect.tsx
git commit -m "feat(step3): remove per-flow weight column and dropdown gate

weightLbs was never used in calc — only in a vehicle-dropdown disable
that duplicates Step 2's project-wide weight qualification. Drop the
field from Flow, flowSchema, the storage fixture, the table column,
and VehicleSelect. Zod strips it from old exported projects on load.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4 — Vehicle to leftmost editable column

**Files:**
- Modify: `src/components/step3/FlowRow.tsx`
- Modify: `src/components/step3/FlowsTable.tsx`

New header order: `# | Vehicle | Origin | Destination | Distance | Thru/hr | Turns | Lift | Cycle | Raw veh | ×`.

- [ ] **Step 1: Reorder headers in `FlowsTable.tsx`**

In `FlowsTable.tsx`, replace the existing `<thead><tr>` block with:

```tsx
<thead>
  <tr>
    <th className="flow-th-num">#</th>
    <th>Vehicle</th>
    <th>Origin</th>
    <th>Destination</th>
    <th className="flow-th-num">{distLabel}</th>
    <th className="flow-th-num">Thru/hr</th>
    <th className="flow-th-num">Turns</th>
    <th className="flow-th-num">{liftLabel}</th>
    <th className="flow-th-num">Cycle</th>
    <th className="flow-th-num" title="Fractional raw demand: thru × cycle / 3600">Raw veh</th>
    <th className="flow-th-act"></th>
  </tr>
</thead>
```

- [ ] **Step 2: Reorder cells in `FlowRow.tsx`**

In `FlowRow.tsx`, replace the entire `return (...)` block so the cells appear in this order: row-num → Vehicle → Origin → Destination → Distance → Thru/hr → Turns → Lift → Cycle → Raw veh → delete. The Vehicle cell stays as-is from Task 3 (the `<VehicleDot>` + `<VehicleSelect>` composition); only its position moves.

```tsx
return (
  <tr className="flow-row">
    <td className="flow-row-num mono">{String(index + 1).padStart(2, '0')}</td>

    <td className="flow-veh-cell">
      <VehicleDot vehicleId={flow.vehicleId} />
      <VehicleSelect
        vehicles={vehicles}
        value={flow.vehicleId}
        onChange={vid => onChange({ ...flow, vehicleId: vid })}
      />
    </td>

    <td className="flow-cell-wrap">
      <input
        className="flow-cell"
        value={flow.origin}
        onChange={e => onChange({ ...flow, origin: e.target.value })}
        placeholder="e.g. Dock A"
      />
    </td>
    <td className="flow-cell-wrap">
      <input
        className="flow-cell"
        value={flow.destination}
        onChange={e => onChange({ ...flow, destination: e.target.value })}
        placeholder="e.g. Storage 1"
      />
    </td>

    <td className="flow-cell-wrap">
      <input
        className="flow-cell mono"
        type="number"
        min="0"
        inputMode="decimal"
        value={distDisplay}
        onChange={e => setDistance(e.target.value)}
      />
    </td>
    <td className="flow-cell-wrap">
      <input
        className="flow-cell mono"
        type="number"
        min="0"
        inputMode="decimal"
        value={flow.thruPerHr}
        onChange={e =>
          onChange({ ...flow, thruPerHr: clampNum(e.target.value) })
        }
      />
    </td>
    <td className="flow-cell-wrap">
      <input
        className="flow-cell mono"
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={flow.turns}
        onChange={e =>
          onChange({
            ...flow,
            turns: Math.floor(clampNum(e.target.value)),
          })
        }
      />
    </td>
    <td className="flow-cell-wrap">
      <input
        className="flow-cell mono"
        type="number"
        min="0"
        inputMode="decimal"
        value={liftDisplay}
        onChange={e => setLift(e.target.value)}
      />
    </td>

    <td className="flow-calc mono">{fmtCycle(derived.cycleSeconds)}</td>
    <td className={`flow-calc mono ${rawTone}`}>{rawDisplay}</td>

    <td className="flow-row-act">
      <button
        type="button"
        className="flow-delete"
        onClick={onDelete}
        aria-label="Delete flow"
        title="Delete flow"
      >
        ×
      </button>
    </td>
  </tr>
)
```

- [ ] **Step 3: Verify**

Run, in parallel:
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `npx vitest run`

Expected: tsc clean, all tests PASS.

- [ ] **Step 4: Commit + push**

```bash
git add src/components/step3/FlowRow.tsx src/components/step3/FlowsTable.tsx
git commit -m "feat(step3): vehicle column moves to leftmost editable position

Reorder the flow table so the engineer picks a vehicle before any
other field. Header + row cells move in lockstep; behavior unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5 — `TransferMethodChips` + `FlowRow` integration + reset on vehicle change

> **Sub-skill:** superpowers:frontend-design (the chip group is a small UI primitive — keep it composable with the existing dark-theme tokens).

**Files:**
- Create: `src/components/step3/TransferMethodChips.tsx`
- Modify: `src/components/step3/FlowRow.tsx`

- [ ] **Step 1: Create `TransferMethodChips.tsx`**

Create `src/components/step3/TransferMethodChips.tsx`:

```tsx
'use client'

import type { TransferMethod } from '@/src/lib/vehicleLibrary'

interface Props {
  methods: TransferMethod[]
  activeIdx: number
  onChange: (idx: number) => void
}

/**
 * Per-flow transfer-method picker. Renders one chip per method for vehicles
 * with multiple transfer methods; renders static text for single-method
 * vehicles; renders nothing when no methods are available.
 */
export default function TransferMethodChips({ methods, activeIdx, onChange }: Props) {
  if (!methods || methods.length === 0) return null

  if (methods.length === 1) {
    return (
      <span className="transfer-chip-static">{methods[0].method}</span>
    )
  }

  return (
    <div className="transfer-chips" role="radiogroup" aria-label="Transfer method">
      {methods.map((m, i) => {
        const active = i === activeIdx
        return (
          <button
            key={`${m.method}-${i}`}
            type="button"
            role="radio"
            aria-checked={active}
            className={`transfer-chip ${active ? 'active' : ''}`}
            onClick={() => onChange(i)}
            title={`${m.method} — load ${m.loadTimeSec}s / unload ${m.unloadTimeSec}s${m.lifts ? ' (lifts)' : ''}`}
          >
            {m.method}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Mount `TransferMethodChips` in `FlowRow` and reset on vehicle change**

In `src/components/step3/FlowRow.tsx`:

1. Add the import at the top, next to `VehicleSelect`:

```tsx
import TransferMethodChips from './TransferMethodChips'
```

2. Inside the component body, add a helper that resets `transferMethodIdx` whenever the vehicle changes. Replace the existing vehicle `onChange` in the `<VehicleSelect>` call with a new handler. Find:

```tsx
<VehicleSelect
  vehicles={vehicles}
  value={flow.vehicleId}
  onChange={vid => onChange({ ...flow, vehicleId: vid })}
/>
```

Replace with:

```tsx
<VehicleSelect
  vehicles={vehicles}
  value={flow.vehicleId}
  onChange={vid =>
    onChange({
      ...flow,
      vehicleId: vid,
      transferMethodIdx: vid ? 0 : undefined,
    })
  }
/>
```

3. Right below the `<VehicleSelect>` (still inside the `<td className="flow-veh-cell">`), append the chip group:

```tsx
{selectedVehicle && (
  <TransferMethodChips
    methods={selectedVehicle.transferMethods}
    activeIdx={flow.transferMethodIdx ?? 0}
    onChange={idx => onChange({ ...flow, transferMethodIdx: idx })}
  />
)}
```

4. The cell needs to flex vertically now. The existing `flow-veh-cell` class is `display: flex; align-items: center; gap: 8px` (horizontal). Change the `<td>` to wrap the dropdown + chips in a vertical stack:

```tsx
<td className="flow-veh-cell">
  <div className="flow-veh-stack">
    <div className="flow-veh-row">
      <VehicleDot vehicleId={flow.vehicleId} />
      <VehicleSelect
        vehicles={vehicles}
        value={flow.vehicleId}
        onChange={vid =>
          onChange({
            ...flow,
            vehicleId: vid,
            transferMethodIdx: vid ? 0 : undefined,
          })
        }
      />
    </div>
    {selectedVehicle && (
      <TransferMethodChips
        methods={selectedVehicle.transferMethods}
        activeIdx={flow.transferMethodIdx ?? 0}
        onChange={idx => onChange({ ...flow, transferMethodIdx: idx })}
      />
    )}
  </div>
</td>
```

CSS for `.flow-veh-stack`, `.flow-veh-row`, `.transfer-chips`, `.transfer-chip`, `.transfer-chip-static` lands in Task 7 — until then the chips render as default browser buttons. That's fine for the typecheck/test pass.

- [ ] **Step 3: Verify**

Run, in parallel:
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `npx vitest run`

Expected: tsc clean, all tests PASS.

- [ ] **Step 4: Commit + push**

```bash
git add src/components/step3/TransferMethodChips.tsx src/components/step3/FlowRow.tsx
git commit -m "feat(step3): per-row transfer-method chip picker

New TransferMethodChips component renders one chip per vehicle.transferMethods[i]
when the vehicle has > 1; static text otherwise. Mounted under the
VehicleSelect in each row. Switching vehicles resets transferMethodIdx
to 0 (indices don't translate across vehicles).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6 — `CyclePopover` + `FlowRow` integration

> **Sub-skill:** superpowers:frontend-design.

**Files:**
- Create: `src/components/step3/CyclePopover.tsx`
- Modify: `src/components/step3/FlowRow.tsx`

- [ ] **Step 1: Create `CyclePopover.tsx`**

Create `src/components/step3/CyclePopover.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type { CycleBreakdown } from '@/src/calc/types'

interface Props {
  breakdown: CycleBreakdown
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}

function fmt(sec: number): string {
  return `${sec.toFixed(1)}s`
}

/**
 * Absolute-positioned breakdown popover, anchored to its parent
 * (which must be `position: relative`). Closes on outside-click
 * and on Escape. The trigger button passes its ref so clicks on
 * the trigger itself don't immediately close the popover.
 */
export default function CyclePopover({ breakdown, onClose, triggerRef }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose, triggerRef])

  return (
    <div ref={popoverRef} className="cycle-popover" role="dialog" aria-label="Cycle breakdown">
      <div className="cycle-popover-title">Cycle breakdown</div>
      <dl className="cycle-popover-list">
        <div className="cycle-popover-row">
          <dt>Travel loaded</dt>
          <dd className="mono">{fmt(breakdown.travelLoadedSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Travel empty</dt>
          <dd className="mono">{fmt(breakdown.travelEmptySec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Load</dt>
          <dd className="mono">{fmt(breakdown.loadSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Unload</dt>
          <dd className="mono">{fmt(breakdown.unloadSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Lift</dt>
          <dd className="mono">{fmt(breakdown.liftTimeSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Turns</dt>
          <dd className="mono">{fmt(breakdown.turnPenaltySec)}</dd>
        </div>
        <div className="cycle-popover-row total">
          <dt>Total</dt>
          <dd className="mono">{fmt(breakdown.totalSec)}</dd>
        </div>
      </dl>
    </div>
  )
}
```

- [ ] **Step 2: Mount the popover in `FlowRow`**

In `src/components/step3/FlowRow.tsx`:

1. Add imports at the top:

```tsx
import { useRef, useState } from 'react'
import CyclePopover from './CyclePopover'
```

2. Inside the `FlowRow` function body, before the `return`, add:

```tsx
const [cycleOpen, setCycleOpen] = useState(false)
const cycleTriggerRef = useRef<HTMLButtonElement>(null)
const cycleDisabled = derived.cycleSeconds == null || derived.breakdown == null
```

3. Replace the Cycle cell. Find:

```tsx
<td className="flow-calc mono">{fmtCycle(derived.cycleSeconds)}</td>
```

Replace with:

```tsx
<td className="flow-calc-cell">
  <div className="flow-calc-wrap">
    <button
      ref={cycleTriggerRef}
      type="button"
      className="flow-calc-trigger mono"
      disabled={cycleDisabled}
      onClick={() => setCycleOpen(o => !o)}
      aria-haspopup="dialog"
      aria-expanded={cycleOpen}
      title={cycleDisabled ? undefined : 'Click for cycle breakdown'}
    >
      {fmtCycle(derived.cycleSeconds)}
    </button>
    {cycleOpen && derived.breakdown && (
      <CyclePopover
        breakdown={derived.breakdown}
        triggerRef={cycleTriggerRef}
        onClose={() => setCycleOpen(false)}
      />
    )}
  </div>
</td>
```

(CSS classes `.flow-calc-cell`, `.flow-calc-wrap`, `.flow-calc-trigger`, `.cycle-popover*` arrive in Task 7. Until then the cell renders as a plain button.)

- [ ] **Step 3: Verify**

Run, in parallel:
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `npx vitest run`

Expected: tsc clean, all tests PASS.

- [ ] **Step 4: Commit + push**

```bash
git add src/components/step3/CyclePopover.tsx src/components/step3/FlowRow.tsx
git commit -m "feat(step3): click-to-open cycle breakdown popover

CyclePopover renders the breakdown returned by cycleBreakdown:
travel-loaded, travel-empty, load, unload, lift, turns, total.
Anchored to the Cycle cell; closes on outside-click and Escape.
Disabled when no vehicle is assigned (no breakdown to show).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7 — CSS for chips + popover

> **Sub-skill:** superpowers:frontend-design. Use existing tokens from `app/globals.css` — `--bg-surface-2`, `--border`, `--border-strong`, `--text-primary/secondary/tertiary`, `--accent`, `--good`, `--bad`. Toyota Type only via `var(--tal-font-family)` / `var(--tal-font-numeric)`.

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append the new rules**

At the end of `app/globals.css` (after the existing Step 3 block from `/* ============================================ STEP 3 — MATERIAL FLOWS ============================================ */`), append:

```css
/* ---- Step 3 — transfer-method chips ---- */
.flow-veh-cell { padding: 6px 6px; min-width: 180px; }
.flow-veh-stack { display: flex; flex-direction: column; gap: 6px; }
.flow-veh-row { display: flex; align-items: center; gap: 8px; }
.transfer-chips {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding-left: 16px;
}
.transfer-chip {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 10px;
  font-family: var(--tal-font-numeric);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}
.transfer-chip:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--text-secondary);
}
.transfer-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.transfer-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.transfer-chip-static {
  padding-left: 16px;
  font-family: var(--tal-font-numeric);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

/* ---- Step 3 — cycle breakdown popover ---- */
.flow-calc-cell {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
}
.flow-calc-wrap {
  position: relative;
  display: inline-block;
}
.flow-calc-trigger {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: var(--tal-font-numeric);
  font-variant-numeric: tabular-nums;
  font-feature-settings: var(--tal-numeric-features);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
}
.flow-calc-trigger:hover:not(:disabled) {
  background: var(--bg-input);
  border-color: var(--border);
}
.flow-calc-trigger:focus-visible {
  outline: none;
  background: var(--bg-input);
  border-color: var(--border-strong);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.flow-calc-trigger:disabled {
  cursor: default;
  color: var(--text-tertiary);
}
.cycle-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 220px;
  padding: 12px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
.cycle-popover-title {
  font-family: var(--tal-font-numeric);
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}
.cycle-popover-list {
  display: flex; flex-direction: column;
  gap: 4px;
  margin: 0;
}
.cycle-popover-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: 16px;
  font-family: var(--tal-font-family);
  font-size: 12px;
}
.cycle-popover-row dt { color: var(--text-secondary); margin: 0; }
.cycle-popover-row dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.cycle-popover-row.total {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px solid var(--border);
  font-weight: 700;
}
.cycle-popover-row.total dt { color: var(--text-primary); }
.cycle-popover-row.total dd { color: var(--accent); }
```

- [ ] **Step 2: Visual check in browser**

If the dev server is running on `localhost:3000`:
1. Load a project's Step 3 page.
2. Add a flow → confirm Vehicle column is leftmost and chips render below the dropdown for CB18 (Fork | Lift Platform).
3. Click "Lift Platform" → chip flips to active state (red border + soft background); Cycle recomputes.
4. Click the Cycle cell → popover appears below it, right-aligned to the cell, with the seven rows (Travel loaded / empty / Load / Unload / Lift / Turns / Total) and Total in accent red.
5. Click outside → popover closes. Press Escape → popover closes.

(If no dev server is running, skip — Task 8 catches this.)

- [ ] **Step 3: Commit + push**

```bash
git add app/globals.css
git commit -m "style(step3): transfer-method chips + cycle breakdown popover

CSS for the chip group (active state uses --accent-soft + --accent),
the cycle trigger button, and the absolute-positioned popover panel
(--bg-surface-2 background, shadow, accent total).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8 — Acceptance pass

> **Sub-skill:** superpowers:verification-before-completion.

- [ ] **Step 1: Full automated checks**

Run, in parallel:
- `npx tsc --noEmit 2>&1 | grep -v pdfExport.test`
- `npx vitest run`
- `grep -rE "from 'react'|localStorage|fetch\(" src/calc/`
- `npm run build` (or `npx next build`)

Expected:
- tsc: empty after grep filter.
- vitest: ≥ 87 tests PASS (84 prior + ≥ 3 new in `cycleBreakdown`).
- grep: empty output.
- next build: success.

- [ ] **Step 2: Manual browser verification**

In a browser at `http://localhost:3000/projects/<existing-project-id>/step3`:

1. **Column order:** `#` is leftmost, then Vehicle, then Origin … then Cycle, Raw veh, ×. No Weight column anywhere.
2. **Add a flow:** click "+ Add Flow" — new row appears with the Vehicle dropdown unselected.
3. **Pick CB18:** dropdown change → chip group appears below the dropdown showing "Fork" (active) and "Lift Platform".
4. **Click Lift Platform:** chip flips active; Cycle recomputes; if `liftHeightFt > 0`, Cycle increases by exactly `liftHeightFt / 0.5` seconds.
5. **Click Cycle cell:** popover opens, anchored to the cell. Numbers in the popover sum to the Cycle cell value.
6. **Click outside the popover:** popover closes.
7. **Re-open and press Escape:** popover closes.
8. **Switch vehicle to ML2:** chip group disappears (ML2 has 1 transfer method); static text "Fork" appears under the dropdown. `transferMethodIdx` resets to 0 (no leftover "Lift Platform" selection).
9. **Reload the page:** all selections persist (vehicleId + transferMethodIdx + every flow field).
10. **Verification table:** with the 8 verification rows from `docs/SPECIFICATION.md` (turns = 0, lift = 0, transfer = default), `baseFleet` for CB18 = 6 and for ML2 = 2; project footer reads `Base Fleet 8`.

- [ ] **Step 3: Load an old exported project (back-compat check)**

If any exported `.json` from before this revision exists locally, re-import it via the home page or PersistentHeader Import button. Expected: project loads cleanly; flows render with all other fields intact; the dropped `weightLbs` field is silently absent.

(If no pre-revision export exists, manually craft one: copy a current exported JSON, add `"weightLbs": 1234` to each flow entry, re-import. Expected: same — Zod's `.parse()` strips the unknown key.)

- [ ] **Step 4: Commit only if 1–3 surfaced regressions that needed code changes.**

If no regressions, no commit needed.

---

## Self-Review

**Spec coverage:**
- §2.A Remove Weight column → Task 3.
- §2.B Vehicle to leftmost → Task 4.
- §2.C Transfer-method picker → Task 5.
- §2.D Cycle breakdown popover → calc in Task 2, UI in Task 6.
- §3 Files modified/new → covered across Tasks 2–6.
- §3 Spec/changelog → Task 1.
- §4 Edge cases:
  - Single-method vehicle → handled in `TransferMethodChips` (Task 5).
  - Vehicle change resets `transferMethodIdx` → Task 5 step 2.
  - Liftless transfer + nonzero lift → existing calc behavior (Task 2's first test confirms 0 lift contribution).
  - Cycle popover when no vehicle → button disabled in Task 6.
  - Popover stays open during inline edits → no extra code; React re-render keeps the open panel mounted with fresh `derived.breakdown` values.
  - `transferMethods.length === 0` → Task 5's chip returns `null`; Task 2's `cycleBreakdown` returns `null`; Task 6's button is disabled.
  - Old JSON with `weightLbs` → Task 8 Step 3 covers.
- §5 Unit tests → Task 2 Step 2.
- §5 Manual checks 1–8 → Task 8 Step 2 (extended to 10 checks for thoroughness).
- §7 Acceptance: tsc / vitest / purity grep / build → Task 8 Step 1.

**Placeholder scan:** every step contains exact code or commands; no TBDs.

**Type consistency:**
- `CycleBreakdown` defined in Task 2 Step 1, consumed in Task 2 Step 4 (calc) and Task 6 Step 1 (popover) — same shape.
- `Flow` shape after Task 3 (no `weightLbs`) consistent with `flowSchema`, `emptyFlow()`, the storage fixture, and `FlowRow` cells.
- `VehicleSelect` Props after Task 3 Step 4: no `flowWeightLbs`. Task 4 and Task 5 use the post-Task-3 prop shape.
- `TransferMethod` import in Task 5 references the type already exported from `src/lib/vehicleLibrary.ts` (verified line 6 of that file).
- `triggerRef: React.RefObject<HTMLElement | null>` in `CyclePopover` accepts the `RefObject<HTMLButtonElement>` from `FlowRow` (HTMLButtonElement ⊂ HTMLElement).

**Scope:** single Step 3 module. No changes to Steps 1, 2, 4, 5, 6 or the persistent header.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-23-step3-table-revision.md`.

**Execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Best for this plan since Tasks 2 and 6 each have nontrivial scope.

**2. Inline execution** — execute in this session via `executing-plans`, batch with checkpoints.

**3. Hold for review** — read the plan, push back, then run.

Which?
