// Shared project → fleet/ROM computation for the exporters (PPTX/XLSX) — the
// same derivation chain useFleetData runs in React, as one pure call.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import type { FleetSettings, Flow, FlowDerived, FleetSummary } from '../calc/types'
import { flowDerived, groupSummary } from '../calc/flowMetrics'
import { fleetSummary, defaultChargeRegime } from '../calc/fleet'
import { romSummary, type RomSummary, type RomCostInputs } from '../calc/rom'
import { defaultOperatingDaysPerYear } from '../calc/romAnalytics'

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
  const settings: FleetSettings = {
    regime: project.chargeRegime ?? defaultChargeRegime(dailyOpHr),
    bufferPct: project.bufferPct ?? 0.10,
    dailyOpHr,
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
