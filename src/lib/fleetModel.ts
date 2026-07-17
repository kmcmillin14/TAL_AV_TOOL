// Shared project → fleet/ROM computation for the exporters (PPTX/XLSX) — the
// same derivation chain useFleetData runs in React, as one pure call.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import { DEFAULT_BUFFER_PCT, type FleetSettings, type Flow, type FlowDerived, type FleetSummary } from '../calc/types'
import { flowDerived, groupSummary } from '../calc/flowMetrics'
import { fleetSummary, defaultChargeRegime } from '../calc/fleet'
import { romSummary, type RomSummary, type RomCostInputs } from '../calc/rom'
import { defaultOperatingDaysPerYear, consecutiveOperatingDays } from '../calc/romAnalytics'

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
      || ((project.operatorsPerShift ?? 0) * (project.shiftsPerDay ?? 1)),
    fullyBurdenedRateUsdPerYear: project.fullyBurdenedRateUsdPerYear ?? 65000,
    energyCostUsdPerKwh: project.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project.annualMaintenancePctOfCapex ?? 0.08,
    operatingDaysPerYear: project.operatingDaysPerYear
      ?? defaultOperatingDaysPerYear(project.operatingDaysPattern, project.operatingDaysCustom),
  }
  const rom = romSummary(fleet, vehicleById, costs, { dailyOpHr })

  return { flows, derivedByFlowId, settings, fleet, rom, costs }
}
