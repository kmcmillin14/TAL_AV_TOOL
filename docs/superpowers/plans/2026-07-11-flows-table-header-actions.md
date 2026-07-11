# Flows Table + Header Actions Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-11-flows-table-header-actions-design.md` (approved)
**Mode:** inline execution, owner said "go and execute". Docs first → code → gates → push.

## Tasks

1. **Docs first** — SPEC Step-3 flows-table subsection + header/export subsection; CHANGELOG entry.
2. **Calc + schema: `transferSecOverride`**
   - `src/calc/types.ts`: `Flow.transferSecOverride?: number`; `CycleBreakdown.transferOverridden?: boolean`.
   - Flow Zod schema (`src/lib/validations.ts` flows array): optional nonneg number.
   - `src/calc/flowMetrics.ts` `cycleBreakdown`: when set, total transfer = override
     (split 50/50 into loadSec/unloadSec for display), `transferOverridden: true`.
   - Tests: flowMetrics override/default/flag; schema round-trip.
3. **MethodSelect** — closed trigger reads `Lift · 10s` (accent + `*` when overridden);
   dropdown gains `Transfer time (s)` numeric field (prefill = method default; edit →
   `onOverrideChange`; clear → remove). Lift-height field stays.
4. **SpeedsUsedSelect** — one-line closed trigger (layout name only); avg/max ft/s move
   into the dropdown options; grid column header renames to `Layout`.
5. **FlowRow / CyclePopover** — cycle cell = seconds only; delete `CycleAnatomyBar`
   (in-cell); CyclePopover gains a full-width labeled composition bar (travel /
   transfer / lift, seconds per segment, override marked). Demand column header
   renames from `Vehicle Count`; row actions hover-only (CSS).
6. **FlowsTable** — remove header `+ Flow` (keep `+ Group`); bottom `+ Add flow` stays;
   header labels `Transfer` / `Layout` / `Cycle` / `Demand`.
7. **PersistentHeader** — `Save Revision ▾` (Working PDF · JSON · XLSX — reuse existing
   export actions), red `Export to Customer` (opens PPTX section picker), autosave chip
   (`✓ Saved / ● Saving… / ⚠ Save failed` from existing saveStatus); old export icon goes.
8. **globals.css** — one-line select rhythm, hover actions, popover bar, header buttons/chip.
9. **Gates + ship** — tsc · vitest · check:arch · commit · push (full hook) ·
   `rm -rf .next` + dev restart (CSS changed) · visual check note to owner.
