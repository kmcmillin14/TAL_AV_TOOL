// Shared project → fleet/ROM computation for the exporters (PPTX/XLSX) — the
// same derivation chain useFleetData runs in React, as one pure call.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import { DEFAULT_TARGET_UTILIZATION, type FleetSettings, type Flow, type FlowDerived, type FleetSummary } from '../calc/types'
import { defaultChargeRegime, fleetFromFlows } from '../calc/fleet'
import { romPricing, romOpex, romPayback, type RomPricing, type RomSummary, type RomCostInputs } from '../calc/rom'
import { defaultOperatingDaysPerYear, consecutiveOperatingDays } from '../calc/romAnalytics'
import { resolveAllRomSellPriceLines, resolveFleetSellPriceTotal } from './romSellPriceLine'
import { pricingGate, type PricingGate } from './romComplexityFromProject'

export interface FleetModel {
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  settings: FleetSettings
  fleet: FleetSummary
  rom: RomSummary
  costs: RomCostInputs
  /** Whether the intake supports quoting. Carried on the model so EVERY
   *  consumer inherits it — the dashboard, the PPTX deck and the XLSX all
   *  derive from computeFleetModel, and a surface that forgets to check would
   *  print a price the app is withholding everywhere else. */
  gate: PricingGate
}

/**
 * The project's Fleet Engine settings — the one construction Sizing, Step 4, the Dashboard and the
 * exporters share. An unset charge regime derives from shift coverage (24 h/day → continuous); the
 * engine toggle writes the explicit choice, which always wins. A simulated fleet applied to pricing
 * (Fleet Simulation D-1) rides along as `appliedFleet`.
 */
export function projectFleetSettings(project: Pick<StoredProject, 'shiftsPerDay' | 'hoursPerShift' | 'chargeRegime' | 'targetUtilization' | 'chargeMethods' | 'simSettings'>): FleetSettings {
  const dailyOpHr = Math.min(24, (project.shiftsPerDay ?? 1) * (project.hoursPerShift ?? 8))
  const applied = project.simSettings?.appliedFleet
  return {
    regime: project.chargeRegime ?? defaultChargeRegime(dailyOpHr),
    targetUtilization: project.targetUtilization ?? DEFAULT_TARGET_UTILIZATION,
    dailyOpHr,
    chargeMethods: project.chargeMethods ?? {},
    ...(applied && Object.keys(applied).length ? { appliedFleet: Object.fromEntries(Object.entries(applied).map(([v, a]) => [v, a.fleet])) } : {}),
  }
}

export function computeFleetModel(project: StoredProject, vehicles: Vehicle[]): FleetModel {
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const flows = project.flows ?? []

  const settings = projectFleetSettings(project)
  const { derivedByFlowId, fleet } = fleetFromFlows(flows, vehicleById, settings)

  const costs: RomCostInputs = {
    numberOfOperators: project.numberOfOperators
      ?? ((project.operatorsPerShift ?? 0) * (project.shiftsPerDay ?? 1)),
    fullyBurdenedRateUsdPerYear: project.fullyBurdenedRateUsdPerYear ?? 65000,
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

  const opex = romOpex(costs, pricing.totalMid)
  const payback = romPayback(costs, pricing.totalMid)
  const rom: RomSummary = { pricing, opex, payback }

  return { flows, derivedByFlowId, settings, fleet, rom, costs, gate: pricingGate(project) }
}
