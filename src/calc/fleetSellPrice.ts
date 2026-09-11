// src/calc/fleetSellPrice.ts — aggregates per-vehicle sell-price lines
// (src/calc/sellPriceRom.ts) into ONE fleet-wide total. Adders are added here,
// exactly once, regardless of fleet size — see the module note in
// sellPriceRom.ts for why they were removed from the per-line calc. The ROM
// band is applied ONCE on the fleet aggregate rather than summed from each
// line's own rounded band, to avoid compounding rounding error across a
// multi-chassis fleet.
//
// Integration (2026-09-10 — shared-fleet-manager rule, owner decision):
// stand-up/bring-up integration work is done ONCE per distinct fleet-manager
// platform, not once per vehicle TYPE. Lines are grouped by
// `fleetManagerPlatform` (the vehicle's fleet-management software, e.g.
// "BlueBotics ANT" — see Vehicle.display.fleetSoftware); each group is
// charged exactly once, using its highest-`integrationSellTotal` (dollar
// amount) line — ties broken by the higher complexity tier — matching the
// goal of reflecting TOTAL PROJECT COST rather than a complexity proxy;
// cheaper same-platform vehicles ride along for free rather than each paying
// their own integration. A fleet on ONE platform end-to-end (the common case
// today — every vehicle in the library ships "BlueBotics ANT") is charged
// integration once, fleet-wide, regardless of how many vehicle types are
// assigned. A fleet mixing platforms pays once PER platform group — never
// summed per vehicle type within a shared group. Software stays summed per
// vehicle type (unchanged) — software integration can differ by vehicle
// role even on a shared fleet-manager platform.
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
  /** Per-platform-group integration billing detail — which platform, which
   *  vehicle's line is the one actually charged, and its dollar amount. One
   *  entry per distinct `fleetManagerPlatform` among the input lines. */
  integrationByPlatform: IntegrationPlatformCharge[]
  /** The high-side band percentage actually used, AFTER widening for
   *  unanswered pricing inputs (equals `assumptions.romBand.high` when
   *  nothing is unknown). Exposed so the UI can say why the range is wide. */
  bandHighPct: number
  /** How many unanswered pricing inputs widened the band. */
  unknownInputCount: number
}

export interface IntegrationPlatformCharge {
  platform: string
  /** vehicleIds sharing this platform in this fleet, in input order. */
  vehicleIds: string[]
  /** vehicleId of the line whose integrationSellTotal is actually charged
   *  (highest integration tier in the group; ties broken by higher amount). */
  billedVehicleId: string
  amount: number
}

/** One line's inputs to the fleet aggregator: its own priced result, qty, and
 *  the two fields needed for the shared-integration grouping rule. */
export interface FleetSellPriceLineInput {
  vehicleId: string
  pricing: RomPricingResult
  qty: number
  fleetManagerPlatform: string
  integrationTier: number
}

/** Sums Hardware/Software across every line's own components, charges
 *  Integration once per shared fleet-manager-platform group (see module
 *  note), adds the project's selected adders ONCE, then applies the ROM band
 *  on that fleet-wide total.
 *
 *  `unknownInputCount` is how many pricing-relevant intake inputs are still
 *  unanswered (see `pricingInputConfidence` in
 *  src/lib/romComplexityFromProject.ts). Each one widens the HIGH side of the
 *  band per `assumptions.unknownInputPenalty`, because an unanswered input
 *  scores zero complexity points — indistinguishable from "this site is
 *  simple" — so a thin intake would otherwise quote like the easiest possible
 *  project. The widening is one-sided on purpose: an unknown can only mean
 *  MORE complexity than that default assumed, never less. Defaults to 0 so
 *  callers that genuinely have no project context keep the base band. */
export function aggregateFleetSellPrice(
  lines: FleetSellPriceLineInput[],
  selectedAdderIds: string[],
  adders: AddersConfig,
  assumptions: PricingAssumptions,
  unknownInputCount = 0
): FleetSellPriceTotal {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0)
  const hardwareTotal = lines.reduce((s, l) => s + l.pricing.hardwareSellTotal, 0)
  const softwareTotal = lines.reduce((s, l) => s + l.pricing.softwareSellTotal, 0)

  const platformGroups = new Map<string, FleetSellPriceLineInput[]>()
  for (const line of lines) {
    const group = platformGroups.get(line.fleetManagerPlatform)
    if (group) group.push(line)
    else platformGroups.set(line.fleetManagerPlatform, [line])
  }
  const integrationByPlatform: IntegrationPlatformCharge[] = Array.from(platformGroups.entries()).map(
    ([platform, group]) => {
      const billed = group.reduce((best, l) =>
        l.pricing.integrationSellTotal > best.pricing.integrationSellTotal
        || (l.pricing.integrationSellTotal === best.pricing.integrationSellTotal && l.integrationTier > best.integrationTier)
          ? l : best
      )
      return {
        platform,
        vehicleIds: group.map(l => l.vehicleId),
        billedVehicleId: billed.vehicleId,
        amount: billed.pricing.integrationSellTotal,
      }
    }
  )
  const integrationTotal = integrationByPlatform.reduce((s, g) => s + g.amount, 0)

  const selected = new Set(selectedAdderIds)
  const addersTotal = adders.adders
    .filter(a => selected.has(a.id))
    .reduce((sum, a) => sum + a.amount, 0)

  const sellTotal = hardwareTotal + integrationTotal + softwareTotal + addersTotal
  const sellPerUnit = totalQty > 0 ? sellTotal / totalQty : 0

  const { low, high } = assumptions.romBand
  const { highPctPerUnknown, maxHighPct } = assumptions.unknownInputPenalty
  // One-sided: unknowns push the ceiling up, never the floor down.
  const bandHighPct = Math.min(high + unknownInputCount * highPctPerUnknown, maxHighPct)
  const rounding = assumptions.rounding
  const lowTotal = totalQty > 0 ? roundTo(sellTotal * (1 + low), rounding) : 0
  const highTotal = totalQty > 0 ? roundTo(sellTotal * (1 + bandHighPct), rounding) : 0
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
    integrationByPlatform,
    bandHighPct,
    unknownInputCount,
  }
}
