# Step 4 investment summary — collapse-by-default + vehicle accessories — design

**Date:** 2026-11-02
**Status:** Design (approved in brainstorming)
**Source:** Apple-lens UI review of the whole app (2026-11-01/02) + owner request to make
Step 4 read as a proposal/quotation investment summary instead of a dense ledger.

## 1. Purpose

Two coupled changes to Step 4 (ROM Configuration), both scoped to
`src/components/rom/RomQuotation.tsx` and its immediate dependencies. No changes to Step 1–3,
the complexity scoring engine, or the gate model.

**Finding that shaped this spec:** the "three buckets, complexity score visible but collapsed,
optional items separate" structure the owner asked for already exists in the code (built
2026-10-09) — four `Category` sections (Hardware, Software, Professional Services, Adders),
each with a one-line header (name · complexity meter · amount · share%) and a nested,
closed-by-default disclosure for the scoring rationale. The one thing not matching the ask:
`Category`'s local `open` state initializes to `true` for every section, so all four render
fully expanded on every page load — every hardware line, every chip, every adder with its
dollar amount, all at once. That default is what reads as "busy."

## 2. Features

### F1 — Collapse-by-default for non-actionable buckets

- `Category` (`RomQuotation.tsx`) changes its local state from `useState(true)` to
  `useState(name === 'Adders')`.
- **Hardware, Software, Professional Services** start collapsed to their existing one-line
  header (number · name · tier meter when applicable · amount · share% · chevron). Nothing
  about the header or the detail panel's contents changes — only whether it renders open on
  mount.
- **Adders** stays open by default, unchanged from today — it is the one section with direct
  engineer action (ticking a box), not just information to review.
- Manual expand/collapse (the existing chevron click) is unaffected; this only changes the
  initial state per section per page load.

### F2 — Vehicle accessories (general concept, launches with ML2's conveyor)

**Problem:** `ml2.json` already lists `"Conveyor"` as a transfer method, but no cost exists
anywhere for the physical conveyor equipment an ML2 deployment needs. This is a real pricing
gap, not a cosmetic one.

- **Data model:** any vehicle JSON (`src/content/vehicles/*.json`) may carry an optional
  `accessories` array:
  ```ts
  accessories?: Array<{
    id: string          // e.g. "ml2-conveyor"
    label: string        // e.g. "Conveyor interface equipment"
    amount: number        // placeholder USD
  }>
  ```
  A vehicle with no `accessories` field behaves exactly as today. Launches with one entry on
  `ml2.json`. The amount is a placeholder, flagged with the same `_placeholderWarning`
  convention `src/content/pricing/adders.json` already uses ("do not quote a customer").
- **Selection state:** new project field `romSellPriceSelectedAccessoryIds: string[]`,
  mirroring the existing `romSellPriceSelectedAdderIds` field exactly — same shape, same
  persistence path through `src/lib/storage.ts`, same partial-project-safe default (`[]`).
  Added to `partialProjectSchema` / `ProjectFormData` in `src/lib/validations/schemas.ts`.
- **Money:** selected accessory amounts sum into the **Hardware subtotal**
  (`fleetTotal.hardwareTotal`), computed in `src/calc/fleetSellPrice.ts` alongside the
  existing per-vehicle hardware sum — not a separate top-level bucket. This is the literal
  reading of "hardware and accessories as one bucket."
- **UI placement:** inside Hardware's existing detail panel (`RomQuotation.tsx`, the
  `Category num="01" name="Hardware"` block), below the per-vehicle line list, a conditional
  "Accessories" sub-list renders only when a vehicle in `lines` (the resolved fleet) defines
  any `accessories`. Rendered with the same checkbox-button pattern (`q-adder` /
  `q-adder-mark` styling family) the Adders list already uses, for one consistent
  optional-item affordance across the page. A fleet with no ML2 (or no vehicle defining
  accessories) shows nothing extra — the Hardware panel looks exactly as it does today.
- **Gating:** accessories are never gated by `PricingGate` — same as Hardware itself, which
  is never withheld. An unselected accessory simply contributes $0.

## 3. Data flow

Step 3 → Step 4 input is unchanged (fleet counts, vehicle types, as today, via
`resolveRomSellPriceLine` / `resolveFleetSellPriceTotal`). The only new input read is each
vehicle's optional `accessories` array, consumed the same way any other vehicle spec
(`priceRange`, `romInputs.*`) already is — no new cross-step coupling.

## 4. Files touched

- `src/components/rom/RomQuotation.tsx` — `Category` default-open change; new Accessories
  sub-list in the Hardware detail block.
- `src/calc/fleetSellPrice.ts` — fold selected accessory amounts into `hardwareTotal`.
- `src/lib/romSellPriceLine.ts` — type additions for accessories on the resolved line/total,
  if needed by the above.
- `src/lib/validations/schemas.ts` — `romSellPriceSelectedAccessoryIds: string[]` field
  (partial-safe, default `[]`).
- `src/content/vehicles/ml2.json` — add `accessories` entry for the conveyor.
- `app/globals.css` — reuse existing `q-adder*` classes for the Accessories sub-list; no new
  visual language.

Not touched: Step 1–3, `src/calc/scoreTier.ts`, `src/calc/complexityInputs.ts`,
`ComplexityAxis.tsx`, `RomPriceDrivers.tsx`, the gate model, PPTX export.

## 5. Testing

- Unit test: `fleetSellPrice.ts` hardware total, with and without selected accessory ids,
  for a fleet containing ML2 and for a fleet without it.
- Unit test: a vehicle with no `accessories` field produces identical output to today
  (regression guard).
- Render/behavior test: `RomQuotation` — Hardware/Software/Professional Services mount
  collapsed, Adders mounts open; Accessories sub-list present only when the fleet includes a
  vehicle defining `accessories`.
- Existing `enumAlignment`-style schema tests extended to cover the new project field
  (partial-safe default).

## 6. Explicitly out of scope

- Real ML2 conveyor pricing (placeholder only, per owner decision).
- Accessories tied to transfer method per-flow (e.g. only when a *specific* flow uses
  Conveyor transfer) — v1 shows the accessory whenever the vehicle itself is anywhere in the
  resolved fleet, regardless of which transfer method each flow uses. Flagged here as a
  judgment call, not a confirmed requirement — revisit if it causes a wrong default in
  practice.
- Step 3 simplification (separate, upcoming spec).
- Step 1 questionnaire-import collapse behavior (separate, parked mid-brainstorm — not part
  of this spec).
