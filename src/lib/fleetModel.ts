// Shared project → fleet/ROM computation for the exporters (PPTX/XLSX) — the
// same derivation chain useFleetData runs in React, as one pure call.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import { DEFAULT_BUFFER_PCT, type FleetSettings, type Flow, type FlowDerived, type FleetSummary } from '../calc/types'
import { flowDerived, groupSummary } from '../calc/flowMetrics'
import { fleetSummary, defaultChargeRegime } from '../calc/fleet'
import { romPricing, romOpex, romPayback, type RomPricing, type RomSummary, type RomCostInputs } from '../calc/rom'
import { defaultOperatingDaysPerYear, consecutiveOperatingDays } from '../calc/romAnalytics'
import { resolveAllRomSellPriceLines, resolveFleetSellPriceTotal } from './romSellPriceLine'

export interface FleetModel {
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  settings: FleetSettings
  fleet: FleetSummary
  rom: RomSummary
  costs: RomCostInputs
}

export function computeFleetModel(project: StoredProject, vehicles: Vehicle[]): FleetModel {
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const flows = project.flows ?? []

  const derivedByFlowId = new Map<string, FlowDerived>()
  for (const f of flows) {
    const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
    derivedByFlowId.set(f.id, flowDerived(f, veh))
  }

  const ids: string[] = []
  for (const f of flows) if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
  const groups = ids.map(vid => groupSummary(vid, flows, derivedByFlowId))

  const dailyOpHr = Math.min(24, (project.shiftsPerDay ?? 1) * (project.hoursPerShift ?? 8))
  const shiftsPerDay = project.shiftsPerDay ?? 1
  const breakHrs = (project.breaksPerShift ?? 0) * ((project.breakDurationMin ?? 0) / 60) * shiftsPerDay
  const settings: FleetSettings = {
    regime: project.chargeRegime ?? defaultChargeRegime(dailyOpHr),
    bufferPct: project.bufferPct ?? DEFAULT_BUFFER_PCT,
    dailyOpHr,
    breakHrs,
    consecutiveOpDays: consecutiveOperatingDays(project.operatingDaysPattern, project.operatingDaysCustom),
    chargeMethods: project.chargeMethods ?? {},
  }
  const fleet = fleetSummary(groups, vehicleById, settings)

  const costs: RomCostInputs = {
    numberOfOperators: project.numberOfOperators
      ?? ((project.operatorsPerShift ?? 0) * (project.shiftsPerDay ?? 1)),
    fullyBurdenedRateUsdPerYear: project.fullyBurdenedRateUsdPerYear ?? 65000,
    energyCostUsdPerKwh: project.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project.annualMaintenancePctOfCapex ?? 0.08,
    operatingDaysPerYear: project.operatingDaysPerYear
      ?? defaultOperatingDaysPerYear(project.operatingDaysPattern, project.operatingDaysCustom),
  }
  // Full sell-price CAPEX (2026-09-10 — owner correction): the Dashboard's
  // customer-facing ROM CAPEX used to be hardware-only (Σ vehicle price
  // range × qty), silently omitting Integration/Software/Adders that Step
  // 4's internal sell-price engine treats as part of the real total —
  // understating the true sell price. Reuses the SAME resolver Step 4/PPTX
  // call (resolveAllRomSellPriceLines/resolveFleetSellPriceTotal — see
  // src/lib/romSellPriceLine.ts) so the Dashboard can't drift from Step 4;
  // falls back to hardware-only when no assigned vehicle has configured
  // romInputs yet (nothing beyond hardware to price).
  const hardwarePricing = romPricing(fleet, vehicleById)
  const sellLines = resolveAllRomSellPriceLines(project, fleet, vehicleById)
  const sellTotal = resolveFleetSellPriceTotal(project, sellLines)
  const pricing: RomPricing = sellLines.length > 0
    ? {
        lines: hardwarePricing.lines, // still hardware-only per-vehicle-type breakdown rows
        totalMin: sellTotal.band.lowTotal,
        totalMax: sellTotal.band.highTotal,
        totalMid: sellTotal.sellTotal,
      }
    : hardwarePricing

  const opex = romOpex(fleet, vehicleById, costs, { dailyOpHr }, pricing.totalMid)
  const payback = romPayback(costs, pricing.totalMid)
  const rom: RomSummary = { pricing, opex, payback }

  return { flows, derivedByFlowId, settings, fleet, rom, costs }
}
