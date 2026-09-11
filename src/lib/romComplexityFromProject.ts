// src/lib/romComplexityFromProject.ts — maps a StoredProject to ComplexityAnswers
// (src/calc/complexityInputs.ts). Lives in src/lib/ (reads app-level
// StoredProject shape; src/calc/* stays generic and doesn't know about the
// project schema).
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

/** Every project field that feeds a complexity point table AND whose
 *  "unanswered" state is actually detectable, with the label Step 4 shows.
 *
 *  Deliberately EXCLUDES the array-valued inputs that also drive points —
 *  `sharedTrafficTypes` (pedestrian/forklift/other-AGV), `interlocks` (PLC)
 *  and `unitLoadTypes` (custom load). Each defaults to `[]`, so an empty
 *  array is genuinely ambiguous: it means either "answered: none apply" or
 *  "never asked", and the schema can't tell them apart. Counting them would
 *  report confident projects as incomplete, so they're left out rather than
 *  guessed at. */
const PRICING_INPUTS: Array<{ label: string; unanswered: (p: StoredProject) => boolean }> = [
  { label: 'WMS integration', unanswered: p => p.wmsRequired === undefined },
  { label: 'Storage tracking', unanswered: p => p.storageTrackingRequired === undefined },
  { label: 'Barcode scanning', unanswered: p => p.barcodeScanningRequired === undefined },
  { label: 'Ramps', unanswered: p => p.rampRequired === undefined },
  { label: 'AGV/AMR experience', unanswered: p => p.hasAgvExperience === undefined },
  { label: 'Facility size', unanswered: p => p.facilitySizeSqFt === undefined || p.facilitySizeSqFt === null },
  { label: 'Pick/drop locations', unanswered: p => p.pickDropLocationCount === undefined || p.pickDropLocationCount === null },
]

export interface PricingInputConfidence {
  answered: number
  total: number
  /** Display labels of the still-unanswered inputs, in PRICING_INPUTS order. */
  missing: string[]
}

/** How much of the pricing-relevant intake is actually filled in.
 *
 *  Drives the budgetary band: an unanswered input scores zero complexity
 *  points, which is indistinguishable from "this site is simple", so a thin
 *  intake would otherwise quote like the easiest possible project. Rather
 *  than make fields required (no required fields to advance —
 *  `ARCHITECTURE.md`), Step 4 widens the high side of the range once per
 *  unknown and shows what's missing. See `unknownInputPenalty` in
 *  content/pricing/global-assumptions.json. */
export function pricingInputConfidence(project: StoredProject): PricingInputConfidence {
  const missing = PRICING_INPUTS.filter(f => f.unanswered(project)).map(f => f.label)
  return { answered: PRICING_INPUTS.length - missing.length, total: PRICING_INPUTS.length, missing }
}
