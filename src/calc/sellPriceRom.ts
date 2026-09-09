// src/calc/sellPriceRom.ts — internal ROM SELL-PRICE engine: Hardware +
// Integration + Software + Adders → sell total → ROM band.
//
// Deliberately a SEPARATE module from `src/calc/rom.ts` (the existing CAPEX/OPEX/
// payback customer-ROI engine, already wired into the Step 4 dashboard and PPTX
// S25/S27/S28) — same "ROM" word, two different questions. `rom.ts` answers "what
// does the customer pay back and when"; this module answers "what do we sell it
// for, broken into Hardware/Integration/Software/Adders so an estimator can defend
// each line." See docs/CHANGELOG.md (2026-09-09 compatibility review) for why the
// names were kept apart.
//
// PURE. No React, no fetch, no localStorage, no fs. Zod validation of
// `vehicle.romInputs` lives in `src/lib/romPricingValidation.ts` (src/lib/* is
// allowed to import Zod schemas; src/calc/* is not per ARCHITECTURE.md §4) —
// callers validate there and pass the already-validated `RomInputs` in.
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { PricingAssumptions, AddersConfig, RomInputs } from '@/src/lib/validations/pricingSchemas'
import type { TierResult } from './scoreTier'

/** Midpoint of the vehicle's price range — the Hardware line's per-unit vehicle cost. */
export function vehiclePricingMidpoint(vehicle: Vehicle): number {
  const range = vehicle.calc.priceRange
  if (!range) return 0
  return (range.minUsd + range.maxUsd) / 2
}

function roundTo(value: number, increment: number): number {
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
  selectedAdderIds: string[]
  assumptions: PricingAssumptions
  adders: AddersConfig
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
  addersTotal: number
  sellTotal: number
  sellPerUnit: number
  band: RomPricingBand
}

/** Hardware + Integration + Software + Adders → sell total → ROM band. Assumes
 *  `input.romInputs` was already validated by the caller (see the module note
 *  above) — this function does not re-validate, only computes. */
export function computeSellPriceRom(input: RomPricingInput): RomPricingResult {
  if (input.qty <= 0) {
    throw new Error(`computeSellPriceRom: qty must be > 0 (got ${input.qty}) for vehicle "${input.vehicle.id}"`)
  }

  const hardwareSellTotal =
    (vehiclePricingMidpoint(input.vehicle) + input.romInputs.baseCommissioningPerUnit) * input.qty

  const integrationSellTotal =
    input.romInputs.baseIntegrationSellPrice *
    input.assumptions.integrationMultipliers[String(input.integrationResult.tier) as '1' | '2' | '3']

  const softwareSellTotal =
    input.romInputs.baseSoftwareSellPrice *
    input.assumptions.softwareMultipliers[String(input.softwareResult.tier) as '1' | '2' | '3']

  const selected = new Set(input.selectedAdderIds)
  const addersTotal = input.adders.adders
    .filter(a => selected.has(a.id))
    .reduce((sum, a) => sum + a.amount, 0)

  const sellTotal = hardwareSellTotal + integrationSellTotal + softwareSellTotal + addersTotal
  const sellPerUnit = sellTotal / input.qty

  const { low, high } = input.assumptions.romBand
  const rounding = input.assumptions.rounding
  const lowTotal = roundTo(sellTotal * (1 + low), rounding)
  const highTotal = roundTo(sellTotal * (1 + high), rounding)
  const lowPerUnit = roundTo(lowTotal / input.qty, rounding)
  const highPerUnit = roundTo(highTotal / input.qty, rounding)

  return {
    hardwareSellTotal,
    integrationSellTotal,
    softwareSellTotal,
    addersTotal,
    sellTotal,
    sellPerUnit,
    band: { lowTotal, highTotal, lowPerUnit, highPerUnit },
  }
}
