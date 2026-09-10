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
