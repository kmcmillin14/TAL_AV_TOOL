# Step 3 — Table Revision: Design Spec

**Date:** 2026-05-23
**Status:** Approved — ready for implementation plan
**Supersedes (partially):** UI portions of `docs/superpowers/plans/2026-05-22-step3-material-flows.md` (Tasks 12–14); calc tasks 1–11 of that plan remain authoritative.

---

## 1. Motivation

The Step 3 Material Flows table just shipped in commit `628f115`. First user feedback:

1. The **Weight (lbs)** column is unnecessary. Per-flow weight isn't used in any calc — it only powered a hard-gate disable in the vehicle dropdown. Step 2 already qualifies vehicles against the project-wide `maxLoadWeightLbs`, so the per-flow gate is redundant.
2. **Vehicle** belongs on the left. Engineers think "what vehicle is doing this flow?" before "how far / how often." Putting Vehicle first matches the mental model and surfaces the dropdown immediately on new rows.
3. The calc engine silently uses `transferMethods[0]`. Vehicles like CB18 (Fork + Lift Platform) can't be modeled correctly without exposing the choice.
4. The Cycle cell shows a single number with no derivation. For audit and debugging, the engineer needs to see what summed to that number without leaving the page.

---

## 2. Scope

Four scoped changes inside the Step 3 module. No changes to Steps 1, 2, or the persistent header. No changes to the underlying math.

### 2.A Remove Weight column
- Drop `weightLbs: number` from `Flow` interface in `src/calc/types.ts`.
- Drop `weightLbs` from `flowSchema` in `src/lib/validations/schemas.ts`.
- Drop `weightLbs` from the fixture in `src/lib/__tests__/storage.flows.test.ts`.
- Drop the overweight cell-tint and `title` attribute from `FlowRow.tsx`.
- **Backward compatibility:** Zod strips unknown keys on parse, so projects exported before this change still load — the `weightLbs` field is silently dropped. No migration needed because `weightLbs` was never read by the calc engine; only the deleted dropdown gate referenced it.

### 2.B Move Vehicle to leftmost editable column
- New column order:
  `# | Vehicle | Origin | Destination | Distance | Thru/hr | Turns | Lift | Cycle | Raw veh | ×`
- Reorder cells in `FlowRow.tsx` and headers in `FlowsTable.tsx`.
- `VehicleSelect.tsx` loses its `flowWeightLbs` prop and the `overweight` disable branch. Every vehicle is selectable in every dropdown.

### 2.C Per-row transfer-method picker
- New component: `src/components/step3/TransferMethodChips.tsx`.
- Renders **inside the Vehicle cell**, stacked under the dropdown.
- For a selected vehicle with `transferMethods.length > 1`: one chip per transfer method, the active one (matching `flow.transferMethodIdx ?? 0`) highlighted.
- For a vehicle with exactly 1 transfer method: static text (`transferMethods[0].method`).
- For no vehicle selected: nothing.
- **Vehicle change behavior:** when the user picks a different vehicle, `transferMethodIdx` resets to `0`. Rationale: indices don't translate across vehicles (CB18's index 1 = Lift Platform; ML2 doesn't have one).
- Clicking a chip writes `flow.transferMethodIdx` via the existing `onChange`. Cycle + Raw veh recompute on the next render — no other plumbing needed because `flowDerived` already reads `transferMethodIdx`.

### 2.D Cycle breakdown popover
- **Calc layer:**
  - Add pure `cycleBreakdown(distanceFt, vehicle, turns, liftHeightFt, transferMethodIdx)` to `src/calc/flowMetrics.ts`.
  - Returns `{ travelLoadedSec, travelEmptySec, loadSec, unloadSec, liftTimeSec, turnPenaltySec, totalSec } | null`.
  - Refactor `cycleSeconds` to delegate: `return cycleBreakdown(...)?.totalSec ?? null`. Behavior is unchanged; all 12 existing `cycleSeconds` tests continue to pass.
  - New test: `cycleBreakdown` returns parts that sum to `totalSec` (with and without lift).
- **UI:**
  - New component: `src/components/step3/CyclePopover.tsx`.
  - The Cycle cell becomes a `<button class="flow-calc-trigger">` showing the existing formatted time (e.g. `2m 18s`). Disabled (and not interactive) when `cycleSeconds === null` — same `—` glyph.
  - On click, an absolute-positioned popover anchors to the cell with the breakdown:
    ```
    Travel loaded   18.0s
    Travel empty    15.4s
    Load             5.0s
    Unload           5.0s
    Lift             8.0s
    Turns            4.0s
    ─────────────────────
    Total           55.4s
    ```
  - Closes on outside click and on `Escape`. No backdrop. Click-only — no hover trigger (mobile-friendlier and avoids accidental opens while editing).
  - Implementation: each `FlowRow` owns its own `useState<boolean>` for popover open state. Multiple popovers across rows can technically be open at once; in practice the outside-click handler closes the previous when the user clicks a new row's Cycle cell.

---

## 3. Files

### Modified
- `src/calc/types.ts` — remove `weightLbs` from `Flow`.
- `src/calc/flowMetrics.ts` — add `cycleBreakdown`; refactor `cycleSeconds`.
- `src/calc/__tests__/flowMetrics.test.ts` — add `cycleBreakdown` test block.
- `src/lib/validations/schemas.ts` — remove `weightLbs` from `flowSchema`.
- `src/lib/__tests__/storage.flows.test.ts` — drop `weightLbs` from the fixture.
- `src/components/step3/FlowRow.tsx` — reorder, drop weight cell, mount `TransferMethodChips` + `CyclePopover`, reset `transferMethodIdx` on vehicle change.
- `src/components/step3/FlowsTable.tsx` — header reorder, drop weight header, drop weight from `emptyFlow()`.
- `src/components/step3/VehicleSelect.tsx` — remove `flowWeightLbs` prop + overweight branch.
- `app/globals.css` — append rules for `.transfer-chips`, `.transfer-chip`, `.flow-calc-trigger`, `.cycle-popover`.

### New
- `src/components/step3/TransferMethodChips.tsx`
- `src/components/step3/CyclePopover.tsx`

### Spec / changelog
- `docs/SPECIFICATION.md` — Step 3 chapter:
  - Remove `weightLbs` line from "Per-flow inputs".
  - Replace the "Hard gates per flow" paragraph with a sentence noting Step 2 already qualifies vehicles against the project-wide `maxLoadWeightLbs`; Step 3 imposes no per-flow weight gate.
- `docs/CHANGELOG.md` — prepend a `2026-05-23` entry describing this revision.

---

## 4. Edge cases

| Scenario | Behavior |
|---|---|
| User selects a vehicle with only 1 transfer method | Chip group is replaced by static method-name text. |
| User changes from CB18 (was on idx 1 = Lift Platform) to ML2 (1 transfer method) | `transferMethodIdx` resets to `0`. UI shows ML2's static method name. |
| Liftless transfer method, nonzero `liftHeightFt` entered | `cycleBreakdown` returns `liftTimeSec: 0`. Cycle is unaffected. Engineer-entered value is preserved (their data isn't lost on switch). |
| Cycle popover when vehicle not selected | Cycle reads `—`. Button is disabled; no popover opens. |
| Cycle popover open, user starts typing in another field in the same row | Popover stays open; numbers update live as the row's derived values change. |
| `transferMethods.length === 0` (shouldn't happen in current library) | Chips don't render. `cycleBreakdown` returns `null`. Cycle shows `—`. |
| Loading an exported project from before this revision | Zod parse drops `weightLbs` silently. Flows load with their other fields intact. |

---

## 5. Testing

### Unit (Vitest)
- New test block in `flowMetrics.test.ts` (~3 new `it` cases):
  - `cycleBreakdown` returns components that sum to `totalSec` when called with the standard CB18 fixture, 100 ft, 2 turns, transfer index 0, 0 lift.
  - Same fixture with lift platform (index 1) and `liftHeightFt = 10` against `liftSpeedFps = 0.5` adds exactly `20s` to `liftTimeSec` and `totalSec`.
  - Edge guards (negative distance, broken vehicle) return `null` — same parity with `cycleSeconds`.
- All 12 existing `cycleSeconds` tests must still pass after the refactor. No code changes to other test files.

### Manual verification (browser)
1. Open Step 3 on a fresh project.
2. Add a flow → Vehicle dropdown is leftmost editable column; no Weight column anywhere.
3. Pick CB18 → chips appear ("Fork", "Lift Platform"); "Fork" is highlighted by default.
4. Click "Lift Platform" → Cycle increases by exactly the load-time delta (8s vs 5s × 2) and any nonzero `liftHeightFt` now contributes.
5. Click Cycle cell → popover shows breakdown; sum matches the cell.
6. Click outside / press Escape → popover closes.
7. Switch vehicle to ML2 → chips disappear; static "Fork" text shows; `transferMethodIdx` resets (no leftover index-1 selection).
8. Reload the page → all selections (including `transferMethodIdx`) persist.

---

## 6. Out of scope (declined or deferred)

- "+ Add another `<vehicle>` flow" buttons on each `GroupSummaryCard` (declined in brainstorm).
- Hide Lift column conditionally when no selected vehicle lifts (declined).
- CSV import, drag-to-reorder rows, Step 1 prefill (deferred per parent plan).

---

## 7. Acceptance

1. `npm run build` passes; `tsc --noEmit` clean; vitest green (target: at least 87 tests after `cycleBreakdown` adds ~3).
2. Browser-driven manual checks 1–8 above pass.
3. `grep -r "from 'react'\|localStorage\|fetch\\(" src/calc/` returns nothing (calc-layer purity preserved).
4. `docs/SPECIFICATION.md` and `docs/CHANGELOG.md` updated before the implementation commits.
