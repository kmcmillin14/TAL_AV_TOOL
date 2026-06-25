import type { StoredProject } from './storage'
import type { ApplicationRequirements, LoadSpec } from '../calc/types'

/** Declared loads mapped to the calc engine's LoadSpec shape. Empty when the
 *  project predates the loads model — the legacy singular fields then flow
 *  through ApplicationRequirements and qualifyVehicle synthesizes one load,
 *  keeping single-load behavior identical (no write migration needed). */
export function effectiveLoads(p: StoredProject): LoadSpec[] {
  if (!p.loads?.length) return []
  return p.loads.map(l => ({
    loadId: l.id,
    unitType: l.unitType ?? '',
    lengthIn: l.lengthIn,
    widthIn: l.widthIn,
    heightIn: l.heightIn,
    weightLbs: l.weightLbs,
  }))
}

/** Map a stored project into the calc engine's ApplicationRequirements shape. */
export function appRequirementsFromProject(p: StoredProject): ApplicationRequirements {
  return {
    loads: effectiveLoads(p),
    maxLoadWeightLbs: p.maxLoadWeightLbs ?? 0,
    typicalUnitType: p.typicalUnitType ?? '',
    transferMethod: p.transferMethod ?? '',
    deliveryPattern: p.deliveryPattern ?? '',
    liftTypeNeeded: p.liftTypeNeeded ?? null,
    maxLiftHeightFt: p.maxLiftHeightFt,
    pickHeightFt: p.pickHeightFt,
    dropHeightFt: p.dropHeightFt,
    minAisleWidthFt: p.minAisleWidthFt ?? 0,
    certifications: Array.isArray(p.certifications) ? p.certifications : [],
    tempMinF: p.tempMinF,
    tempMaxF: p.tempMaxF,
    rampRequired: p.rampRequired,
    maxRampGrade: p.maxRampGrade ?? 0,
    outdoorRequired: p.outdoorRequired ?? false,
    freezerCapable: p.freezerCapable ?? false,
    temperatureEnvironment: p.temperatureEnvironment,
    loadLengthIn: p.loadLengthIn,
    loadWidthIn: p.loadWidthIn,
    loadHeightIn: p.loadHeightIn,
  }
}
