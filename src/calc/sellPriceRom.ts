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
