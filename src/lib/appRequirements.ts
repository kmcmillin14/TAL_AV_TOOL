import type { StoredProject } from './storage'
import type { ApplicationRequirements } from '../calc/types'

/** Map a stored project into the calc engine's ApplicationRequirements shape. */
export function appRequirementsFromProject(p: StoredProject): ApplicationRequirements {
  return {
    maxLoadWeightLbs: p.maxLoadWeightLbs ?? 0,
    typicalUnitType: p.typicalUnitType ?? '',
    transferMethod: p.transferMethod ?? '',
    deliveryPattern: p.deliveryPattern ?? '',
    maxLiftHeightFt: p.maxLiftHeightFt,
    minAisleWidthFt: p.minAisleWidthFt ?? 0,
    certifications: Array.isArray(p.certifications) ? p.certifications : [],
    tempMinF: p.tempMinF,
    tempMaxF: p.tempMaxF,
    maxRampGrade: p.maxRampGrade ?? 0,
    outdoorRequired: p.outdoorRequired ?? false,
    freezerCapable: p.freezerCapable ?? false,
    loadLengthIn: p.loadLengthIn,
    loadWidthIn: p.loadWidthIn,
    loadHeightIn: p.loadHeightIn,
  }
}
