// src/calc/complexityInputs.ts — maps questionnaire/project answers into the
// trigger dictionaries scoreTier() consumes for the Integration and Software
// complexity axes. PURE. No React, no fetch, no localStorage, no fs.
//
// Field-mapping note (2026-09-09 compatibility review — see docs/CHANGELOG.md):
// Two point-table keys from the original design were dropped by explicit owner
// decision, not by silent default: per-door/per-elevator counting ("no doors")
// and multi-site scoring ("no site count") — neither `doorCount`/`elevatorCount`
// nor `siteCount` exist anywhere in the questionnaire/project schema, and the
// owner confirmed not to add them. `storageTrackingRequired`, `hasAgvExperience`,
// and `pickDropLocationCount` remain real gaps (no schema field yet) — callers
// MUST default these to `false`/`0` (never omit) and surface a visible
// "complexity may be understated — not yet collected" flag per GAP_FIELDS below,
// rather than silently under-scoring.

/** Answers this module reads directly. Every field maps to a real
 *  `projectSchema` key except the three GAP_FIELDS, which have no schema field
 *  today — the caller must supply a conservative default (false/0) and is
 *  responsible for surfacing the understatement flag. */
export interface ComplexityAnswers {
  /** ← project.wmsRequired */
  wmsIntegrationRequired: boolean
  /** GAP — no schema field. Caller defaults to false. */
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
  /** GAP — no schema field ("AGV experience" is not collected). Caller defaults to false. */
  hasAgvExperience: boolean
  /** ← project.facilitySizeSqFt ?? 0 */
  facilitySqFt: number
  /** GAP — no schema field (pick/drop location count is not collected). Caller defaults to 0. */
  pickDropLocationCount: number
}

/** Keys of {@link ComplexityAnswers} that have no source field in the project
 *  schema today. Surface these in the UI/PPTX wherever a ComplexityBreakdown is
 *  shown, per the owner's "do not silently understate complexity" instruction. */
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
