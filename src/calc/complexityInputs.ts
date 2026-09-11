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
// Unanswered inputs (2026-09-11): most of the fields below map to OPTIONAL
// schema keys, so a partially-filled project leaves some genuinely unanswered.
// This module always needs a concrete value, so callers MUST default those to
// `false`/`0` (never omit) — but note what that means: an unanswered input
// contributes ZERO points, which is indistinguishable from "this site is
// simple". A thin intake therefore scores like the easiest possible project,
// and the error always lands in the under-pricing direction.
//
// Scoring does NOT compensate for that (it can't — it has no way to know the
// difference), and the fields are NOT made required (ARCHITECTURE.md: no
// required fields to advance). Instead the caller is responsible for surfacing
// and pricing the uncertainty: `pricingInputConfidence(project)`
// (src/lib/romComplexityFromProject.ts) reports which inputs are still
// unanswered, and `aggregateFleetSellPrice` widens the HIGH side of the
// budgetary band once per unknown. Never silently under-score.

/** Answers this module reads directly. Every field maps to a real
 *  `projectSchema` key; the optional ones are defaulted to `false`/`0` by the
 *  caller when unanswered — see the unanswered-inputs note above for why that
 *  default is conservative in the wrong direction and how it's compensated. */
export interface ComplexityAnswers {
  /** ← project.wmsRequired */
  wmsIntegrationRequired: boolean
  /** ← project.storageTrackingRequired (optional — may be unanswered). */
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
  /** ← project.hasAgvExperience (optional — may be unanswered). */
  hasAgvExperience: boolean
  /** ← project.facilitySizeSqFt ?? 0 */
  facilitySqFt: number
  /** ← project.pickDropLocationCount (optional — may be unanswered). */
  pickDropLocationCount: number
}

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
