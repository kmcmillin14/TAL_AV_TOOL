// src/calc/rom.ts — ROM economics: CAPEX range, annual OPEX, simple payback. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only Vehicle import, as in fleet.ts.)
import type { FleetSummary } from './types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface RomCostInputs {
  laborRateUsdPerHr: number
  energyCostUsdPerKwh: number
  annualMaintenancePctOfCapex: number   // 0..1
  operatingDaysPerYear: number
}

export interface RomSchedule {
  dailyOpHr: number
  operatorsPerShift: number
  shiftsPerDay: number
  hoursPerShift: number
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
    const unitMin = veh?.priceRange?.minUsd ?? 0
    const unitMax = veh?.priceRange?.maxUsd ?? 0
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
