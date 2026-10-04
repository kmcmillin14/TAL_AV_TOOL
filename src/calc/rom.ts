// src/calc/rom.ts — ROM economics: CAPEX range, annual OPEX, simple payback. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only Vehicle import, as in fleet.ts.)
import type { FleetSummary } from './types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface RomCostInputs {
  numberOfOperators: number              // operators the fleet displaces
  fullyBurdenedRateUsdPerYear: number    // loaded annual cost per operator
  annualMaintenancePctOfCapex: number   // 0..1
  operatingDaysPerYear: number
}

export interface RomPricingLine {
  vehicleId: string
  fleetSold: number
  unitMin: number
  unitMax: number
  lineMin: number
  lineMax: number
}

export interface RomPricing {
  lines: RomPricingLine[]
  totalMin: number
  totalMax: number
  totalMid: number            // (min+max)/2 — for downstream math only, never shown as "the price"
}

/** Per-vehicle CAPEX range = fleetSold × priceRange. Missing vehicle/price → 0. */
export function romPricing(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): RomPricing {
  const lines: RomPricingLine[] = fleet.groups.map(g => {
    const veh = vehiclesById.get(g.vehicleId)
    const unitMin = veh?.calc.priceRange?.minUsd ?? 0
    const unitMax = veh?.calc.priceRange?.maxUsd ?? 0
    return {
      vehicleId: g.vehicleId,
      fleetSold: g.fleetSold,
      unitMin, unitMax,
      lineMin: unitMin * g.fleetSold,
      lineMax: unitMax * g.fleetSold,
    }
  })
  const totalMin = lines.reduce((s, l) => s + l.lineMin, 0)
  const totalMax = lines.reduce((s, l) => s + l.lineMax, 0)
  return { lines, totalMin, totalMax, totalMid: (totalMin + totalMax) / 2 }
}

export interface RomOpex {
  annualMaintenance: number
  annualOpex: number
}

/** Annual OPEX = maintenance (% of CAPEX mid).
 *
 *  Energy was removed from this model 2026-10-04 (owner decision). It had been
 *  an operating-draw estimate — kW = voltageV × ratedAh × DOD / 1000 / runTimeHr,
 *  annualized over op-hours × days × fleet, priced at a blended $/kWh — and
 *  every term in it was unverified: the kW came from cutsheet nameplate battery
 *  figures standing in for real duty-cycle draw (the M10's implied 0.09 kW is
 *  not physical), and the $/kWh was a flat default nobody entered. It moved
 *  OPEX, net benefit, TCO and cost/move on numbers we could not defend, so it
 *  is gone rather than shown. Charging/availability sizing is unaffected: that
 *  model is hours-based (runTimeHr + chargeTimeMin) and never read kWh. */
export function romOpex(
  costs: RomCostInputs,
  capexMid: number,
): RomOpex {
  const annualMaintenance = capexMid * costs.annualMaintenancePctOfCapex
  return { annualMaintenance, annualOpex: annualMaintenance }
}

export interface RomPayback {
  annualLaborOffset: number
  paybackYears: number | null   // null when there is no labor offset
}

/** Simple ROI (user-confirmed model): payback = total system cost ÷ annual
 *  labor offset (operators displaced × fully-burdened cost each). OPEX stays
 *  informational — it is NOT netted against the offset. */
export function romPayback(
  costs: RomCostInputs,
  capexMid: number,
): RomPayback {
  const annualLaborOffset = costs.numberOfOperators * costs.fullyBurdenedRateUsdPerYear
  const paybackYears = annualLaborOffset > 0 ? capexMid / annualLaborOffset : null
  return { annualLaborOffset, paybackYears }
}

export interface RomSummary {
  pricing: RomPricing
  opex: RomOpex
  payback: RomPayback
}

/** One call for the dashboard: pricing → opex (uses CAPEX mid) → payback. */
export function romSummary(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  costs: RomCostInputs,
): RomSummary {
  const pricing = romPricing(fleet, vehiclesById)
  const opex = romOpex(costs, pricing.totalMid)
  const payback = romPayback(costs, pricing.totalMid)
  return { pricing, opex, payback }
}
