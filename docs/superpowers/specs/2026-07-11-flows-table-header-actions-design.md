# Fleet Engine Flows Table + Header Actions — Design

**Date:** 2026-07-11
**Status:** Approved (owner picked treatment B + custom transfer time + bottom add row + Save Revision / Export to Customer header)
**Problem:** The Step-3 Raw Fleet table reads asymmetric and non-engineering-grade:
every cell is a different control species, the 4-px cycle bar looks like a meter
but is an unreadable composition chart, add-flow exists in three places, and
export/save hide in unlabeled header icons.

## 1. Table — vehicle-first order kept, everything normalized

Bands stay `VEHICLE (2) · ROUTE INPUT (5) · OUTPUT (2)`; column order unchanged
(muscle memory). Changes:

- **One control species per input cell.** `Vehicle` = dot + name select (as today).
  `Transfer` = one-line select reading `Lift · 10s` (method + effective load+unload
  seconds; lift-height input stays inside the cell's existing flyout/inline field).
  `Layout` (rename of "Route Average Speed") = one-line select reading
  `Mixed` — the avg/max ft/s detail moves into the dropdown option rows and the
  column-header tooltip; no second line in the grid.
- `Origin / Destination` plain inputs; `Distance RT / Moves/hr` right-aligned mono.
- **Output cells:** `Cycle` = seconds only (mono). The click-popover gains a
  **full-width labeled composition bar** (travel / transfer / lift, each with
  seconds) — replacing the 4-px in-cell `CycleAnatomyBar`, which is deleted.
  `Demand` (rename of "Vehicle Count") = fractional count, right mono; the
  `≥ 1 vehicle` warn tone stays.
- **Row actions on hover only** (Σ derivation · duplicate · delete) — CSS
  visibility, keyboard/focus still reachable.
- Drag-reorder, groups, group colors/rename/delete, fit-to-width zoom: unchanged.

## 2. Custom transfer time (new capability)

- `Flow` gains optional **`transferSecOverride?: number`** — TOTAL load+unload
  seconds for this flow. Zod: optional nonneg number in the flows array schema
  (no migration; absent = vehicle default).
- `flowMetrics.cycleBreakdown`: when the override is set, replace
  `loadSec + unloadSec` with it (split 50/50 into loadSec/unloadSec for the
  breakdown display) and mark `transferOverridden: true` on the breakdown.
- **UI:** the Transfer dropdown gets a `Transfer time (s)` numeric field
  pre-filled with the vehicle method default; editing stores the override; the
  closed select renders `Lift · 14s*` in accent color; clearing the field
  removes the override.
- Downstream surfaces pick it up through the shared breakdown: cycle popover,
  `cycleDerivation` (note the override in the step row), PPTX cycle-math
  appendix, Fleet Engine sizing.

## 3. One add-flow affordance

Bottom full-width `+ Add flow` ghost row stays (it's where the row appears);
the header `+ Flow` button is removed (header keeps `+ Group`); group headers
keep their add-into-group action.

## 4. Header — Save Revision / Export to Customer

- **`Save Revision ▾`** (ghost button, dropdown): Working PDF (embedded JSON —
  what Step 0 re-imports) · JSON · XLSX. No auto-bump of Rev — the engineer
  edits Rev in the header; the filename already carries it.
- **`Export to Customer`** (red primary): opens the branded-PPTX section picker
  directly. No dropdown — one customer artifact, one click.
- **Autosave chip** next to the buttons: `✓ Saved` / `● Saving…` /
  `⚠ Save failed`, driven by the existing `saveStatus` state.
- The old unlabeled export icon goes; undo / theme / help / delete stay as
  quiet icons.

## Out of scope

Charging/Buffer sub-tab layouts; Step-2 UI; any calc change beyond the
transfer override; mobile layouts.

## Testing

- `flowMetrics` unit tests: override replaces load+unload; absent = default;
  breakdown flag set.
- Schema test: `transferSecOverride` round-trips through partialProjectSchema.
- Existing pptx derivation tests still green (override flows through breakdown).
- Visual acceptance in the running app (no component-test infra in this repo).
