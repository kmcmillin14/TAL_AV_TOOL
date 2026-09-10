// src/lib/romComplexityFromProject.ts — maps a StoredProject to ComplexityAnswers
// (src/calc/complexityInputs.ts). Lives in src/lib/ (reads app-level
// StoredProject shape; src/calc/* stays generic and doesn't know about the
// project schema).
import type { StoredProject } from '@/src/lib/storage'
import { GAP_FIELDS, type ComplexityAnswers } from '@/src/calc/complexityInputs'

export function complexityAnswersFromProject(project: StoredProject): ComplexityAnswers {
  const trafficType: ComplexityAnswers['trafficType'] = []
  const shared = project.sharedTrafficTypes ?? []
  if (shared.includes('Pedestrians')) trafficType.push('pedestrian')
  if (shared.includes('Manual forklifts')) trafficType.push('forklift')
  if (shared.includes('Other AGVs')) trafficType.push('otherAgv')

  const answers: ComplexityAnswers = {
    wmsIntegrationRequired: project.wmsRequired ?? false,
    storageTrackingRequired: project.storageTrackingRequired ?? false,
    barcodeScanningRequired: project.barcodeScanningRequired ?? false,
    hasPlcInterlock: (project.interlocks ?? []).includes('PLC Systems'),
    trafficType,
    ramps: project.rampRequired ?? false,
    customLoad: (project.unitLoadTypes ?? []).includes('Other'),
    hasAgvExperience: project.hasAgvExperience ?? false,
    facilitySqFt: project.facilitySizeSqFt ?? 0,
    pickDropLocationCount: project.pickDropLocationCount ?? 0,
  }

  return answers
}

/** Which of the three GAP_FIELDS (2026-09-09 design: no schema field at the
 *  time) are still unanswered on THIS project — i.e. genuinely `undefined`
 *  in storage, not merely defaulted for scoring. (2026-09-10: all three now
 *  have real, optional intake-form fields — §09 Integration,
 *  ApplicationForm.tsx — so this set shrinks as an engineer answers them and
 *  is empty once all three are answered.) Drives the "complexity may be
 *  understated" flag; answering these NEVER blocks navigation — no required
 *  fields to advance (ARCHITECTURE.md) — it only removes the flag. */
export function unresolvedComplexityGaps(project: StoredProject): Array<keyof ComplexityAnswers> {
  return GAP_FIELDS.filter(key => {
    if (key === 'storageTrackingRequired') return project.storageTrackingRequired === undefined
    if (key === 'hasAgvExperience') return project.hasAgvExperience === undefined
    if (key === 'pickDropLocationCount') return project.pickDropLocationCount === undefined || project.pickDropLocationCount === null
    return true
  })
}
