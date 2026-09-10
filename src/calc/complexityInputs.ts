// src/calc/complexityInputs.ts — maps questionnaire/project answers into the
// trigger dictionaries scoreTier() consumes for the Integration and Software
// complexity axes. PURE. No React, no fetch, no localStorage, no fs.
//
// Field-mapping note (2026-09-09 compatibility review — see docs/CHANGELOG.md):
// Two point-table keys from the original design were dropped by explicit owner
// decision, not by silent default: per-door/per-elevator counting ("no doors")
// and multi-site scoring ("no site count") — neither `doorCount`/`elevatorCount`
// nor `siteCount` exist anywhere in the questionnaire/project schema, and the
// owner confirmed not to add them.
//
// `storageTrackingRequired`, `hasAgvExperience`, and `pickDropLocationCount`
// were originally undefined for every project (no schema field at all); as of
// 2026-09-10 they are real, optional intake-form fields (§09 Integration,
// ApplicationForm.tsx) — GAP_FIELDS now names fields that MAY be unanswered on
// a given project rather than fields that always are. Callers MUST still
// default these to `false`/`0` here (never omit — this module always needs a
// concrete value to score), but should use
// src/lib/romComplexityFromProject.ts's `unresolvedComplexityGaps(project)` to
// know which ones are still genuinely unanswered and surface the "complexity
// may be understated" flag only for those — never silently under-score, and
// never block navigation to get an answer (ARCHITECTURE.md: no required
// fields to advance).

/** Answers this module reads directly. Every field maps to a real
 *  `projectSchema` key, including the three GAP_FIELDS (optional on the
 *  schema — see the note above) — the caller must supply a conservative
 *  default (false/0) when unanswered and is responsible for surfacing the
 *  understatement flag via `unresolvedComplexityGaps`. */
export interface ComplexityAnswers {
  /** ← project.wmsRequired */
  wmsIntegrationRequired: boolean
  /** ← project.storageTrackingRequired. May be unanswered — see GAP_FIELDS. */
  storageTrackingRequired: boolean
  /** ← project.barcodeScanningRequired */
  barcodeScanningRequired: boolean
  /** ← project.interlocks.includes('PLC Systems') — the closest real signal to
   *  "automation interface"; there is no separate automation-interface count field. */
  hasPlcInterlock: boolean
  /** ← project.sharedTrafficTypes, split into the three values the point tables use. */
  trafficType: Array<'pedestrian' | 'forklift' | 'otherAgv'>
  /** ← project.rampRequired */
  ramps: boolean
  /** ← project.unitLoadTypes.includes('Other') — best-effort proxy for "non-standard
   *  load"; there is no literal customLoad boolean in the schema. */
  customLoad: boolean
  /** ← project.hasAgvExperience. May be unanswered — see GAP_FIELDS. */
  hasAgvExperience: boolean
  /** ← project.facilitySizeSqFt ?? 0 */
  facilitySqFt: number
  /** ← project.pickDropLocationCount. May be unanswered — see GAP_FIELDS. */
  pickDropLocationCount: number
}

/** Keys of {@link ComplexityAnswers} that have optional, sometimes-unanswered
 *  project schema fields — use `unresolvedComplexityGaps(project)`
 *  (src/lib/romComplexityFromProject.ts) to get the subset actually unanswered
 *  on a given project. Per the owner's "do not silently understate
 *  complexity" instruction, surface unanswered ones in the UI/PPTX wherever a
 *  ComplexityBreakdown is shown. */
export const GAP_FIELDS: Array<keyof ComplexityAnswers> = [
  'storageTrackingRequired',
  'hasAgvExperience',
  'pickDropLocationCount',
]

/** Picks the single highest band whose minimum the value meets — bands must be
 *  given highest-minimum-first. Empty result when the value meets no band's
 *  minimum (e.g. below the lowest tier). */
function band(value: number, bandsHighestFirst: Array<[min: number, key: string]>): Record<string, boolean> {
  const hit = bandsHighestFirst.find(([min]) => value >= min)
  return hit ? { [hit[1]]: true } : {}
}

const fleetBand = (qty: number) => band(qty, [
  [21, 'fleetBand21plus'], [11, 'fleetBand11to20'], [6, 'fleetBand6to10'],
])
const sqftBand = (sqft: number) => band(sqft, [
  [500_000, 'sqftBand500kPlus'], [250_000, 'sqftBand250kTo500k'], [100_000, 'sqftBand100kTo250k'],
])
const pickDropBand = (count: number) => band(count, [
  [50, 'pickDropBand50plus'], [25, 'pickDropBand25to50'], [10, 'pickDropBand10to25'],
])

/** Integration-tier triggers: facility/job-complexity drivers (physical work of
 *  standing up the install), scored against `assumptions.integrationScoring`.
 *  `totalFleetSize` is the WHOLE program's fleet size across every vehicle
 *  type/chassis (FleetSummary.totalFleetSold) — a multi-chassis 15-unit
 *  deployment is one big, complex install regardless of how thin any single
 *  chassis's own line is (2026-09-09 fix: previously scored per-line qty,
 *  which meant a 4+6+5 split across 3 chassis never crossed any fleet-size
 *  band). Not the per-line vehicle qty used elsewhere for pricing. */
export function buildIntegrationTriggers(
  answers: ComplexityAnswers,
  totalFleetSize: number
): Record<string, boolean> {
  return {
    trafficPedestrian: answers.trafficType.includes('pedestrian'),
    trafficForklift: answers.trafficType.includes('forklift'),
    ramps: answers.ramps,
    customLoad: answers.customLoad,
    noAgvExperience: !answers.hasAgvExperience,
    ...fleetBand(totalFleetSize),
    ...sqftBand(answers.facilitySqFt),
    ...pickDropBand(answers.pickDropLocationCount),
  }
}

/** Software-tier triggers: software-layer drivers only (WMS/tracking/scanning/
 *  fleet-traffic/automation-interface), scored against `assumptions.softwareScoring`.
 *  WMS integration is intentionally software-only — see the note on
 *  `wmsIntegrationRequired` usage in the ROM design: if standing up the host
 *  interface should ALSO cost integration-tier points, that is an explicit
 *  decision for the owner, not an assumption made here. */
export function buildSoftwareTriggers(
  answers: ComplexityAnswers
): Record<string, boolean> {
  return {
    wmsIntegration: answers.wmsIntegrationRequired,
    storageTracking: answers.storageTrackingRequired,
    barcodeScanning: answers.barcodeScanningRequired,
    otherAgvTraffic: answers.trafficType.includes('otherAgv'),
    automationInterface: answers.hasPlcInterlock,
  }
}
