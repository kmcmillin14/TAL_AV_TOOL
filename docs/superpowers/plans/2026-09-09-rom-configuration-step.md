# ROM Configuration Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the internal ROM sell-price engine (Hardware + Integration + Software + Adders) out of the Step 4 "ROM Dashboard" bento grid into its own dedicated wizard step — a new **Step 4 — ROM Configuration** — pushing the customer-facing Dashboard to **Step 5**, and redesign the sell-price UI to show every engineer-assigned vehicle type at once with a fleet-wide TOTAL, instead of one vehicle picked from a dropdown.

**Architecture:** The wizard becomes 6 steps: `0 Start · 1 Intake Form · 2 Hardware Compatibility · 3 Fleet Sizing · 4 ROM Configuration · 5 Dashboard`. Routes `step0`–`step3` are unchanged (only their nav *labels* change); the existing `app/projects/[id]/step4/page.tsx` (Dashboard) moves to `app/projects/[id]/step5/page.tsx`; a new `app/projects/[id]/step4/page.tsx` (ROM Configuration) is created. Along the way, a real bug surfaces and gets fixed: the current per-vehicle `computeSellPriceRom` adds the *full* selected-adders total to *every* vehicle line independently, so a 3-chassis fleet would triple-count a single "Extended Warranty" adder. Adders become fleet-wide-only, computed exactly once by a new pure aggregator (`src/calc/fleetSellPrice.ts`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, Vitest — same stack as the rest of the app, no new dependencies.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/calc/sellPriceRom.ts` (modify) | Per-vehicle Hardware/Integration/Software calc. Adders removed — fleet-wide only now. |
| `src/calc/fleetSellPrice.ts` (new) | Pure aggregator: sums every vehicle line's totals, adds adders ONCE, applies the ROM band ONCE on the fleet aggregate (not summed from per-line bands — avoids compounding rounding). |
| `src/lib/romSellPriceLine.ts` (modify) | Adds `vehicle` to `RomSellPriceLine`, drops the `selectedAdderIds` param from `resolveRomSellPriceLine` (adders aren't per-line anymore), adds `resolveFleetSellPriceTotal` — the single resolver both the new UI and the PPTX appendix call. |
| `src/lib/pptx/romSellPrice.ts` (modify) | PPTX appendix table: drops the per-vehicle Adders column, adds one fleet-wide Adders row + TOTAL row. |
| `src/lib/pptxTemplateExport.ts` (modify) | Computes the fleet total once and passes it to the appendix filler. |
| `src/components/rom/RomSellPriceParts.tsx` (new) | Shared building blocks extracted from the old single-vehicle cell: `fullUsd`, `ReceiptRow`, `TierBreakdown`. |
| `src/components/rom/VehicleSellPriceBlock.tsx` (new) | One vehicle's complexity breakdowns + Hardware/Integration/Software receipt, ending in a Subtotal (no adders — those are fleet-wide). |
| `src/components/rom/RomFleetSellPrice.tsx` (new) | Page-level orchestrator: renders one `VehicleSellPriceBlock` per assigned+priced vehicle, then a fleet-wide TOTAL section + the shared adders checklist. Replaces `RomSellPriceCell.tsx`, which is deleted. |
| `src/components/rom/RomSellPriceCell.tsx` (delete) | Superseded by the three files above. |
| `src/components/rom/RomBento.tsx` (modify) | Drops the "Internal ROM — sell price" cell (moved to its own step). |
| `app/projects/[id]/step4/page.tsx` (moved to step5, then recreated) | New content: ROM Configuration page hosting `RomFleetSellPrice`. |
| `app/projects/[id]/step5/page.tsx` (new, moved from step4) | The existing Dashboard content, `currentStep` 4→5. |
| `src/components/PersistentHeader.tsx` (modify) | `STEPS` array gains a step-4 entry; old step-4 entry becomes step-5; `StepId` type gains `5`. |
| `src/components/GuidedTour.tsx` (modify) | `INTRO_GUIDE` gets a 6th highlighted step-dot + updated copy; `SAMPLE_RFQ_GUIDE`'s Dashboard-targeting steps move from `/step4` to `/step5`. |
| `src/content/help.ts` (modify) | New `step4` help section (ROM Configuration); old `step4` section becomes `step5`; `HelpSection.id` union gains `'step5'`. |
| `ARCHITECTURE.md` (modify) | Nav-steps line + folder-map comment. |
| `docs/SPECIFICATION.md` (modify) | New `## Step 4 — ROM Configuration` section; old `## Step 4 — ROM Dashboard` becomes `## Step 5 — Dashboard`; scattered `Step 4` prose references to the Dashboard become `Step 5`. |
| `docs/WORKFLOW-GUIDE.md` (modify) | Same renumbering for its walkthrough section. |
| `docs/PPTX-TOKEN-CONTRACT.md` (modify) | Documents the new appendix table shape (fleet-wide Adders row, no per-vehicle Adders column). |
| `docs/CHANGELOG.md` (modify) | New entry for the step split + the adders double-counting fix. |

---

## Task 1: Remove adders from the per-vehicle sell-price calc (fixes a real double-counting bug)

**Files:**
- Modify: `src/calc/sellPriceRom.ts`
- Test: `src/calc/__tests__/sellPriceRom.test.ts`

Today, `computeSellPriceRom` adds the *entire* selected-adders total onto *every* vehicle's line independently — a fleet of 3 vehicle types with "Extended Warranty ($18,000)" checked ends up charging $18,000 three times (once per vehicle line) instead of once for the program. Adders are described everywhere else in this codebase as "a flat, **project-level** checklist... shared across the project's vehicles, not per-vehicle" — so they must be summed exactly once, at the fleet level, not per line. This task strips adders out of the per-vehicle function entirely; Task 2 adds them back correctly, once, in a new fleet aggregator.

- [ ] **Step 1: Update the failing test first**

Replace the full contents of `src/calc/__tests__/sellPriceRom.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { computeSellPriceRom, vehiclePricingMidpoint } from '../sellPriceRom'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { PricingAssumptions, RomInputs } from '@/src/lib/validations/pricingSchemas'
import type { TierResult } from '../scoreTier'

// Mirrors src/content/pricing/global-assumptions.json's numeric shape (a
// self-contained fixture so this test doesn't silently drift if the content
// file's placeholders change).
const assumptions: PricingAssumptions = {
  schemaVersion: 1,
  currency: 'USD',
  integrationMultipliers: { '1': 1.0, '2': 1.8, '3': 3.0 },
  softwareMultipliers: { '1': 1.0, '2': 1.6, '3': 2.5 },
  integrationScoring: { points: {}, thresholds: { tier2: 5, tier3: 11 } },
  softwareScoring: { points: {}, thresholds: { tier2: 4, tier3: 9 } },
  romBand: { low: -0.10, high: 0.25 },
  rounding: 5000,
  cutsheetRepresentativeQty: [2, 6, 15],
}

function tierResult(tier: 1 | 2 | 3): TierResult {
  return { score: 0, tier, reasons: [], notTriggered: [], flooredBy: null }
}

// Mirrors src/content/vehicles/cb18.json (priceRange 165000-210000, mid 187500).
// baseIntegrationSellPrice includes commissioning — there is no separate
// baseCommissioningPerUnit field (owner: commissioning and integration are
// the same cost bucket, 2026-09-09).
function cb18(): Vehicle {
  return {
    id: 'cb18',
    calc: { priceRange: { minUsd: 165_000, maxUsd: 210_000 } },
    romInputs: {
      integrationFloor: 1,
      softwareFloor: 1,
      baseIntegrationSellPrice: 50_000,
      baseSoftwareSellPrice: 15_000,
    } satisfies RomInputs,
  } as unknown as Vehicle
}

describe('vehiclePricingMidpoint', () => {
  it('averages min/max', () => {
    expect(vehiclePricingMidpoint(cb18())).toBe(187_500)
  })
})

describe('computeSellPriceRom — hand-checked qty 6, Integration T2, Software T2', () => {
  const result = computeSellPriceRom({
    vehicle: cb18(),
    romInputs: cb18().romInputs as RomInputs,
    qty: 6,
    integrationResult: tierResult(2),
    softwareResult: tierResult(2),
    assumptions,
  })

  it('hardware = midpoint × qty (no commissioning line — folded into Integration) = 187500×6', () => {
    expect(result.hardwareSellTotal).toBe(1_125_000)
  })
  it('integration = base (incl. commissioning) × multiplier[2] = 50000×1.8', () => {
    expect(result.integrationSellTotal).toBe(90_000)
  })
  it('software = base × multiplier[2] = 15000×1.6', () => {
    expect(result.softwareSellTotal).toBe(24_000)
  })
  it('has no adders field — adders are fleet-wide only (src/calc/fleetSellPrice.ts)', () => {
    expect(result).not.toHaveProperty('addersTotal')
  })
  it('lineSubtotal sums hardware + integration + software only', () => {
    expect(result.lineSubtotal).toBe(1_239_000)
  })
  it('sellPerUnit = lineSubtotal / qty', () => {
    expect(result.sellPerUnit).toBe(206_500)
  })
  it('band rounds to the nearest $5,000 (low -10% / high +25%), computed off lineSubtotal', () => {
    // 1,239,000 × 0.90 = 1,115,100 → nearest 5000 = 1,115,000
    expect(result.band.lowTotal).toBe(1_115_000)
    // 1,239,000 × 1.25 = 1,548,750 → nearest 5000 = 1,550,000
    expect(result.band.highTotal).toBe(1_550_000)
    // per-unit computed AFTER rounding the totals, then rounded again
    expect(result.band.lowPerUnit).toBe(185_000)
    expect(result.band.highPerUnit).toBe(260_000)
  })
})

describe('computeSellPriceRom — guards', () => {
  it('throws on qty <= 0', () => {
    expect(() =>
      computeSellPriceRom({
        vehicle: cb18(),
        romInputs: cb18().romInputs as RomInputs,
        qty: 0,
        integrationResult: tierResult(1),
        softwareResult: tierResult(1),
        assumptions,
      })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/calc/__tests__/sellPriceRom.test.ts`
Expected: FAIL — `computeSellPriceRom` still requires `selectedAdderIds`/`adders` in its input type (TypeScript compile error surfaced by vitest/esbuild) and still returns `addersTotal`/`sellTotal` instead of `lineSubtotal`.

- [ ] **Step 3: Update `src/calc/sellPriceRom.ts`**

Replace the full file contents with:

```ts
// src/calc/sellPriceRom.ts — internal ROM SELL-PRICE engine: per-vehicle
// Hardware + Integration + Software → a line subtotal + ROM band. Adders are
// NOT computed here — they're a flat, project-wide, once-only cost, summed
// by src/calc/fleetSellPrice.ts across the whole fleet (2026-09-09: adders
// used to be added per vehicle line, so a 3-chassis fleet would triple-count
// a single selected adder — fixed by moving them to the fleet aggregator).
//
// Deliberately a SEPARATE module from `src/calc/rom.ts` (the existing CAPEX/OPEX/
// payback customer-ROI engine, already wired into the Dashboard step and PPTX
// S25/S27/S28) — same "ROM" word, two different questions. `rom.ts` answers "what
// does the customer pay back and when"; this module answers "what do we sell it
// for, broken into Hardware/Integration/Software so an estimator can defend
// each line." See docs/CHANGELOG.md (2026-09-09 compatibility review) for why the
// names were kept apart.
//
// PURE. No React, no fetch, no localStorage, no fs. Zod validation of
// `vehicle.romInputs` lives in `src/lib/romPricingValidation.ts` (src/lib/* is
// allowed to import Zod schemas; src/calc/* is not per ARCHITECTURE.md §4) —
// callers validate there and pass the already-validated `RomInputs` in.
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { PricingAssumptions, RomInputs } from '@/src/lib/validations/pricingSchemas'
import type { TierResult } from './scoreTier'

/** Midpoint of the vehicle's price range — the Hardware line's per-unit vehicle cost. */
export function vehiclePricingMidpoint(vehicle: Vehicle): number {
  const range = vehicle.calc.priceRange
  if (!range) return 0
  return (range.minUsd + range.maxUsd) / 2
}

/** Rounds `value` to the nearest multiple of `increment`. Exported for reuse by
 *  src/calc/fleetSellPrice.ts, which applies the same ROM-band rounding once
 *  at the fleet level rather than summing per-line rounded bands. */
export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

export interface RomPricingInput {
  vehicle: Vehicle
  /** Validate via `getValidRomInputs` (src/lib/romPricingValidation.ts) before
   *  calling computeSellPriceRom — this module does not re-validate. */
  romInputs: RomInputs
  qty: number
  integrationResult: TierResult
  softwareResult: TierResult
  assumptions: PricingAssumptions
}

export interface RomPricingBand {
  lowTotal: number
  highTotal: number
  lowPerUnit: number
  highPerUnit: number
}

export interface RomPricingResult {
  hardwareSellTotal: number
  integrationSellTotal: number
  softwareSellTotal: number
  /** Hardware + Integration + Software for THIS vehicle line only — no adders
   *  (adders are fleet-wide, added once by src/calc/fleetSellPrice.ts). */
  lineSubtotal: number
  sellPerUnit: number
  /** ROM band on `lineSubtotal` (excludes adders) — informational per-vehicle
   *  range; the customer-facing fleet range comes from the fleet aggregator. */
  band: RomPricingBand
}

/** Hardware + Integration + Software → a line subtotal → ROM band. Assumes
 *  `input.romInputs` was already validated by the caller (see the module note
 *  above) — this function does not re-validate, only computes. */
export function computeSellPriceRom(input: RomPricingInput): RomPricingResult {
  if (input.qty <= 0) {
    throw new Error(`computeSellPriceRom: qty must be > 0 (got ${input.qty}) for vehicle "${input.vehicle.id}"`)
  }

  // Commissioning and Integration are the same cost bucket (owner, 2026-09-09) —
  // bring-up/install cost lives entirely in baseIntegrationSellPrice below, not
  // here. Hardware is vehicle price only.
  const hardwareSellTotal = vehiclePricingMidpoint(input.vehicle) * input.qty

  const integrationSellTotal =
    input.romInputs.baseIntegrationSellPrice *
    input.assumptions.integrationMultipliers[String(input.integrationResult.tier) as '1' | '2' | '3']

  const softwareSellTotal =
    input.romInputs.baseSoftwareSellPrice *
    input.assumptions.softwareMultipliers[String(input.softwareResult.tier) as '1' | '2' | '3']

  const lineSubtotal = hardwareSellTotal + integrationSellTotal + softwareSellTotal
  const sellPerUnit = lineSubtotal / input.qty

  const { low, high } = input.assumptions.romBand
  const rounding = input.assumptions.rounding
  const lowTotal = roundTo(lineSubtotal * (1 + low), rounding)
  const highTotal = roundTo(lineSubtotal * (1 + high), rounding)
  const lowPerUnit = roundTo(lowTotal / input.qty, rounding)
  const highPerUnit = roundTo(highTotal / input.qty, rounding)

  return {
    hardwareSellTotal,
    integrationSellTotal,
    softwareSellTotal,
    lineSubtotal,
    sellPerUnit,
    band: { lowTotal, highTotal, lowPerUnit, highPerUnit },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/calc/__tests__/sellPriceRom.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `src/lib/romSellPriceLine.ts` (still passes `selectedAdderIds`/`adders` to `computeSellPriceRom`, still reads `.pricing.addersTotal`/`.pricing.sellTotal`) — this is expected; Task 3 fixes it. Do not fix it here.

- [ ] **Step 6: Commit**

```bash
git add src/calc/sellPriceRom.ts src/calc/__tests__/sellPriceRom.test.ts
git commit -m "fix: remove per-vehicle adders from computeSellPriceRom (fleet-wide only)"
```

---

## Task 2: Add the fleet-wide sell-price aggregator

**Files:**
- Create: `src/calc/fleetSellPrice.ts`
- Test: `src/calc/__tests__/fleetSellPrice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/fleetSellPrice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { aggregateFleetSellPrice } from '../fleetSellPrice'
import type { RomPricingResult } from '../sellPriceRom'
import type { AddersConfig, PricingAssumptions } from '@/src/lib/validations/pricingSchemas'

const assumptions: PricingAssumptions = {
  schemaVersion: 1,
  currency: 'USD',
  integrationMultipliers: { '1': 1.0, '2': 1.8, '3': 3.0 },
  softwareMultipliers: { '1': 1.0, '2': 1.6, '3': 2.5 },
  integrationScoring: { points: {}, thresholds: { tier2: 5, tier3: 11 } },
  softwareScoring: { points: {}, thresholds: { tier2: 4, tier3: 9 } },
  romBand: { low: -0.10, high: 0.25 },
  rounding: 5000,
  cutsheetRepresentativeQty: [2, 6, 15],
}

const adders: AddersConfig = {
  schemaVersion: 1,
  adders: [
    { id: 'warranty', label: 'Extended Warranty', amount: 1_000 },
    { id: 'training', label: 'Extended Training', amount: 4_000 },
    { id: 'unused', label: 'Unused adder', amount: 999 },
  ],
}

/** Builds a minimal per-line pricing result (bypasses computeSellPriceRom —
 *  this test isolates the aggregator, not the per-line calc). */
function line(hardware: number, integration: number, software: number, qty: number): { pricing: RomPricingResult; qty: number } {
  const lineSubtotal = hardware + integration + software
  return {
    qty,
    pricing: {
      hardwareSellTotal: hardware,
      integrationSellTotal: integration,
      softwareSellTotal: software,
      lineSubtotal,
      sellPerUnit: lineSubtotal / qty,
      band: { lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 }, // unused by the aggregator
    },
  }
}

describe('aggregateFleetSellPrice', () => {
  // Vehicle A mirrors cb18's qty-6 hand-check; Vehicle B is a second chassis.
  const lines = [
    line(1_125_000, 90_000, 24_000, 6),
    line(500_000, 39_000, 19_200, 3),
  ]

  it('sums each component across every line', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.hardwareTotal).toBe(1_625_000)
    expect(t.integrationTotal).toBe(129_000)
    expect(t.softwareTotal).toBe(43_200)
  })

  it('adds a selected adder EXACTLY ONCE regardless of fleet size (the bug this replaces)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    // Previously each of the 2 vehicle lines would have added 1000+4000=5000
    // independently, totaling 10,000. Correct behavior: 5,000, once.
    expect(t.addersTotal).toBe(5_000)
  })

  it('ignores an adder id not in the selected list', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty'], adders, assumptions)
    expect(t.addersTotal).toBe(1_000)
  })

  it('totalQty sums every line\'s qty', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.totalQty).toBe(9)
  })

  it('sellTotal = hardware + integration + software + adders (once)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    // 1,625,000 + 129,000 + 43,200 + 5,000 = 1,802,200
    expect(t.sellTotal).toBe(1_802_200)
  })

  it('sellPerUnit = sellTotal / totalQty (fleet-wide, not per-line)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    expect(t.sellPerUnit).toBeCloseTo(1_802_200 / 9, 6)
  })

  it('band is computed ONCE on the fleet aggregate, not summed from per-line bands', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    // sellTotal (no adders) = 1,797,200 × 0.90 = 1,617,480 → nearest 5000 = 1,615,000
    expect(t.band.lowTotal).toBe(1_615_000)
    // 1,797,200 × 1.25 = 2,246,500 → nearest 5000 = 2,245,000
    expect(t.band.highTotal).toBe(2_245_000)
  })

  it('handles a single-line fleet, matching that line\'s own subtotal plus adders', () => {
    const t = aggregateFleetSellPrice([line(1_125_000, 90_000, 24_000, 6)], [], adders, assumptions)
    expect(t.sellTotal).toBe(1_239_000)
    expect(t.totalQty).toBe(6)
  })

  it('returns zeros for an empty fleet without throwing', () => {
    const t = aggregateFleetSellPrice([], [], adders, assumptions)
    expect(t.sellTotal).toBe(0)
    expect(t.totalQty).toBe(0)
    expect(t.sellPerUnit).toBe(0)
    expect(t.band).toEqual({ lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/calc/__tests__/fleetSellPrice.test.ts`
Expected: FAIL with "Cannot find module '../fleetSellPrice'" (or equivalent — the file doesn't exist yet).

- [ ] **Step 3: Create `src/calc/fleetSellPrice.ts`**

```ts
// src/calc/fleetSellPrice.ts — aggregates per-vehicle sell-price lines
// (src/calc/sellPriceRom.ts) into ONE fleet-wide total. Adders are added here,
// exactly once, regardless of fleet size — see the module note in
// sellPriceRom.ts for why they were removed from the per-line calc. The ROM
// band is applied ONCE on the fleet aggregate rather than summed from each
// line's own rounded band, to avoid compounding rounding error across a
// multi-chassis fleet.
//
// PURE. No React, no fetch, no localStorage, no fs.
import type { AddersConfig, PricingAssumptions } from '@/src/lib/validations/pricingSchemas'
import { roundTo, type RomPricingBand, type RomPricingResult } from './sellPriceRom'

export interface FleetSellPriceTotal {
  hardwareTotal: number
  integrationTotal: number
  softwareTotal: number
  addersTotal: number
  /** hardwareTotal + integrationTotal + softwareTotal + addersTotal. */
  sellTotal: number
  totalQty: number
  /** sellTotal ÷ totalQty (blended across chassis types); 0 for an empty fleet. */
  sellPerUnit: number
  band: RomPricingBand
}

/** Sums Hardware/Integration/Software across every line's own `lineSubtotal`
 *  components, adds the project's selected adders ONCE, then applies the ROM
 *  band on that fleet-wide total. */
export function aggregateFleetSellPrice(
  lines: Array<{ pricing: RomPricingResult; qty: number }>,
  selectedAdderIds: string[],
  adders: AddersConfig,
  assumptions: PricingAssumptions
): FleetSellPriceTotal {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const hardwareTotal = lines.reduce((s, l) => s + l.pricing.hardwareSellTotal, 0)
  const integrationTotal = lines.reduce((s, l) => s + l.pricing.integrationSellTotal, 0)
  const softwareTotal = lines.reduce((s, l) => s + l.pricing.softwareSellTotal, 0)

  const selected = new Set(selectedAdderIds)
  const addersTotal = adders.adders
    .filter(a => selected.has(a.id))
    .reduce((sum, a) => sum + a.amount, 0)

  const sellTotal = hardwareTotal + integrationTotal + softwareTotal + addersTotal
  const sellPerUnit = totalQty > 0 ? sellTotal / totalQty : 0

  const { low, high } = assumptions.romBand
  const rounding = assumptions.rounding
  const lowTotal = totalQty > 0 ? roundTo(sellTotal * (1 + low), rounding) : 0
  const highTotal = totalQty > 0 ? roundTo(sellTotal * (1 + high), rounding) : 0
  const lowPerUnit = totalQty > 0 ? roundTo(lowTotal / totalQty, rounding) : 0
  const highPerUnit = totalQty > 0 ? roundTo(highTotal / totalQty, rounding) : 0

  return {
    hardwareTotal,
    integrationTotal,
    softwareTotal,
    addersTotal,
    sellTotal,
    totalQty,
    sellPerUnit,
    band: { lowTotal, highTotal, lowPerUnit, highPerUnit },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/calc/__tests__/fleetSellPrice.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/fleetSellPrice.ts src/calc/__tests__/fleetSellPrice.test.ts
git commit -m "feat: add fleet-wide sell-price aggregator (adders computed once)"
```

---

## Task 3: Update `romSellPriceLine.ts` for the new calc API + full-fleet needs

**Files:**
- Modify: `src/lib/romSellPriceLine.ts`

`resolveRomSellPriceLine` currently takes a `selectedAdderIds` param it passes into `computeSellPriceRom` — that call no longer accepts it (Task 1), so it must be dropped here. `RomSellPriceLine` also needs to carry the full `vehicle` object (not just its id/name) so the new `VehicleSellPriceBlock` component (Task 8) can call `vehiclePricingMidpoint`/`getValidRomInputs` without a second vehicle lookup. Finally, add `resolveFleetSellPriceTotal` — the one place that wires a project's adders selection into `aggregateFleetSellPrice`, so both the new UI (Task 9) and the PPTX appendix (Task 5) call the same function and can't drift.

- [ ] **Step 1: Replace the full contents of `src/lib/romSellPriceLine.ts`**

```ts
// src/lib/romSellPriceLine.ts — resolves ONE engineer-assigned chassis into a
// priced ROM sell-price line (scoring + overrides + computeSellPriceRom), the
// project-wide list of them, and the fleet-wide total (adders + ROM band,
// computed once — see src/calc/fleetSellPrice.ts). Single source of truth for
// this pipeline — both the ROM Configuration step UI
// (RomFleetSellPrice.tsx) and the PPTX appendix (src/lib/pptx/romSellPrice.ts)
// call this instead of each re-deriving it, so a missing-romInputs vehicle
// behaves identically in both places (dropped, not scored with a floor
// fallback — "pricing not configured" is a per-line exclusion, not a partial
// result).
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetGroup, FleetSummary } from '@/src/calc/types'
import { getValidRomInputs } from './romPricingValidation'
import { complexityAnswersFromProject } from './romComplexityFromProject'
import { buildIntegrationTriggers, buildSoftwareTriggers, type ComplexityAnswers } from '@/src/calc/complexityInputs'
import { scoreTier, clampToFloor, type TierResult } from '@/src/calc/scoreTier'
import { computeSellPriceRom, type RomPricingResult } from '@/src/calc/sellPriceRom'
import { aggregateFleetSellPrice, type FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import { PRICING_ASSUMPTIONS, ADDERS_CONFIG } from './pricingContent'

export type RomSellPriceOverride = NonNullable<StoredProject['romSellPriceOverrides']>[string]

export interface RomSellPriceLine {
  vehicle: Vehicle
  vehicleId: string
  vehicleName: string
  qty: number
  integrationResult: TierResult
  softwareResult: TierResult
  pricing: RomPricingResult
}

/** Applies an engineer's tier override on top of the scored result, still
 *  clamped to the vehicle's floor — a floor is a minimum the engineer's
 *  judgment can raise above but never override below. */
function withOverride(scored: TierResult, overrideTier: 1 | 2 | 3 | undefined, floor: 1 | 2 | 3, floorLabel: string): TierResult {
  if (overrideTier === undefined) return scored
  const { tier, flooredBy } = clampToFloor(overrideTier, floor, floorLabel)
  return { ...scored, tier, flooredBy }
}

/** Resolves one vehicle group into a priced line, or null when the vehicle has
 *  no valid `romInputs`/`calc.priceRange` ("pricing not configured").
 *  `totalFleetSize` is the whole program's fleet size (FleetSummary.totalFleetSold)
 *  — the fleet-size integration-complexity band reflects total deployment
 *  scale, not this one chassis's own qty. */
export function resolveRomSellPriceLine(
  vehicle: Vehicle,
  group: FleetGroup,
  totalFleetSize: number,
  answers: ComplexityAnswers,
  override: RomSellPriceOverride | undefined
): RomSellPriceLine | null {
  const romInputs = getValidRomInputs(vehicle)
  if (!romInputs) return null

  const integrationScored = scoreTier(
    buildIntegrationTriggers(answers, totalFleetSize),
    PRICING_ASSUMPTIONS.integrationScoring,
    romInputs.integrationFloor,
    'vehicle integration floor'
  )
  const softwareScored = scoreTier(
    buildSoftwareTriggers(answers),
    PRICING_ASSUMPTIONS.softwareScoring,
    romInputs.softwareFloor,
    'vehicle software floor'
  )
  const integrationResult = withOverride(integrationScored, override?.integrationTierOverride, romInputs.integrationFloor, 'vehicle integration floor')
  const softwareResult = withOverride(softwareScored, override?.softwareTierOverride, romInputs.softwareFloor, 'vehicle software floor')

  const pricing = computeSellPriceRom({
    vehicle,
    romInputs,
    qty: group.fleetSold,
    integrationResult,
    softwareResult,
    assumptions: PRICING_ASSUMPTIONS,
  })

  return {
    vehicle,
    vehicleId: group.vehicleId,
    vehicleName: vehicle.name,
    qty: group.fleetSold,
    integrationResult,
    softwareResult,
    pricing,
  }
}

/** Resolves every engineer-assigned chassis with fleetSold > 0 into a priced
 *  line, silently omitting any with no configured pricing. */
export function resolveAllRomSellPriceLines(
  project: StoredProject,
  fleet: FleetSummary,
  vehicleById: Map<string, Vehicle>
): RomSellPriceLine[] {
  const answers = complexityAnswersFromProject(project)
  const overrides = project.romSellPriceOverrides ?? {}

  const lines: RomSellPriceLine[] = []
  for (const g of fleet.groups) {
    if (g.fleetSold <= 0) continue
    const vehicle = vehicleById.get(g.vehicleId)
    if (!vehicle) continue
    const line = resolveRomSellPriceLine(vehicle, g, fleet.totalFleetSold, answers, overrides[g.vehicleId])
    if (line) lines.push(line)
  }
  return lines
}

/** The fleet-wide total across every resolved line: Hardware/Integration/
 *  Software summed, the project's selected adders added ONCE, and the ROM
 *  band applied on that fleet aggregate. Both the ROM Configuration UI and
 *  the PPTX appendix call this — never sum `line.pricing` fields directly. */
export function resolveFleetSellPriceTotal(project: StoredProject, lines: RomSellPriceLine[]): FleetSellPriceTotal {
  const selectedAdderIds = project.romSellPriceSelectedAdderIds ?? []
  return aggregateFleetSellPrice(lines, selectedAdderIds, ADDERS_CONFIG, PRICING_ASSUMPTIONS)
}
```

- [ ] **Step 2: Typecheck (expect remaining failures in dependent files)**

Run: `npx tsc --noEmit`
Expected: errors in `src/lib/__tests__/romSellPriceLine.test.ts` (still passes a 6th `[]` arg to `resolveRomSellPriceLine`), `src/lib/pptx/__tests__/romSellPrice.test.ts` (`.pricing.sellTotal` no longer exists), `src/lib/pptx/romSellPrice.ts` (`l.pricing.addersTotal`/`l.pricing.sellTotal` no longer exist), `src/components/rom/RomSellPriceCell.tsx` (calls `resolveRomSellPriceLine` with 6 args, reads `.pricing.sellTotal`). These are fixed in Tasks 4, 5, and 11 respectively — do not fix them here.

- [ ] **Step 3: Commit**

```bash
git add src/lib/romSellPriceLine.ts
git commit -m "refactor: romSellPriceLine drops per-line adders, adds resolveFleetSellPriceTotal"
```

---

## Task 4: Fix the two existing test fixtures broken by Task 3's API change

**Files:**
- Modify: `src/lib/__tests__/romSellPriceLine.test.ts`
- Modify: `src/lib/pptx/__tests__/romSellPrice.test.ts`

- [ ] **Step 1: Drop the trailing `selectedAdderIds` argument in `romSellPriceLine.test.ts`**

In `src/lib/__tests__/romSellPriceLine.test.ts`, there are three calls of the form `resolveRomSellPriceLine(veh(...), group(), 2, flatAnswers, override, [])`. Remove the trailing `, []` from each of the three calls, so they read:

```ts
    const line = resolveRomSellPriceLine(veh(3, 1), group(), 2, flatAnswers, override)
```
```ts
    const line = resolveRomSellPriceLine(veh(1, 1), group(), 2, flatAnswers, override)
```
```ts
    const line = resolveRomSellPriceLine(veh(1, 1), group(), 2, flatAnswers, override)
```

(Three separate edits — the three test bodies each have one such call, with different `veh(...)`/`override` arguments already shown above; only the trailing `, []` is removed from each.)

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/romSellPriceLine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Rename `.pricing.sellTotal` to `.pricing.lineSubtotal` in `pptx/__tests__/romSellPrice.test.ts`**

In `src/lib/pptx/__tests__/romSellPrice.test.ts`, inside the `'computes a line for an assigned, priced vehicle'` test, change:

```ts
    expect(lines[0].pricing.sellTotal).toBeGreaterThan(0)
```

to:

```ts
    expect(lines[0].pricing.lineSubtotal).toBeGreaterThan(0)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pptx/__tests__/romSellPrice.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/romSellPriceLine.test.ts src/lib/pptx/__tests__/romSellPrice.test.ts
git commit -m "test: update fixtures for the per-line adders removal (Task 3 API change)"
```

---

## Task 5: Update the PPTX appendix for the new fleet-total shape

**Files:**
- Modify: `src/lib/pptx/romSellPrice.ts`
- Modify: `src/lib/pptxTemplateExport.ts`

- [ ] **Step 1: Replace the full contents of `src/lib/pptx/romSellPrice.ts`**

```ts
// src/lib/pptx/romSellPrice.ts — appendix slide for the internal ROM sell-price
// engine (Hardware + Integration + Software + Adders). Extends the existing
// template-fill pipeline (per-vehicle table, same frame() convention as
// fillCostDetail) rather than building a separate standalone deck — see
// docs/CHANGELOG.md (2026-09-09 compatibility review) for why. Pure rendering:
// all scoring/pricing is resolved once by src/lib/romSellPriceLine.ts, the
// same resolver the ROM Configuration step UI uses, so the two surfaces can't
// drift on a missing-romInputs vehicle, an override, or adders double-counting.
import type PizZip from 'pizzip'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import { frame, usd } from './layout'
import { TAL_RED, type TableCell } from './ooxml'

const redCell = (t: string, align: TableCell['align'] = 'r'): TableCell => ({ t, align, fill: TAL_RED, color: 'FFFFFF', bold: true })

/** Appendix slide: Vehicle · Qty · Hardware · Integration · Software · Subtotal
 *  per assigned chassis, closed by one fleet-wide "Adders" row and a red TOTAL
 *  row (adders are project-wide, not per-vehicle — see fleetSellPrice.ts),
 *  plus a caption naming each vehicle's tiers. No-ops (renders nothing) when
 *  `lines` is empty — the caller is expected to only clone/keep this slide
 *  when {@link resolveAllRomSellPriceLines} returns a non-empty array. */
export function fillRomSellPriceAppendix(
  zip: PizZip,
  slide: number,
  lines: RomSellPriceLine[],
  fleetTotal: FleetSellPriceTotal
): void {
  if (lines.length === 0) return

  const rows: TableCell[][] = [[
    { t: 'Vehicle' }, { t: 'Qty', align: 'r' }, { t: 'Hardware', align: 'r' },
    { t: 'Integration', align: 'r' }, { t: 'Software', align: 'r' }, { t: 'Subtotal', align: 'r' },
  ]]
  for (const l of lines) {
    const { hardwareSellTotal, integrationSellTotal, softwareSellTotal, lineSubtotal } = l.pricing
    rows.push([
      { t: l.vehicleName }, { t: String(l.qty), align: 'r' },
      { t: usd(hardwareSellTotal), align: 'r' }, { t: usd(integrationSellTotal), align: 'r' },
      { t: usd(softwareSellTotal), align: 'r' }, { t: usd(lineSubtotal), align: 'r' },
    ])
  }
  rows.push([
    { t: 'Adders (fleet-wide)' }, { t: '' }, { t: '' }, { t: '' }, { t: '' },
    { t: usd(fleetTotal.addersTotal), align: 'r' },
  ])
  rows.push([
    redCell('TOTAL', 'l'),
    redCell(String(fleetTotal.totalQty)),
    redCell(usd(fleetTotal.hardwareTotal)),
    redCell(usd(fleetTotal.integrationTotal)),
    redCell(usd(fleetTotal.softwareTotal)),
    redCell(usd(fleetTotal.sellTotal)),
  ])

  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — ROM SELL PRICE')
  f.table([1900000, 700000, 1300000, 1300000, 1200000, 1400000], rows, { rowH: 340000 })
  const tierNote = lines
    .map(l => `${l.vehicleName}: Integration T${l.integrationResult.tier} · Software T${l.softwareResult.tier}`)
    .join(' · ')
  f.caption(`ROM — budgetary estimate, placeholder pricing pending Kyle · ${tierNote}`)
}
```

- [ ] **Step 2: Wire the fleet total into `src/lib/pptxTemplateExport.ts`**

Find this line (around line 22):

```ts
import { resolveAllRomSellPriceLines } from '@/src/lib/romSellPriceLine'
```

Replace it with:

```ts
import { resolveAllRomSellPriceLines, resolveFleetSellPriceTotal } from '@/src/lib/romSellPriceLine'
```

Find this line (around line 102):

```ts
  const sellPriceLines = resolveAllRomSellPriceLines(project, model.fleet, vehicleById)
  const sellPriceSlide = sellPriceLines.length > 0 ? cloneSlide(zip, ROM_SLIDE.requirements) : null
```

Replace it with:

```ts
  const sellPriceLines = resolveAllRomSellPriceLines(project, model.fleet, vehicleById)
  const sellPriceFleetTotal = sellPriceLines.length > 0 ? resolveFleetSellPriceTotal(project, sellPriceLines) : null
  const sellPriceSlide = sellPriceLines.length > 0 ? cloneSlide(zip, ROM_SLIDE.requirements) : null
```

Find this block (around line 174):

```ts
  if (sellPriceSlide != null) {
    setSlideTitle(zip, sellPriceSlide, 'ROM sell price — internal detail')
    fillRomSellPriceAppendix(zip, sellPriceSlide, sellPriceLines)
  }
```

Replace it with:

```ts
  if (sellPriceSlide != null && sellPriceFleetTotal != null) {
    setSlideTitle(zip, sellPriceSlide, 'ROM sell price — internal detail')
    fillRomSellPriceAppendix(zip, sellPriceSlide, sellPriceLines, sellPriceFleetTotal)
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/pptx/romSellPrice.ts` or `src/lib/pptxTemplateExport.ts`. (Errors may remain in `src/components/rom/RomSellPriceCell.tsx` — fixed in Task 11.)

- [ ] **Step 4: Run the PPTX-related test suite**

Run: `npx vitest run src/lib/pptx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/romSellPrice.ts src/lib/pptxTemplateExport.ts
git commit -m "feat: PPTX ROM sell-price appendix shows one fleet-wide adders/total row"
```

---

## Task 6: Update the PPTX token contract doc for the new appendix table shape

**Files:**
- Modify: `docs/PPTX-TOKEN-CONTRACT.md`

- [ ] **Step 1: Update the appendix item description**

Find this text (in the numbered appendix-chain list, item 7):

```
7. **ROM sell price** (2026-09-09) — internal sell-price build-up, separate from the
   customer-facing ROM economics above: one row per engineer-assigned chassis with
   configured pricing (Vehicle · Qty · Hardware · Integration · Software · Adders · Total),
   closed by a red TOTAL row, footnote naming each vehicle's Integration/Software tier.
   `src/lib/pptx/romSellPrice.ts` (`buildRomSellPriceLines` / `fillRomSellPriceAppendix`).
   The slide is only cloned when at least one line has valid pricing — silently absent
   otherwise, not a blank shell. Eyebrow: `APPENDIX — ROM SELL PRICE`.
```

Replace it with:

```
7. **ROM sell price** (2026-09-09, updated 2026-09-09) — internal sell-price build-up,
   separate from the customer-facing ROM economics above: one row per engineer-assigned
   chassis with configured pricing (Vehicle · Qty · Hardware · Integration · Software ·
   Subtotal), closed by one fleet-wide "Adders (fleet-wide)" row and a red TOTAL row —
   adders are a project-wide, once-only cost, not per-vehicle, so they never appear as a
   per-row column (a fleet of N chassis must not multiply a selected adder by N). Footnote
   names each vehicle's Integration/Software tier. `src/lib/pptx/romSellPrice.ts`
   (`fillRomSellPriceAppendix`, fed by `resolveAllRomSellPriceLines` +
   `resolveFleetSellPriceTotal` from `src/lib/romSellPriceLine.ts`). The slide is only
   cloned when at least one line has valid pricing — silently absent otherwise, not a
   blank shell. Eyebrow: `APPENDIX — ROM SELL PRICE`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PPTX-TOKEN-CONTRACT.md
git commit -m "docs: PPTX-TOKEN-CONTRACT reflects the fleet-wide adders row"
```

---

## Task 7: Extract shared ROM sell-price UI building blocks

**Files:**
- Create: `src/components/rom/RomSellPriceParts.tsx`

This pulls `fullUsd`, `ReceiptRow`, and `TierBreakdown` out of `RomSellPriceCell.tsx` verbatim (unchanged behavior) so both `VehicleSellPriceBlock.tsx` (Task 8) and `RomFleetSellPrice.tsx` (Task 9) can use them without duplication. `RomSellPriceCell.tsx` itself is deleted in Task 11.

- [ ] **Step 1: Create `src/components/rom/RomSellPriceParts.tsx`**

```tsx
'use client'

import { memo, type ReactNode, useState } from 'react'
import type { TierResult } from '@/src/calc/scoreTier'
import { complexityLabel } from '@/src/lib/romComplexityLabels'

/** Full-precision USD ("$770,000") — deliberately NOT the shared compact
 *  `money` from vehicleDisplay.ts ("$1.25M"/"$50K"): ROM Configuration wants
 *  exact figures, the compact form is for customer-facing dashboard tiles.
 *  Formatter hoisted to module scope — constructing Intl.NumberFormat is not
 *  free and this renders many times per render across a full fleet. */
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export function fullUsd(n: number): string {
  return usdFormatter.format(n)
}

/** One receipt line: label + amount, expandable (native <details>, no extra
 *  state) to reveal the substituted math behind the figure. */
export function ReceiptRow({ label, amount, detail }: { label: string; amount: string; detail: ReactNode }) {
  return (
    <details className="rom-sp-receipt-row">
      <summary>
        <svg className="rom-sp-receipt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <span>{label}</span>
        <span className="rom-sp-receipt-amount mono">{amount}</span>
      </summary>
      <div className="rom-sp-receipt-detail">{detail}</div>
    </details>
  )
}

/** One complexity axis (Integration or Software): scored tier + reasons +
 *  not-triggered list + an override control. Local `draftReason` state so
 *  typing a reason doesn't fire a storage write per keystroke — committed
 *  onBlur via `onReasonChange`. */
export const TierBreakdown = memo(function TierBreakdown({
  title,
  result,
  onOverride,
  overrideTier,
  overrideReason,
  onReasonChange,
}: {
  title: string
  result: TierResult
  onOverride: (tier: 1 | 2 | 3 | undefined) => void
  overrideTier: 1 | 2 | 3 | undefined
  overrideReason: string | undefined
  onReasonChange: (reason: string) => void
}) {
  const [draftReason, setDraftReason] = useState(overrideReason ?? '')

  return (
    <div className="rom-sp-tier rom2-hero">
      <div className="rom2-hero-head">{title}</div>
      <div className="rom-sp-tier-figure">
        <span className="rom-sp-tier-badge">Tier {result.tier}</span>
        <span className="rom-sp-tier-score">score {result.score}</span>
      </div>
      {result.flooredBy && (
        <p className="rom-sp-floor-note">Floored by {result.flooredBy} — vehicle&rsquo;s inherent minimum</p>
      )}
      {result.reasons.length > 0 ? (
        <dl className="rom-sp-reasons">
          {result.reasons.map(r => (
            <div key={r.label}><dt>{complexityLabel(r.label)}</dt><dd>+{r.points}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="rom-sp-empty-drivers">No complexity drivers triggered — floor tier only.</p>
      )}
      {result.notTriggered.length > 0 && (
        <details className="rom-sp-not-triggered">
          <summary>{result.notTriggered.length} not triggered</summary>
          <ul>{result.notTriggered.map(k => <li key={k}>{complexityLabel(k)}</li>)}</ul>
        </details>
      )}
      <div className="rom-sp-override">
        <label>
          Override
          <select
            value={overrideTier ?? ''}
            onChange={e => onOverride(e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3))}
          >
            <option value="">Use scored tier</option>
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
          </select>
        </label>
        {overrideTier !== undefined && (
          <input
            type="text"
            placeholder="Reason for override"
            value={draftReason}
            onChange={e => setDraftReason(e.target.value)}
            onBlur={() => onReasonChange(draftReason)}
          />
        )}
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (this file is not imported by anything yet, so it just needs to typecheck standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/RomSellPriceParts.tsx
git commit -m "refactor: extract fullUsd/ReceiptRow/TierBreakdown into shared RomSellPriceParts"
```

---

## Task 8: Create the per-vehicle sell-price block

**Files:**
- Create: `src/components/rom/VehicleSellPriceBlock.tsx`

One engineer-assigned chassis's complexity breakdowns + Hardware/Integration/Software receipt, ending in a **Subtotal** (never "Total" — adders aren't included here, they're fleet-wide only, shown once in `RomFleetSellPrice.tsx`).

- [ ] **Step 1: Create `src/components/rom/VehicleSellPriceBlock.tsx`**

```tsx
'use client'

import type { RomSellPriceLine, RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { getValidRomInputs } from '@/src/lib/romPricingValidation'
import { vehiclePricingMidpoint } from '@/src/calc/sellPriceRom'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import { fullUsd, ReceiptRow, TierBreakdown } from './RomSellPriceParts'

interface Props {
  line: RomSellPriceLine
  override: RomSellPriceOverride | undefined
  onOverride: (patch: Partial<RomSellPriceOverride>) => void
}

/** One engineer-assigned chassis's ROM sell-price block: both complexity
 *  breakdowns + a Hardware/Integration/Software receipt closed by a
 *  Subtotal — never "Total": adders are fleet-wide only, shown once in
 *  RomFleetSellPrice's Fleet total section, not per vehicle. */
export default function VehicleSellPriceBlock({ line, override, onOverride }: Props) {
  const romInputs = getValidRomInputs(line.vehicle)
  const integrationMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(line.integrationResult.tier) as '1' | '2' | '3']
  const softwareMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(line.softwareResult.tier) as '1' | '2' | '3']

  return (
    <section className="rom-sp-vehicle-block">
      <h3 className="rom-sp-vehicle-name">
        {line.vehicleName} <span className="mono">× {line.qty}</span>
      </h3>

      <div className="rom-sp-breakdowns">
        <TierBreakdown
          title="Integration Complexity"
          result={line.integrationResult}
          overrideTier={override?.integrationTierOverride}
          overrideReason={override?.integrationOverrideReason}
          onOverride={tier => onOverride({ integrationTierOverride: tier })}
          onReasonChange={reason => onOverride({ integrationOverrideReason: reason })}
        />
        <TierBreakdown
          title="Software Complexity"
          result={line.softwareResult}
          overrideTier={override?.softwareTierOverride}
          overrideReason={override?.softwareOverrideReason}
          onOverride={tier => onOverride({ softwareTierOverride: tier })}
          onReasonChange={reason => onOverride({ softwareOverrideReason: reason })}
        />
      </div>

      <div className="rom-sp-receipt">
        <ReceiptRow
          label="Hardware"
          amount={fullUsd(line.pricing.hardwareSellTotal)}
          detail={
            <div className="rom-sp-receipt-detail-row">
              <span>{fullUsd(vehiclePricingMidpoint(line.vehicle))} vehicle midpoint × {line.qty} units</span>
              <span className="mono">{fullUsd(line.pricing.hardwareSellTotal)}</span>
            </div>
          }
        />
        <ReceiptRow
          label="Integration"
          amount={fullUsd(line.pricing.integrationSellTotal)}
          detail={romInputs && (
            <div className="rom-sp-receipt-detail-row">
              <span>{fullUsd(romInputs.baseIntegrationSellPrice)} base (incl. commissioning) × {integrationMultiplier}× (Tier {line.integrationResult.tier})</span>
              <span className="mono">{fullUsd(line.pricing.integrationSellTotal)}</span>
            </div>
          )}
        />
        <ReceiptRow
          label="Software"
          amount={fullUsd(line.pricing.softwareSellTotal)}
          detail={romInputs && (
            <div className="rom-sp-receipt-detail-row">
              <span>{fullUsd(romInputs.baseSoftwareSellPrice)} base × {softwareMultiplier}× (Tier {line.softwareResult.tier})</span>
              <span className="mono">{fullUsd(line.pricing.softwareSellTotal)}</span>
            </div>
          )}
        />
        <div className="rom-sp-receipt-total">
          <span>Subtotal ({line.qty} unit{line.qty === 1 ? '' : 's'})</span>
          <span className="rom-sp-receipt-amount mono">{fullUsd(line.pricing.lineSubtotal)}</span>
        </div>
        <div className="rom-sp-receipt-foot">
          <span>Per unit</span>
          <span className="mono">{fullUsd(line.pricing.sellPerUnit)}</span>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (this file isn't imported yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/VehicleSellPriceBlock.tsx
git commit -m "feat: add VehicleSellPriceBlock (one chassis's complexity + receipt subtotal)"
```

---

## Task 9: Create the full-fleet orchestrator

**Files:**
- Create: `src/components/rom/RomFleetSellPrice.tsx`

This is the new page-level component: one `VehicleSellPriceBlock` per engineer-assigned, priced chassis, followed by a fleet-wide **TOTAL** section (Hardware/Integration/Software/Adders/TOTAL/Per-unit-blended/Program-range) and the shared adders checklist.

- [ ] **Step 1: Create `src/components/rom/RomFleetSellPrice.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary } from '@/src/calc/types'
import { updateProject } from '@/src/lib/storage'
import { complexityAnswersFromProject } from '@/src/lib/romComplexityFromProject'
import {
  resolveRomSellPriceLine, resolveFleetSellPriceTotal, type RomSellPriceLine, type RomSellPriceOverride,
} from '@/src/lib/romSellPriceLine'
import { GAP_FIELDS } from '@/src/calc/complexityInputs'
import { ADDERS_CONFIG } from '@/src/lib/pricingContent'
import { fullUsd } from './RomSellPriceParts'
import VehicleSellPriceBlock from './VehicleSellPriceBlock'

interface Props {
  project: StoredProject
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
}

/** ROM Configuration (Step 4) — the full-fleet internal sell-price build-up
 *  (Hardware + Integration + Software + Adders), one block per engineer-
 *  assigned chassis with configured pricing, closed by a fleet-wide TOTAL.
 *  Adders are a project-wide, once-only cost — computed here exactly once via
 *  resolveFleetSellPriceTotal, never per vehicle (see src/calc/fleetSellPrice.ts
 *  for the bug this replaced: adders used to be added on every vehicle line
 *  independently). Scoring/pricing is resolved by the shared
 *  src/lib/romSellPriceLine.ts — the PPTX export
 *  (src/lib/pptx/romSellPrice.ts) uses the same resolver so the two surfaces
 *  can't drift. */
export default function RomFleetSellPrice({ project, fleet, vehicleById }: Props) {
  const assignedGroups = useMemo(() => fleet.groups.filter(g => g.fleetSold > 0), [fleet.groups])
  const [selectedAdderIds, setSelectedAdderIds] = useState<string[]>(project.romSellPriceSelectedAdderIds ?? [])
  const [overrides, setOverrides] = useState(project.romSellPriceOverrides ?? {})

  const persist = (next: { selectedAdderIds?: string[]; overrides?: typeof overrides }) => {
    updateProject(project.id, {
      romSellPriceSelectedAdderIds: next.selectedAdderIds ?? selectedAdderIds,
      romSellPriceOverrides: next.overrides ?? overrides,
    })
  }

  const answers = useMemo(() => complexityAnswersFromProject(project), [project])

  const lines = useMemo(() => {
    const resolved: RomSellPriceLine[] = []
    for (const g of assignedGroups) {
      const vehicle = vehicleById.get(g.vehicleId)
      if (!vehicle) continue
      const line = resolveRomSellPriceLine(vehicle, g, fleet.totalFleetSold, answers, overrides[g.vehicleId])
      if (line) resolved.push(line)
    }
    return resolved
  }, [assignedGroups, vehicleById, fleet.totalFleetSold, answers, overrides])

  const fleetTotal = useMemo(() => {
    const projectForTotal: StoredProject = { ...project, romSellPriceSelectedAdderIds: selectedAdderIds }
    return resolveFleetSellPriceTotal(projectForTotal, lines)
  }, [project, selectedAdderIds, lines])

  const setOverride = (vehicleId: string, patch: Partial<RomSellPriceOverride>) => {
    const next = { ...overrides, [vehicleId]: { ...overrides[vehicleId], ...patch } }
    setOverrides(next)
    persist({ overrides: next })
  }

  const toggleAdder = (id: string) => {
    const next = selectedAdderIds.includes(id) ? selectedAdderIds.filter(a => a !== id) : [...selectedAdderIds, id]
    setSelectedAdderIds(next)
    persist({ selectedAdderIds: next })
  }

  if (assignedGroups.length === 0) {
    return (
      <p className="rom-sp-empty">
        No vehicles assigned to any flow yet — ROM configuration appears once the engineer
        assigns a vehicle in the Fleet Engine.
      </p>
    )
  }

  return (
    <div className="rom-sp">
      <p className="rom-sp-placeholder-warning">
        ROM — budgetary estimate, placeholder pricing. All dollar values and multipliers are
        pending real pricing input.
      </p>
      <p className="rom-sp-gap-flag">
        Complexity may be understated — not yet collected by the questionnaire:{' '}
        {GAP_FIELDS.join(', ')}.
      </p>

      {lines.length === 0 && (
        <p className="rom-sp-empty">
          None of the {assignedGroups.length} assigned vehicle{assignedGroups.length === 1 ? '' : 's'} has
          pricing configured — missing romInputs or calc.priceRange.
        </p>
      )}

      {lines.map(line => (
        <VehicleSellPriceBlock
          key={line.vehicleId}
          line={line}
          override={overrides[line.vehicleId]}
          onOverride={patch => setOverride(line.vehicleId, patch)}
        />
      ))}

      {lines.length > 0 && (
        <section className="rom-sp-pricing rom2-hero rom-sp-fleet-total">
          <div className="rom2-hero-head">
            Fleet total — {fleetTotal.totalQty} unit{fleetTotal.totalQty === 1 ? '' : 's'} across{' '}
            {lines.length} vehicle {lines.length === 1 ? 'type' : 'types'}
          </div>
          <div className="rom-sp-receipt">
            <div className="rom-sp-receipt-foot"><span>Hardware</span><span className="mono">{fullUsd(fleetTotal.hardwareTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Integration</span><span className="mono">{fullUsd(fleetTotal.integrationTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Software</span><span className="mono">{fullUsd(fleetTotal.softwareTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Adders</span><span className="mono">{fullUsd(fleetTotal.addersTotal)}</span></div>
            <div className="rom-sp-receipt-total">
              <span>TOTAL ({fleetTotal.totalQty} units)</span>
              <span className="rom-sp-receipt-amount mono">{fullUsd(fleetTotal.sellTotal)}</span>
            </div>
            <div className="rom-sp-receipt-foot"><span>Per unit (blended)</span><span className="mono">{fullUsd(fleetTotal.sellPerUnit)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Program range</span><span className="mono">{fullUsd(fleetTotal.band.lowTotal)} – {fullUsd(fleetTotal.band.highTotal)}</span></div>
          </div>

          <div className="rom-sp-adders">
            <span className="rom-card-eyebrow">Adders</span>
            <div className="rom-sp-adder-grid">
              {ADDERS_CONFIG.adders.map(a => (
                <label key={a.id} className="rom-sp-adder-row">
                  <input
                    type="checkbox"
                    checked={selectedAdderIds.includes(a.id)}
                    onChange={() => toggleAdder(a.id)}
                  />
                  {a.label} <span className="mono">{fullUsd(a.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
```

Note on `fleetTotal`: `resolveFleetSellPriceTotal` reads adders from its `project` argument's `romSellPriceSelectedAdderIds`. Local `selectedAdderIds` state can be one toggle ahead of the last-persisted `project` prop (the persisted write is async), so `fleetTotal` builds a shallow-copied `projectForTotal` with the *current* local `selectedAdderIds` spliced in — this keeps the fleet total live on every checkbox click without waiting for the storage round-trip.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/RomFleetSellPrice.tsx
git commit -m "feat: add RomFleetSellPrice — full-fleet ROM configuration with a TOTAL"
```

---

## Task 10: Add CSS for the vehicle blocks and fleet-total section

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append new rules after the existing `.rom-sp-adder-row:has(input:checked)` rule**

Find this line in `app/globals.css`:

```css
.rom-sp-adder-row:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
```

Insert immediately after it (before the following blank line and `.rom-econ-inputs` block):

```css

/* Full-fleet ROM Configuration (Step 4) — one .rom-sp-vehicle-block per
   assigned chassis, stacked, closed by a .rom-sp-fleet-total section. Reuses
   the .rom-sp-* receipt/tile system above; only the vehicle-block wrapper and
   the fleet-total accent border are new. */
.rom-sp-vehicle-block {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px;
  box-shadow: var(--shadow-card); padding: 20px 22px 22px; margin-bottom: 20px;
}
.rom-sp-vehicle-name {
  display: flex; align-items: baseline; gap: 10px;
  font-family: var(--tal-font-family); font-size: 16px; font-weight: 700;
  color: var(--text-primary); margin: 0 0 16px;
}
.rom-sp-vehicle-name .mono { font-family: var(--tal-font-numeric); font-weight: 600; color: var(--text-tertiary); font-size: 13px; }
.rom-sp-fleet-total { border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)); }
.rom-sp-fleet-total .rom-sp-receipt-total { font-size: 16px; }
.rom-sp-fleet-total .rom-sp-adders { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
```

- [ ] **Step 2: Run the production build to catch any CSS parse errors**

Run: `npm run build`
Expected: build succeeds (CSS is not typechecked, but a malformed rule fails the Next.js build).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add .rom-sp-vehicle-block and .rom-sp-fleet-total CSS"
```

---

## Task 11: Delete the old single-vehicle cell and its RomBento hook-in

**Files:**
- Delete: `src/components/rom/RomSellPriceCell.tsx`
- Modify: `src/components/rom/RomBento.tsx`

- [ ] **Step 1: Delete the old component**

```bash
git rm src/components/rom/RomSellPriceCell.tsx
```

- [ ] **Step 2: Remove its import from `RomBento.tsx`**

Find this line:

```tsx
import RomSellPriceCell from './RomSellPriceCell'
```

Delete it entirely.

- [ ] **Step 3: Remove the "Internal ROM — sell price" Cell block from `RomBento.tsx`**

Find this block (the last `<Cell>` before the closing `</div>` of the bento grid):

```tsx
      {/* Internal ROM — sell price (Hardware + Integration + Software + Adders).
          Separate from the customer-facing ROM economics above (src/calc/rom.ts) —
          see src/calc/sellPriceRom.ts for why the two "ROM" concepts stay apart. */}
      <Cell title="Internal ROM — sell price" span={4} cellId="rom-sell-price">
        {/* key=project.id forces a clean remount (resetting local selection/
            override state) when the Step 4 route's [id] param changes without
            a full page reload — Next.js App Router reuses this component
            instance across client-side navigation between projects. */}
        <RomSellPriceCell key={p.project.id} project={p.project} fleet={p.fleet} vehicleById={p.vehicleById} />
      </Cell>
    </div>
```

Replace it with just:

```tsx
    </div>
```

(i.e. delete the whole `{/* Internal ROM... */}` comment plus the `<Cell>...</Cell>` block, leaving the bento grid's closing `</div>` where the Cell used to be.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere (this was the last file referencing the old `RomSellPriceCell`/the old `computeSellPriceRom` adders API).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all test files (this is the point where the full chain — calc, lib, PPTX — should be internally consistent again).

- [ ] **Step 6: Commit**

```bash
git add src/components/rom/RomBento.tsx
git commit -m "refactor: remove the sell-price cell from the Dashboard bento (moved to its own step)"
```

---

## Task 12: Move the Dashboard page from step4 to step5

**Files:**
- Move: `app/projects/[id]/step4/page.tsx` → `app/projects/[id]/step5/page.tsx`
- Modify: the moved file's `currentStep` prop and eyebrow text

- [ ] **Step 1: Move the file**

```bash
git mv "app/projects/[id]/step4/page.tsx" "app/projects/[id]/step5/page.tsx"
```

- [ ] **Step 2: Update `currentStep` in the moved file**

In `app/projects/[id]/step5/page.tsx`, find:

```tsx
        currentStep={4}
```

Replace with:

```tsx
        currentStep={5}
```

- [ ] **Step 3: Update the eyebrow text**

In the same file, find:

```tsx
            <span className="eh-eyebrow mono">Step 04 / 04</span>
```

Replace with:

```tsx
            <span className="eh-eyebrow mono">Step 05 / 05</span>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: an error will surface once Task 14 tightens `PersistentHeader`'s `StepId` type to include `5` — until then, `currentStep={5}` against the *old* `StepId = 0|1|2|3|4` type is a type error. This is expected and resolved by Task 14; do not fix it by reverting this step.

- [ ] **Step 5: Commit**

```bash
git add "app/projects/[id]/step5/page.tsx"
git commit -m "refactor: move ROM Dashboard from step4 to step5"
```

(`git add "app/projects/[id]/step5/page.tsx"` stages both the new path and the deletion of the old `step4/page.tsx` path together — `git status` will show it as a rename since the content is nearly identical, and both sides land in this one commit.)

---

## Task 13: Create the new Step 4 — ROM Configuration page

**Files:**
- Create: `app/projects/[id]/step4/page.tsx`

- [ ] **Step 1: Create `app/projects/[id]/step4/page.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import RomFleetSellPrice from '@/src/components/rom/RomFleetSellPrice'

export default function RomConfigurationPage() {
  const params = useParams()
  const id = params.id as string
  const { project, vehicleById, fleet, loading, error } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  if (loading) {
    return <div className="app-shell"><div className="step2-loading">Loading ROM configuration…</div></div>
  }
  if (error || !project) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{error ?? 'This project does not exist in your browser. Try importing the project file or creating a new project.'}</p>
        </div>
      </div>
    )
  }

  const headerData = {
    id: project.id,
    projectName: project.projectName ?? '',
    customerName: project.customerName ?? '',
    facilityLocation: project.facilityLocation,
    versionNumber: project.versionNumber,
    bastianRep: project.bastianRep,
    opportunityNumber: project.opportunityNumber,
    opportunityType: project.opportunityType,
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={4}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 04 / 05</span>
          <h1 className="eh-title">ROM Configuration</h1>
          <p className="eh-sub">
            Internal sell-price build-up — Hardware + Integration + Software + Adders — for
            every assigned chassis, with a fleet-wide total. Budgetary estimate, placeholder
            pricing pending real numbers from the business owner.
          </p>
        </div>

        <RomFleetSellPrice project={project} fleet={fleet} vehicleById={vehicleById} />

        <div className="step-nav">
          <Link href={`/projects/${id}/step3`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Fleet Engine
          </Link>
          <div className="row">
            <span className="hint">
              {fleet.groups.length === 0
                ? 'Assign a vehicle in the Fleet Engine to configure ROM pricing'
                : `${fleet.groups.length} vehicle ${fleet.groups.length === 1 ? 'type' : 'types'} configured`}
            </span>
            <Link href={`/projects/${id}/step5`} className="btn primary">
              Continue to Dashboard <Icon name="arrowR" size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: an error in `PersistentHeader.tsx`'s `StepId`/`STEPS` (still `0|1|2|3|4`, doesn't know about `currentStep={4}` meaning something new, or `currentStep={5}` from Task 12) — resolved by Task 14, which happens next. Do not fix it here.

- [ ] **Step 3: Commit**

```bash
git add "app/projects/[id]/step4/page.tsx"
git commit -m "feat: add the ROM Configuration step4 page"
```

---

## Task 14: Update PersistentHeader's step nav for 6 steps

**Files:**
- Modify: `src/components/PersistentHeader.tsx`

- [ ] **Step 1: Update the `StepId` type**

Find:

```ts
type StepId = 0 | 1 | 2 | 3 | 4
```

Replace with:

```ts
type StepId = 0 | 1 | 2 | 3 | 4 | 5
```

- [ ] **Step 2: Update the `STEPS` array**

Find:

```ts
const STEPS: ReadonlyArray<{ id: StepId; label: string; desc: string }> = [
  { id: 0, label: 'Start',        desc: 'Import or create' },
  { id: 1, label: 'Application',  desc: 'Load, transfer, environment' },
  { id: 2, label: 'Vehicles',     desc: 'Compatibility & qualification' },
  { id: 3, label: 'Fleet Engine', desc: 'Flows, charging & buffer' },
  { id: 4, label: 'ROM Dashboard', desc: 'Fleet, KPIs & pricing' },
]
```

Replace with:

```ts
const STEPS: ReadonlyArray<{ id: StepId; label: string; desc: string }> = [
  { id: 0, label: 'Start',                   desc: 'Import or create' },
  { id: 1, label: 'Intake Form',              desc: 'Load, transfer, environment' },
  { id: 2, label: 'Hardware Compatibility',   desc: 'Compatibility & qualification' },
  { id: 3, label: 'Fleet Sizing',             desc: 'Flows, charging & buffer' },
  { id: 4, label: 'ROM Configuration',        desc: 'Complexity, adders & sell price' },
  { id: 5, label: 'Dashboard',                desc: 'Fleet, KPIs & pricing' },
]
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors anywhere in the repo now.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: succeeds; the route list should now show both `/projects/[id]/step4` and `/projects/[id]/step5` as dynamic routes.

- [ ] **Step 6: Commit**

```bash
git add src/components/PersistentHeader.tsx
git commit -m "feat: PersistentHeader nav gains the ROM Configuration step (6 steps total)"
```

---

## Task 15: Update the guided tours for the new step

**Files:**
- Modify: `src/components/GuidedTour.tsx`

- [ ] **Step 1: Update `INTRO_GUIDE`'s first step copy and add a 6th step-dot target**

Find:

```ts
const INTRO_GUIDE: Guide = {
  id: 'intro',
  steps: [
    {
      target: '.hero-nav .step-dots',
      title: 'Four steps, one flow',
      body: 'This tool sizes an AGV/AMR fleet in four steps. The engineering discipline behind it: Cut waste → Connect the moves → Add the economics. Here is where each step lives.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(2)',
      title: '① Requirements',
      body: 'Capture what you move, how it transfers, and the environment. These answers qualify vehicles — nothing here is required to move on.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(3)',
      title: '② Vehicles',
      body: 'See which vehicles pass your requirements (green / yellow / red). Informational — you never pick a vehicle here; you just learn the candidates.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(4)',
      title: '③ Fleet Engine',
      body: 'Define your material flows and assign a vehicle to each. This is the heart of the tool — cycle times and raw demand compute live as you go.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(5)',
      title: '④ ROM Dashboard',
      body: 'Fleet size, CAPEX, payback, and cost-per-move — then export the customer deck. Adjust the drivers to run what-if scenarios.',
    },
  ],
}
```

Replace with:

```ts
const INTRO_GUIDE: Guide = {
  id: 'intro',
  steps: [
    {
      target: '.hero-nav .step-dots',
      title: 'Five steps, one flow',
      body: 'This tool sizes an AGV/AMR fleet in five steps. The engineering discipline behind it: Cut waste → Connect the moves → Add the economics. Here is where each step lives.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(2)',
      title: '① Requirements',
      body: 'Capture what you move, how it transfers, and the environment. These answers qualify vehicles — nothing here is required to move on.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(3)',
      title: '② Vehicles',
      body: 'See which vehicles pass your requirements (green / yellow / red). Informational — you never pick a vehicle here; you just learn the candidates.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(4)',
      title: '③ Fleet Engine',
      body: 'Define your material flows and assign a vehicle to each. This is the heart of the tool — cycle times and raw demand compute live as you go.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(5)',
      title: '④ ROM Configuration',
      body: 'Score Integration and Software complexity per vehicle, pick adders, and see a fleet-wide sell-price total — budgetary, placeholder pricing until real numbers land.',
    },
    {
      target: '.hero-nav .step-dot:nth-child(6)',
      title: '⑤ Dashboard',
      body: 'Fleet size, CAPEX, payback, and cost-per-move — then export the customer deck. Adjust the drivers to run what-if scenarios.',
    },
  ],
}
```

- [ ] **Step 2: Retarget `SAMPLE_RFQ_GUIDE`'s Dashboard steps from `/step4` to `/step5`**

There are five steps in `SAMPLE_RFQ_GUIDE` with `route: '/step4'` (targeting `.rom2-hero`, `.rom2-rail-head`, `#rom-fleet-math .rom2-cell-head`, `#rom-assumptions .rom2-cell-head`, and `.rom-card-export` — all Dashboard-only selectors, none of them affected by the sell-price cell's removal). Change each of their `route: '/step4'` to `route: '/step5'`. The five blocks, after the edit, read:

```ts
    {
      route: '/step5',
      // The Financials hero card — a single bounded surface; ringing the whole
      // multi-card kpiband drew broken fragments across the card gaps.
      target: '.rom2-hero',
      title: 'The ROM you\'d send back',
      body: 'Fleet, CAPEX range, payback. Adjust drivers for what-ifs, then Export builds the customer deck.',
    },
    {
      route: '/step5',
      // Desktop drivers render as aside.rom2-rail; the <summary> only exists in
      // the collapsed (narrow) layout and is hidden on desktop — no ring showed.
      target: '.rom2-rail-head',
      title: 'Drivers & scenario panel',
      body: 'Run what-ifs here — throughput boost, labor rate, shifts. Every KPI recomputes live; toggle Baseline / Scenario to compare.',
    },
    {
      route: '/step5',
      target: '#rom-fleet-math .rom2-cell-head',
      title: 'Fleet & flow math',
      body: 'The full sizing math — every stage from cycle time to the binding constraint, with this project\'s numbers substituted in.',
    },
    {
      route: '/step5',
      target: '#rom-assumptions .rom2-cell-head',
      title: 'Assumptions',
      body: 'Every assumption is listed and defensible — DoD, availability, headroom. This is what you stand behind in the customer meeting.',
    },
    {
      route: '/step5',
      target: '.rom-card-export',
      title: 'Export',
      body: 'Done? One format per audience — the customer deck (PPTX), the internal model (Excel), and a JSON revision to reopen later.',
    },
```

- [ ] **Step 3: Retarget the final `SAMPLE_RFQ_GUIDE` step (`target: null`, "Your turn")**

Find:

```ts
    {
      route: '/step4',
      target: null,
      title: 'Your turn',
      body: 'That\'s the whole flow — RFQ in, defensible ROM out. Ready? This wipes the sample and starts your own application.',
    },
```

Replace with:

```ts
    {
      route: '/step5',
      target: null,
      title: 'Your turn',
      body: 'That\'s the whole flow — RFQ in, defensible ROM out. Ready? This wipes the sample and starts your own application.',
    },
```

- [ ] **Step 4: Add one new `SAMPLE_RFQ_GUIDE` step introducing ROM Configuration**

Immediately before the "The ROM you'd send back" step (the first `route: '/step5'` step from Step 2 above — i.e. right after the two `/step3` charging steps and before the Dashboard steps), insert:

```ts
    {
      route: '/step4',
      target: '.rom-sp-vehicle-block',
      title: 'Configure the sell price',
      body: 'Each assigned chassis scores Integration and Software complexity from the intake answers, then prices Hardware + Integration + Software. Pick adders below for a fleet-wide total.',
    },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/GuidedTour.tsx
git commit -m "feat: guided tours cover the new ROM Configuration step"
```

---

## Task 16: Update in-app help content for the new step

**Files:**
- Modify: `src/content/help.ts`

- [ ] **Step 1: Widen the `HelpSection.id` union type**

Find:

```ts
export interface HelpSection {
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4'
```

Replace with:

```ts
export interface HelpSection {
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4' | 'step5'
```

- [ ] **Step 2: Rename the existing `step4` section (ROM Dashboard) to `step5`**

Find (the whole ROM Dashboard section, currently `id: 'step4'`):

```ts
  {
    id: 'step4',
    eyebrow: 'Step 04',
    title: 'ROM Dashboard',
    summary:
      'The customer-facing summary built from the fleet total — KPIs (fleet size, CAPEX range, payback, utilization), charts, and the proposal export. A driver rail on the left lets you run what-if scenarios; every KPI and chart recomputes live, and you can toggle Baseline vs Scenario to compare.',
    howTo: [
      'Read the headline KPIs at the top: total fleet, ROM CAPEX range, payback, net annual benefit.',
      'Adjust a driver on the left (throughput boost, shifts, labor rate, buffer…) to see a what-if; the deltas show green when a change helps, red when it hurts.',
      'Click the maximize icon on any tile to view a chart or table full-screen.',
      'Export the proposal (PowerPoint) or Save project file (.json) from the buttons at the bottom — or the Export button up top.',
    ],
    example: {
      title: 'Example — a what-if',
      lines: [
        'Baseline: 7 vehicles, $1.2–1.5M, 2.8-year payback.',
        'Set “Throughput boost” to +20% → fleet and CAPEX rise, payback shifts.',
        'Toggle Baseline / Scenario to compare the two side by side.',
      ],
    },
    figure: { mock: 'dashboard', shot: '/images/help/step4.png', caption: 'Step 04 — KPI band, driver rail for what-ifs, gauges, and the operation map.' },
    tips: [
      'Scenarios are in-memory — they never change your saved project until you click “Apply to baseline”.',
      'The PowerPoint export always reflects the baseline numbers, not an unsaved scenario.',
    ],
  },
]
```

Replace with (a new `step4` ROM Configuration section, followed by the renamed `step5` Dashboard section):

```ts
  {
    id: 'step4',
    eyebrow: 'Step 04',
    title: 'ROM Configuration',
    summary:
      'The internal sell-price build-up — Hardware + Integration + Software + Adders — for every vehicle type the engineer assigned in the Fleet Engine. Integration and Software each score a complexity tier from the intake answers (facility size, fleet size, WMS integration, and more); a fleet-wide TOTAL sums every vehicle plus the adders you pick, once.',
    howTo: [
      'For each vehicle block, review the scored Integration and Software tier — hover a reason to see which answer triggered it.',
      'Override a tier with a reason if your judgment differs from the score; an override can never go below the vehicle\'s inherent floor tier.',
      'Open the arrow on any receipt line (Hardware, Integration, Software) to see the substituted math.',
      'Pick adders (warranty, support, training) at the bottom — they apply once to the whole fleet, never per vehicle.',
    ],
    example: {
      title: 'Example — a two-chassis fleet',
      lines: [
        'CB18 ×4: Hardware $750K, Integration $90K (Tier 2), Software $24K (Tier 2) → Subtotal $864K.',
        'M10 ×6: a second block with its own tiers and subtotal.',
        'Fleet total sums both subtotals + one Extended Warranty adder — never doubled per vehicle.',
      ],
    },
    figure: { mock: 'engine', caption: 'Step 04 — one block per assigned chassis, closed by a fleet-wide TOTAL.' },
    tips: [
      'Adders are project-wide, not per-vehicle — checking one applies it once to the fleet total, however many chassis types you have.',
      'A vehicle with no pricing configured (missing romInputs) is skipped with a note, not silently priced at zero.',
    ],
  },
  {
    id: 'step5',
    eyebrow: 'Step 05',
    title: 'Dashboard',
    summary:
      'The customer-facing summary built from the fleet total — KPIs (fleet size, CAPEX range, payback, utilization), charts, and the proposal export. A driver rail on the left lets you run what-if scenarios; every KPI and chart recomputes live, and you can toggle Baseline vs Scenario to compare.',
    howTo: [
      'Read the headline KPIs at the top: total fleet, ROM CAPEX range, payback, net annual benefit.',
      'Adjust a driver on the left (throughput boost, shifts, labor rate, buffer…) to see a what-if; the deltas show green when a change helps, red when it hurts.',
      'Click the maximize icon on any tile to view a chart or table full-screen.',
      'Export the proposal (PowerPoint) or Save project file (.json) from the buttons at the bottom — or the Export button up top.',
    ],
    example: {
      title: 'Example — a what-if',
      lines: [
        'Baseline: 7 vehicles, $1.2–1.5M, 2.8-year payback.',
        'Set “Throughput boost” to +20% → fleet and CAPEX rise, payback shifts.',
        'Toggle Baseline / Scenario to compare the two side by side.',
      ],
    },
    figure: { mock: 'dashboard', shot: '/images/help/step4.png', caption: 'Step 05 — KPI band, driver rail for what-ifs, gauges, and the operation map.' },
    tips: [
      'Scenarios are in-memory — they never change your saved project until you click “Apply to baseline”.',
      'The PowerPoint export always reflects the baseline numbers, not an unsaved scenario.',
    ],
  },
]
```

(The Dashboard section's `figure.shot` intentionally keeps pointing at the pre-existing `/images/help/step4.png` screenshot file on disk — renaming that asset is out of scope for this plan; the `caption` text is updated to say "Step 05" even though the filename still says `step4`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/help.ts
git commit -m "docs: help content covers the new ROM Configuration step, Dashboard renumbered to 05"
```

---

## Task 17: Update ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Update the nav-steps sentence in §3**

Find (inside the "Steps are independent and modular" bullet):

```
Nav steps are now `0 Start · 1 Application · 2 Vehicles · 3 Fleet Engine · 4 ROM Dashboard`.
```

Replace with:

```
Nav steps are now `0 Start · 1 Intake Form · 2 Hardware Compatibility · 3 Fleet Sizing · 4 ROM Configuration · 5 Dashboard` (2026-09-09: ROM Configuration split out of the Dashboard bento into its own step — see `docs/CHANGELOG.md`).
```

- [ ] **Step 2: Update the folder-map comment in §5**

Find:

```
│   ├── projects/[id]/step0..4/   # five step pages (Start · Application · Vehicles · Fleet Engine · ROM)
```

Replace with:

```
│   ├── projects/[id]/step0..5/   # six step pages (Start · Intake · Hardware Compat · Fleet Sizing · ROM Config · Dashboard)
```

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: ARCHITECTURE reflects the six-step wizard"
```

---

## Task 18: Update docs/SPECIFICATION.md

**Files:**
- Modify: `docs/SPECIFICATION.md`

- [ ] **Step 1: Fix the scattered "Step 4" Dashboard references that stay Step 4→5**

Three isolated one-line fixes (each is a distinct sentence elsewhere in the doc — leave the "Step 4: baseFleet → chargingDelta..." calc-pipeline-stage narrative in the "Step 3 — Material Flows" section alone; that "Step 4"/"Step 5" numbering describes the charging/buffer calc *pipeline stages*, a pre-existing, separate convention from the wizard's UI step numbers, and is out of scope here):

Find: `` `src/components/ScrollSection.tsx`, also used by the Step 4 ROM dashboard's scrolling layout. ``
Replace with: `` `src/components/ScrollSection.tsx`, also used by the Step 5 Dashboard's scrolling layout. ``

Find: `` A **Section Picker** (`PptxSectionPicker`, from the Step 4 export bar and the header menu) ``
Replace with: `` A **Section Picker** (`PptxSectionPicker`, from the Step 5 export bar and the header menu) ``

Find: `` (the compact title bar); Step 4 `.rom2-kpiband` (a band, not a page) is unchanged. ``
Replace with: `` (the compact title bar); Step 5 `.rom2-kpiband` (a band, not a page) is unchanged. ``

- [ ] **Step 2: Insert the new Step 4 section, and re-anchor the old section as Step 5, in one edit**

This single edit does two things at once, cleanly, with no overlap: it consumes the old
`## Step 4 — ROM Dashboard` heading line and, in its place, inserts the full new Step 4
section followed immediately by a fresh `## Step 5 — Dashboard` heading. Everything that
used to follow the old heading (the "Customer-facing summary fed by..." paragraph onward)
is untouched below this edit's boundary and now simply reads as Step 5's body — no
separate relocation step is needed for that content.

Find:

```
## Step 4 — ROM Dashboard
```

Replace with:

```
## Step 4 — ROM Configuration

The internal sell-price build-up — Hardware + Integration + Software + Adders — distinct
from the customer-facing ROM economics on the Dashboard (`src/calc/rom.ts`, CAPEX/OPEX/
payback). Lives in `src/calc/sellPriceRom.ts` (per-vehicle) + `src/calc/fleetSellPrice.ts`
(fleet-wide aggregate) to avoid both a name collision with `rom.ts` and, per the
2026-09-09 owner correction below, a double-counting bug. `RomFleetSellPrice.tsx` renders
one `VehicleSellPriceBlock` per engineer-assigned, priced chassis — **every assigned
vehicle type at once**, not a single vehicle picked from a dropdown — closed by a
fleet-wide **TOTAL** section:

- **Hardware** = `vehicle price-range midpoint × qty` — qty only, no complexity score, no
  commissioning. (2026-09-09: commissioning and Integration are the same cost bucket per the
  owner — there is no separate `baseCommissioningPerUnit`; bring-up/install cost lives
  entirely inside `romInputs.baseIntegrationSellPrice` below.)
- **Integration** and **Software** are scored independently by one shared generic tier
  scorer (`src/calc/scoreTier.ts`) against two point tables in
  `content/pricing/global-assumptions.json` (`integrationScoring` / `softwareScoring`), then
  `baseSellPrice × multiplier[tier]`. Integration's base price includes commissioning. Each
  vehicle's `romInputs.integrationFloor`/`softwareFloor` sets a minimum tier the score can't
  go below (an override can raise it further but never below the floor). An engineer can
  override either tier with its own reason (persisted per-vehicle, per-axis in
  `romSellPriceOverrides`).
- Each vehicle block closes with a **Subtotal** (Hardware + Integration + Software only —
  never "Total": adders are fleet-wide, not per-vehicle).
- **Adders** — a flat, project-level checklist from `content/pricing/adders.json`
  (`romSellPriceSelectedAdderIds`, shared across the project's vehicles). **Fixed
  2026-09-09:** adders used to be added to the per-vehicle `computeSellPriceRom` call,
  so a selected adder was silently multiplied by however many vehicle types were in the
  fleet. They are now summed exactly once by `aggregateFleetSellPrice`
  (`src/calc/fleetSellPrice.ts`), in the **Fleet total** section only.
- **Fleet total** = Σ every vehicle's Hardware + Σ Integration + Σ Software + Adders
  (once) → a **ROM band** (`romBand.low`/`.high` in the assumptions file, e.g. −10%/+25%)
  applied ONCE on that fleet-wide sum — not summed from each vehicle's own rounded band,
  which would compound rounding error — rounded to the nearest `rounding` ($5,000 today).

**Complexity inputs** (`src/calc/complexityInputs.ts`, `ComplexityAnswers`) map from the
questionnaire/project schema — see `docs/CHANGELOG.md` (2026-09-09) for the full field
mapping and the gap list. Two point-table axes were dropped by explicit owner decision
(not silently): per-door/elevator counting and multi-site scoring — neither field exists
in the questionnaire and none will be added. Three remaining fields
(`storageTrackingRequired`, `hasAgvExperience`, `pickDropLocationCount`) have no schema
field yet; they default to false/0 and the UI/PPTX surface a visible
"complexity may be understated" flag rather than silently under-scoring.

**ALL dollar values and multipliers are placeholders** pending real pricing from the
business owner — tagged `_placeholder`/`_placeholderWarning` in the JSON content and vehicle
deltas, and shown as a standing banner in the UI/PPTX ("ROM — budgetary estimate, placeholder
pricing").

Vehicle JSON delta (`src/content/vehicles/*.json`, all 6 library vehicles): a `romInputs`
block (`integrationFloor`, `softwareFloor`, `baseIntegrationSellPrice`,
`baseSoftwareSellPrice`) — Zod-validated
(`src/lib/validations/pricingSchemas.ts`, `romInputsSchema`); a vehicle missing it (or
`calc.priceRange`) is excluded from the sell-price UI/PPTX line with a "pricing not
configured" state rather than crashing.

---

## Step 5 — Dashboard
```

- [ ] **Step 3: Delete the now-duplicated "Internal ROM — sell price" block from its old position**

That paragraph block still exists further down the file, inside what is now the Step 5
section, in its original spot (right after the Methodology paragraph, right before
`**Export:**`). It must be deleted from there — its content now lives in the new Step 4
section inserted by Step 2.

Find (note the leading blank line, so the edit also removes the extra gap it leaves behind):

```

**Internal ROM — sell price (2026-09-09, additive).** A separate, internal-only sell-price
build-up — Hardware + Integration + Software + Adders — distinct from the customer-facing
ROM economics above (`src/calc/rom.ts`, CAPEX/OPEX/payback). Lives in `src/calc/sellPriceRom.ts`
to avoid the name collision; a dedicated Step 4 bento cell (`RomSellPriceCell.tsx`, "Internal
ROM — sell price") shows it per engineer-assigned chassis:

- **Hardware** = `vehicle price-range midpoint × qty` — qty only, no complexity score, no
  commissioning. (2026-09-09: commissioning and Integration are the same cost bucket per the
  owner — there is no separate `baseCommissioningPerUnit`; bring-up/install cost lives
  entirely inside `romInputs.baseIntegrationSellPrice` below.)
- **Integration** and **Software** are scored independently by one shared generic tier
  scorer (`src/calc/scoreTier.ts`) against two point tables in
  `content/pricing/global-assumptions.json` (`integrationScoring` / `softwareScoring`), then
  `baseSellPrice × multiplier[tier]`. Integration's base price includes commissioning. Each
  vehicle's `romInputs.integrationFloor`/`softwareFloor` sets a minimum tier the score can't
  go below (an override can raise it further but never below the floor). An engineer can
  override either tier with its own reason (persisted per-vehicle, per-axis in
  `romSellPriceOverrides`).
- **Adders** — a flat, project-level checklist from `content/pricing/adders.json`
  (`romSellPriceSelectedAdderIds`, shared across the project's vehicles, not per-vehicle).
- Total → a **ROM band** (`romBand.low`/`.high` in the assumptions file, e.g. −10%/+25%),
  rounded to the nearest `rounding` ($5,000 today).

**Complexity inputs** (`src/calc/complexityInputs.ts`, `ComplexityAnswers`) map from the
questionnaire/project schema — see `docs/CHANGELOG.md` (2026-09-09) for the full field
mapping and the gap list. Two point-table axes were dropped by explicit owner decision
(not silently): per-door/elevator counting and multi-site scoring — neither field exists
in the questionnaire and none will be added. Three remaining fields
(`storageTrackingRequired`, `hasAgvExperience`, `pickDropLocationCount`) have no schema
field yet; they default to false/0 and the UI/PPTX surface a visible
"complexity may be understated" flag rather than silently under-scoring.

**ALL dollar values and multipliers are placeholders** pending real pricing from the
business owner — tagged `_placeholder`/`_placeholderWarning` in the JSON content and vehicle
deltas, and shown as a standing banner in the UI/PPTX ("ROM — budgetary estimate, placeholder
pricing").

Vehicle JSON delta (`src/content/vehicles/*.json`, all 6 library vehicles): a `romInputs`
block (`integrationFloor`, `softwareFloor`, `baseIntegrationSellPrice`,
`baseSoftwareSellPrice`) — Zod-validated
(`src/lib/validations/pricingSchemas.ts`, `romInputsSchema`); a vehicle missing it (or
`calc.priceRange`) is excluded from the sell-price UI/PPTX line with a "pricing not
configured" state rather than crashing.
```

Replace with nothing (an empty string) — this deletes the whole block, leaving the
Methodology paragraph immediately followed by `**Export:**` with normal single-blank-line
spacing.

- [ ] **Step 4: Verify exactly one of each heading, and no leftover duplicate text**

Run: `grep -n "^## Step 4\|^## Step 5" docs/SPECIFICATION.md`
Expected: exactly one `## Step 4 — ROM Configuration` line and exactly one `## Step 5 — Dashboard` line.

Run: `grep -c "Internal ROM — sell price (2026-09-09, additive)" docs/SPECIFICATION.md`
Expected: `0` (the old paragraph's original heading sentence is gone — its content now lives only in the new Step 4 section's rewritten prose from Step 2, which does not repeat this exact sentence).

- [ ] **Step 5: Commit**

```bash
git add docs/SPECIFICATION.md
git commit -m "docs: SPECIFICATION gets its own Step 4 ROM Configuration section, Dashboard renumbered to 05"
```

---

## Task 19: Update docs/WORKFLOW-GUIDE.md

**Files:**
- Modify: `docs/WORKFLOW-GUIDE.md`

- [ ] **Step 1: Rename the existing Step 4 section header and content title**

Find:

```
#### Step 4 — ROM Dashboard

Return-on-investment summary for the customer deck.
```

Replace with:

```
#### Step 5 — Dashboard

Return-on-investment summary for the customer deck.
```

- [ ] **Step 2: Insert a new Step 4 section before it**

Find:

```
> Distance entry is **one-way**. The engine accounts for round-trip internally.

#### Step 5 — Dashboard
```

Replace with:

```
> Distance entry is **one-way**. The engine accounts for round-trip internally.

#### Step 4 — ROM Configuration

Internal sell-price build-up for every assigned chassis, closed by a fleet-wide total.

1. **Review each vehicle's complexity tiers** — Integration and Software each score from
   the intake answers (facility size, fleet size, WMS integration, and more).
2. **Override a tier** with a reason if your judgment differs — an override can never go
   below the vehicle's inherent floor tier.
3. **Pick adders** (warranty, support, training) — these apply **once** to the whole
   fleet, never per vehicle.
4. Review the **Fleet total**: Hardware + Integration + Software summed across every
   vehicle type, plus adders once, banded to a program range.

> All dollar values and multipliers here are placeholders pending real pricing.

#### Step 5 — Dashboard
```

- [ ] **Step 3: Commit**

```bash
git add docs/WORKFLOW-GUIDE.md
git commit -m "docs: WORKFLOW-GUIDE covers the new ROM Configuration step"
```

---

## Task 20: Update the CHANGELOG

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add a new entry at the top of the file**

Find:

```
# Changelog

## 2026-09-09 — ROM sell-price: commissioning merged into Integration
```

Replace with:

```
# Changelog

## 2026-09-09 — ROM Configuration split into its own step; adders double-counting fixed

The wizard is now 6 steps: `0 Start · 1 Intake Form · 2 Hardware Compatibility ·
3 Fleet Sizing · 4 ROM Configuration · 5 Dashboard`. The internal sell-price engine
(Hardware + Integration + Software + Adders) moved out of the Dashboard's bento grid into
its own dedicated step, and its UI now shows **every** engineer-assigned vehicle type at
once — one block per chassis — closed by a fleet-wide **TOTAL**, instead of a single
vehicle picked from a dropdown.

**Real bug fixed along the way:** `computeSellPriceRom` used to add the *entire* selected-
adders total onto *every* vehicle line independently — a 3-chassis fleet with one $18,000
adder checked would silently charge $54,000 (3×) instead of $18,000. This was invisible
under the old single-vehicle-picker UI (only one line was ever shown/summed at a time) and
became impossible to ignore the moment multiple vehicle types render together. Adders are
now computed exactly once, fleet-wide, by a new pure aggregator
(`src/calc/fleetSellPrice.ts`, `aggregateFleetSellPrice`) — `computeSellPriceRom` no longer
accepts `selectedAdderIds`/`adders` at all, and `RomPricingResult.sellTotal` was renamed to
`lineSubtotal` to make explicit that a per-vehicle figure never includes adders. The ROM
band (±10%/+25% placeholder) is applied once on the fleet aggregate rather than summed from
each vehicle's own rounded band, avoiding compounded rounding error.

**Shipped:**
- `src/calc/fleetSellPrice.ts` — `aggregateFleetSellPrice`, the fleet-wide totals.
- `src/lib/romSellPriceLine.ts` — `resolveRomSellPriceLine` drops its `selectedAdderIds`
  param; `RomSellPriceLine` gains a `vehicle` field; new `resolveFleetSellPriceTotal`
  wires a project's adders selection into the aggregator — the one function both the UI
  and the PPTX appendix call, so they can't drift.
- `src/components/rom/RomSellPriceParts.tsx` — `fullUsd`/`ReceiptRow`/`TierBreakdown`
  extracted from the deleted `RomSellPriceCell.tsx` for reuse.
- `src/components/rom/VehicleSellPriceBlock.tsx` — one chassis's complexity breakdowns +
  receipt, ending in a **Subtotal** (never "Total" — no adders per vehicle).
- `src/components/rom/RomFleetSellPrice.tsx` — the new page-level orchestrator: one block
  per assigned, priced chassis + the fleet-wide TOTAL section + the adders checklist.
  Replaces the deleted `src/components/rom/RomSellPriceCell.tsx`.
- `app/projects/[id]/step4/page.tsx` — new ROM Configuration page.
- `app/projects/[id]/step5/page.tsx` — the former `step4/page.tsx` (Dashboard), moved,
  `currentStep` 4→5.
- `src/components/PersistentHeader.tsx`, `src/components/GuidedTour.tsx`,
  `src/content/help.ts` — nav, both guided tours, and in-app help all updated for the
  6-step flow.
- `src/lib/pptx/romSellPrice.ts` / `src/lib/pptxTemplateExport.ts` — the PPTX appendix
  table drops its per-vehicle Adders column (adders aren't per-vehicle) in favor of one
  fleet-wide "Adders (fleet-wide)" row before the TOTAL row.
- `ARCHITECTURE.md`, `docs/SPECIFICATION.md`, `docs/WORKFLOW-GUIDE.md`,
  `docs/PPTX-TOKEN-CONTRACT.md` — all updated for the new step and the adders fix.

## 2026-09-09 — ROM sell-price: commissioning merged into Integration
```

- [ ] **Step 2: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: CHANGELOG entry for the ROM Configuration step split"
```

---

## Task 21: Full verification pass, manual walkthrough, and push

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 2: Architecture gate**

Run: `npm run check:arch`
Expected: `✓ Architecture checks passed (calc purity · module boundaries · fonts · vehicle data)`

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all test files pass (no skips beyond the one pre-existing env-gated regression test).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds; the printed route list shows `/projects/[id]/step4` and `/projects/[id]/step5` as separate dynamic routes.

- [ ] **Step 5: Clean dev-server restart and manual browser walkthrough**

```bash
rm -rf .next
npm run dev
```

Then, in a browser (or via the Claude_Browser tools):
1. Load the bundled sample project from Step 0.
2. Confirm the header nav now shows 6 tabs: Start · Intake Form · Hardware Compatibility · Fleet Sizing · ROM Configuration · Dashboard.
3. Navigate to Step 4 (ROM Configuration). Confirm every assigned vehicle type renders its own block (not a single-vehicle dropdown), and a **Fleet total** section appears at the bottom with a TOTAL that is the sum of every block's Subtotal plus adders added once.
4. Check an adder. Confirm the Fleet total's Adders line updates by exactly that adder's amount — not multiplied by the number of vehicle blocks.
5. Navigate to Step 5 (Dashboard). Confirm the "Internal ROM — sell price" cell is gone from the bento grid, and everything else on the Dashboard (KPIs, charts, export) still renders.
6. Export the branded PPTX from Step 5. Confirm it completes without a thrown error (check `read_console_messages`/`read_network_requests` if using the browser tools) and that the template fetch (`/templates/tal-rom-template.pptx`) returns 200.
7. Click "Back to Fleet Engine" and "Continue to Dashboard" on the new Step 4 page; confirm both routes navigate correctly.
8. Trigger the intro guided tour (Help → "Take the tour" or the `tal:start-tour` event) and step through it; confirm it now highlights 6 step-dots with no console errors.

- [ ] **Step 6: Stop the dev server**

```bash
pkill -9 -f "next-server"; pkill -9 -f "next dev"
```

- [ ] **Step 7: Push**

```bash
git push origin main
```

Expected: the repo's `pre-push` hook (typecheck · `check:arch` · `vitest run`) passes and the push succeeds.

---

## Self-Review Notes

- **Spec coverage:** "add the new step for ROM configuration" → Tasks 12–14 (route move + new route + nav). "upstream and downstream accounted for" → Tasks 1–9 (calc/lib/PPTX chain kept consistent end-to-end, including the adders bug the new UI would have otherwise exposed). "logs, files, documents updated" → Tasks 6, 15–20 (PPTX contract, guided tours, help content, ARCHITECTURE, SPECIFICATION, WORKFLOW-GUIDE, CHANGELOG). "Full fleets (multiple vehicle types) should be shown. TOTAL." → Tasks 8–9 (`VehicleSellPriceBlock` per chassis + `RomFleetSellPrice`'s Fleet total section) and the adders fix that makes that TOTAL correct (Tasks 1–2).
- **Type consistency:** `RomPricingResult.sellTotal` renamed to `lineSubtotal` consistently across Tasks 1, 3, 4, 5, 8 — checked every call site that reads `.pricing.sellTotal` or `.pricing.addersTotal` is updated in the same task set. `resolveRomSellPriceLine`'s dropped `selectedAdderIds` parameter is removed from all three call sites (`romSellPriceLine.ts` itself, and both test files) in Tasks 3–4. `RomSellPriceLine.vehicle` (new field) is populated in Task 3 and consumed in Task 8.
- **Placeholder scan:** no TBD/TODO markers; every code step contains complete, runnable code; every doc-edit step quotes the exact current text being replaced.
