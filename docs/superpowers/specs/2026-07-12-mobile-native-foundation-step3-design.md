# Mobile-Native Foundation + Step 3 Pilot — Design

**Date:** 2026-07-12
**Status:** Approved (owner: build shared mobile primitives + apply to Fleet Engine flows first, then roll the same primitives across every other step)

**Problem:** The current mobile treatment is a desktop table shrunk into stacked
cards — it "feels like a desktop converted to mobile." Field engineers need the
*whole app* to feel phone-native and consistent across all five steps so they can
work flows/vehicles/economics quickly on a phone. This is the first sub-project:
the shared mobile design language + its first application (Step 3 flows).

## Decomposition (context)

This spec covers **Sub-project 1 only**. Later sub-projects (Step 1 form, Step 2
vehicles, Step 4 dashboard, Step 0 polish) each get their own spec → plan → build
and **reuse the primitives defined here** — that shared reuse is what keeps every
step consistent by construction.

## The shared mobile language (six primitives)

Defined once, reused by every step:

1. **Compact mobile page header** — title + one primary action.
2. **List → sheet** — any collection is a scannable list you tap into a focused
   full-screen editor; never a wall of fields.
3. **Bottom-sheet pickers** — every select opens a thumb-reachable slide-up list.
4. **Big touch inputs** — full-width, ≥ 16px font, ≥ 44px targets.
5. **Sticky live-result bar** — a computed number (flow demand, fleet total,
   KPIs) is pinned and recomputes as you edit.
6. **One `BottomSheet` primitive + one slide-up motion** — every sheet feels
   identical.

Applies only ≤ 700px (the existing breakpoint). Desktop (> 700px) is unchanged.

## Architecture

**Shared component location (new): `src/components/mobile/`.** A shared UI
location analogous to `src/components/PersistentHeader.tsx` — any step's page may
import it (module-boundary rule permits shared modules). ARCHITECTURE.md §4/§5 is
updated to record this location; the CHANGELOG gets the required entry.

**Shared primitives — `src/components/mobile/`:**
- `BottomSheet.tsx` — slide-up overlay: scrim, rounded top, close on scrim-tap /
  Escape / drag-down; rendered through a portal; focus trapped while open;
  `prefers-reduced-motion` disables the slide. Props: `open`, `onClose`,
  `title?`, `children`.
- `SheetSelect.tsx` — a labeled field that opens a `BottomSheet` list of options
  (the vehicle / avg-speed picker). Generic:
  `{ label, value, options: {id,label,dot?}[], onChange(id) }`.
- `MobileHeader.tsx` — compact page header (title + optional primary action),
  used by every step's mobile view.
- CSS: shared tokens/classes for big inputs (`.m-input`), sheet chrome
  (`.m-sheet*`), live-result bars (`.m-outbar`), list rows (`.m-row`).

**Step 3 pilot — `src/components/step3/`:**
- `FlowListMobile.tsx` — summary list:
  - Group section header (read-only): name · count · Σ demand · "+ Flow" (adds
    into that group).
  - Flow row: index · route (origin → destination) · vehicle chip (dot + name) ·
    moves/hr · live demand · chevron. Tap opens `FlowSheet`.
  - Sticky footer: "Raw demand — N vehicles" (Σ rawVehicles, ⌈⌉ per the summary).
  - "+ Flow" (ungrouped) at the bottom.
- `FlowSheet.tsx` — full-screen editor for one flow (existing or new):
  - Header: ✕ (close) · "Flow N" · Delete.
  - **Live output bar pinned at top:** Cycle (s) · Demand (veh, accent) —
    recompute live from `derivedByFlowId`. Tapping the Demand cell opens the
    fleet-math (`DerivTrigger`, reused).
  - Fields grouped: **Route** (origin, destination, distance RT, moves/hr) then
    **Vehicle & transfer** (vehicle `SheetSelect`, transfer picker, avg-speed
    `SheetSelect`).
  - Transfer picker = a `BottomSheet` with the method list + transfer-time
    override input + lift-height input (when the method lifts) — reuses
    `transferMethodIdx` / `transferSecOverride` / `liftHeightFt`. The 'Custom'
    method starts at 0s and demands input, exactly as on desktop.
  - Done (closes; autosave is already live).
- **`FlowCard.tsx` is deleted** — the list + sheet supersede it.

**`FlowsTable.tsx`** keeps its `useIsNarrow(700)` gate; the narrow branch now
renders `<FlowListMobile>` instead of the card list. Desktop `FlowRow`,
`MethodSelect`, `SpeedsUsedSelect`, `VehicleSelect` are untouched (still power the
table).

## Data flow

The sheet reads and writes the same `Flow` fields through the existing `onPatch`;
`derivedByFlowId` drives the live outputs. **No calc, schema, or storage change** —
`src/calc/*` untouched, imperial-first preserved, price-range rules irrelevant
here. Desktop path byte-for-byte unchanged. Toyota Type only (existing
`--tal-font-*` variables); no new font families.

## Deliberate field-use scope cuts (mobile)

- **Reorder** and **duplicate** are desktop-only for now (flow order does not
  affect the calc — sums are order-independent — and both are low-value in the
  field).
- **Group rename / color / delete** stay desktop-only; the mobile list shows
  read-only group headers plus add-into-group.
- **Delete** lives in the sheet header; there is no swipe-to-delete in v1.

## Testing

- No calc touched → the existing vitest suite must stay green unchanged.
- `BottomSheet` / `SheetSelect` / `MobileHeader` are UI primitives; this repo has
  no component-test harness, so they are verified in the running app via DevTools
  device emulation (iPhone SE 375 / iPhone 14 390 / iPad 768) across the Step 3
  flows: list scans, tap → sheet, edit recomputes live, pickers open as bottom
  sheets, add/delete work, no horizontal page scroll.
- A physical-device pass is owed (documented, same as the prior mobile work).
- Pre-push checklist in full (tsc · vitest · check:arch · /simplify · /review ·
  docs-first · clean dev restart + served-chunk verification for CSS).

## Out of scope (this sub-project)

Steps 0/1/2/4 mobile work (separate sub-projects reusing these primitives);
Charging/Buffer sub-tabs (read-mostly, already responsive — QA only); any calc,
schema, or desktop change.
