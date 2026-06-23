// What-if scenario engine for the ROM dashboard. Pure (no React/IO): apply a set
// of driver overrides onto a project, recompute via the shared computeFleetModel,
// and diff the comparable KPIs against the baseline. Lives in lib/ (not calc/)
// because it orchestrates computeFleetModel + the StoredProject type — but it is a
// pure transformation, unit-testable in isolation.
import type { StoredProject } from './storage'
import type { FleetModel } from './fleetModel'

/** The assumptions a user can override in a what-if scenario. All optional —
 *  an absent (or NaN) key falls through to the project's own value. */
export interface ScenarioDrivers {
  operatorsPerShift?: number
  shiftsPerDay?: number
  energyCostUsdPerKwh?: number
  fullyBurdenedRateUsdPerYear?: number
  annualMaintenancePctOfCapex?: number
  operatingDaysPerYear?: number
  bufferPct?: number
  serviceLifeYears?: number
  numberOfOperators?: number
}

const DRIVER_KEYS: ReadonlyArray<keyof ScenarioDrivers> = [
  'operatorsPerShift', 'shiftsPerDay', 'energyCostUsdPerKwh', 'fullyBurdenedRateUsdPerYear',
  'annualMaintenancePctOfCapex', 'operatingDaysPerYear', 'bufferPct', 'serviceLifeYears',
  'numberOfOperators',
]

/** Apply driver overrides onto a project (non-mutating). Undefined/NaN values are
 *  skipped so they fall through to the project's stored value. */
export function applyDrivers(project: StoredProject, drivers: ScenarioDrivers): StoredProject {
  const out = { ...project } as StoredProject & Record<string, unknown>
  for (const key of DRIVER_KEYS) {
    const v = drivers[key]
    if (v !== undefined && !Number.isNaN(v)) out[key] = v
  }
  // numberOfOperators is derived (operatorsPerShift × shiftsPerDay) in
  // computeFleetModel only when it isn't pinned. If a scenario adjusts operators
  // or shifts but doesn't pin a total, clear any pinned override so the derived
  // value flows through (computeFleetModel uses `||`, so undefined → derived).
  if ((drivers.operatorsPerShift !== undefined || drivers.shiftsPerDay !== undefined)
      && drivers.numberOfOperators === undefined) {
    out.numberOfOperators = undefined
  }
  return out
}

/** The comparable scalar KPIs lifted out of a FleetModel — the surface that
 *  baseline and scenario are diffed on, and that the hero/secondary KPI bands show. */
export interface ScenarioKpis {
  totalFleetSold: number
  vehicleTypes: number
  capexMin: number
  capexMax: number
  capexMid: number
  annualOpex: number
  annualEnergyKwh: number
  annualLaborOffset: number
  /** annual labor offset − annual OPEX */
  netAnnualBenefit: number
  paybackYears: number | null
}

export function scenarioKpis(model: FleetModel): ScenarioKpis {
  const { fleet, rom } = model
  const annualOpex = rom.opex.annualOpex
  const annualLaborOffset = rom.payback.annualLaborOffset
  return {
    totalFleetSold: fleet.totalFleetSold,
    vehicleTypes: fleet.groups.length,
    capexMin: rom.pricing.totalMin,
    capexMax: rom.pricing.totalMax,
    capexMid: rom.pricing.totalMid,
    annualOpex,
    annualEnergyKwh: rom.opex.annualEnergyKwh,
    annualLaborOffset,
    netAnnualBenefit: annualLaborOffset - annualOpex,
    paybackYears: rom.payback.paybackYears,
  }
}

/** Per-KPI delta (scenario − baseline). Payback delta is null whenever either side
 *  has no payback (null), since the difference is undefined. */
export type ScenarioDiff = {
  [K in keyof ScenarioKpis]: ScenarioKpis[K] extends number | null ? number | null : number
}

export function diffKpis(baseline: ScenarioKpis, scenario: ScenarioKpis): ScenarioDiff {
  const payback =
    baseline.paybackYears == null || scenario.paybackYears == null
      ? null
      : scenario.paybackYears - baseline.paybackYears
  return {
    totalFleetSold: scenario.totalFleetSold - baseline.totalFleetSold,
    vehicleTypes: scenario.vehicleTypes - baseline.vehicleTypes,
    capexMin: scenario.capexMin - baseline.capexMin,
    capexMax: scenario.capexMax - baseline.capexMax,
    capexMid: scenario.capexMid - baseline.capexMid,
    annualOpex: scenario.annualOpex - baseline.annualOpex,
    annualEnergyKwh: scenario.annualEnergyKwh - baseline.annualEnergyKwh,
    annualLaborOffset: scenario.annualLaborOffset - baseline.annualLaborOffset,
    netAnnualBenefit: scenario.netAnnualBenefit - baseline.netAnnualBenefit,
    paybackYears: payback,
  }
}
