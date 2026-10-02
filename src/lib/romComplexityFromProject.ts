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

// ── Pricing gate ─────────────────────────────────────────────────────────────
// "I would rather not show pricing than show bad pricing" (owner, 2026-10-02).
//
// An unanswered complexity input scores ZERO points, which is indistinguishable
// from "this site is simple" — so a thin intake prices like the easiest
// possible project and the error always lands in the under-quoting direction.
// Widening the band (see `unknownInputPenalty`) softens that but still puts a
// number on screen. Past a point the honest answer is no number at all.
//
// Only the inputs below gate a price. They were picked by how far each one can
// move the score, not by completeness — a blank that cannot realistically
// change the tier should never block a quote:
//
//   professional services        software
//   ─────────────────────        ────────────────────
//   Pick/drop locations  +5      Other-AGV traffic  +6
//   Facility size        +4      WMS integration    +5
//   Shared traffic     +1/+2     Storage tracking   +3
//   AGV/AMR experience   +2      PLC interlock      +3
//   ── 14 of a 22-point scale    ── 17 of a 19-point scale
//
// Deliberately NOT gating: ramps (+1), custom load (+2), barcode scanning (+2).
// Low swing — blocking a quote on them would be noise.
//
// Shared traffic appears on BOTH axes (pedestrian/forklift score integration,
// other-AGV scores software), so that single answer unblocks part of each.
//
// EDIT THIS LIST to change what gates a price — it is the only definition.

export type GateAxis = 'integration' | 'software'

interface GateInput {
  label: string
  axes: GateAxis[]
  unanswered: (p: StoredProject) => boolean
}

const PRICING_GATE_INPUTS: GateInput[] = [
  { label: 'Pick/drop locations', axes: ['integration'],
    unanswered: p => p.pickDropLocationCount == null },
  { label: 'Facility size', axes: ['integration'],
    unanswered: p => p.facilitySizeSqFt == null },
  { label: 'AGV/AMR experience', axes: ['integration'],
    unanswered: p => p.hasAgvExperience === undefined },
  // Empty is genuinely "never asked" for both of these: each list carries an
  // explicit 'None' option, so an answered project is never empty.
  { label: 'Shared traffic in the area', axes: ['integration', 'software'],
    unanswered: p => (p.sharedTrafficTypes ?? []).length === 0 },
  { label: 'WMS integration', axes: ['software'],
    unanswered: p => p.wmsRequired === undefined },
  { label: 'Storage tracking', axes: ['software'],
    unanswered: p => p.storageTrackingRequired === undefined },
  { label: 'Automation interlocks', axes: ['software'],
    unanswered: p => (p.interlocks ?? []).length === 0 },
]

/** Quotation category names, as the gate reports them. Same strings the
 *  quotation renders as category headings, so a surface naming a blocked
 *  category can't drift from the row it refers to. */
const AXIS_LABEL: Record<GateAxis, string> = {
  integration: 'Professional services',
  software: 'Software',
}

export interface PricingGate {
  /** Professional services may be priced. */
  integrationReady: boolean
  /** Software may be priced. */
  softwareReady: boolean
  /** Labels still blocking professional services, in list order. */
  missingIntegration: string[]
  /** Labels still blocking software, in list order. */
  missingSoftware: string[]
  /** Every blocking label once, in list order — what a surface shows when it
   *  isn't distinguishing the two axes. Derived here so the four consumers
   *  don't each hand-roll the same de-duplicated union. */
  missingAll: string[]
  /** Category names currently unpriced, e.g. ['Professional services']. */
  blockedLabels: string[]
  /** Either axis blocked — the project total cannot be stated. */
  blocked: boolean
}

/** Which priced categories have enough intake behind them to quote.
 *
 *  Hardware is never gated: it is qty × price range and touches no complexity
 *  input, so it stays quotable on the thinnest project. */
export function pricingGate(project: StoredProject): PricingGate {
  // One pass: each input's `unanswered` predicate runs exactly once, and the
  // de-duplicated union falls out of the same walk rather than needing a Set.
  const missingIntegration: string[] = []
  const missingSoftware: string[] = []
  const missingAll: string[] = []
  for (const input of PRICING_GATE_INPUTS) {
    if (!input.unanswered(project)) continue
    if (input.axes.includes('integration')) missingIntegration.push(input.label)
    if (input.axes.includes('software')) missingSoftware.push(input.label)
    missingAll.push(input.label)
  }

  const integrationReady = missingIntegration.length === 0
  const softwareReady = missingSoftware.length === 0
  return {
    integrationReady,
    softwareReady,
    missingIntegration,
    missingSoftware,
    missingAll,
    blockedLabels: [
      ...(integrationReady ? [] : [AXIS_LABEL.integration]),
      ...(softwareReady ? [] : [AXIS_LABEL.software]),
    ],
    blocked: !integrationReady || !softwareReady,
  }
}
