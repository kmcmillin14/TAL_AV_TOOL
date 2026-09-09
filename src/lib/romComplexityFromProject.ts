// src/lib/romComplexityFromProject.ts — maps a StoredProject to ComplexityAnswers
// (src/calc/complexityInputs.ts). Lives in src/lib/ (reads app-level
// StoredProject shape; src/calc/* stays generic and doesn't know about the
// project schema). The "which fields are gap defaults" flag doesn't vary per
// project — callers import GAP_FIELDS directly from complexityInputs.ts.
import type { StoredProject } from '@/src/lib/storage'
import type { ComplexityAnswers } from '@/src/calc/complexityInputs'

export function complexityAnswersFromProject(project: StoredProject): ComplexityAnswers {
  const trafficType: ComplexityAnswers['trafficType'] = []
  const shared = project.sharedTrafficTypes ?? []
  if (shared.includes('Pedestrians')) trafficType.push('pedestrian')
  if (shared.includes('Manual forklifts')) trafficType.push('forklift')
  if (shared.includes('Other AGVs')) trafficType.push('otherAgv')

  const answers: ComplexityAnswers = {
    wmsIntegrationRequired: project.wmsRequired ?? false,
    storageTrackingRequired: false, // GAP — see GAP_FIELDS
    barcodeScanningRequired: project.barcodeScanningRequired ?? false,
    hasPlcInterlock: (project.interlocks ?? []).includes('PLC Systems'),
    trafficType,
    ramps: project.rampRequired ?? false,
    customLoad: (project.unitLoadTypes ?? []).includes('Other'),
    hasAgvExperience: false, // GAP — see GAP_FIELDS
    facilitySqFt: project.facilitySizeSqFt ?? 0,
    pickDropLocationCount: 0, // GAP — see GAP_FIELDS
  }

  return answers
}
