import type { ProjectFormData } from '@/src/lib/validations/schemas'

// All 12 sections of the Step 1 intake form, grouped into three tiers
// (qualification → sizing → proposal). The order here is the order they
// render on the page and in the SectionNav. `requiredFields` mirrors the visible
// red asterisks ONE FOR ONE — that is the contract. When they drifted apart
// (2026-10-03 audit) section 03 showed six asterisks but listed one required
// field, so it reported COMPLETE with five of them blank. Add a marker in the
// form, add the field here.

export type SectionTier = 'qualification' | 'sizing' | 'proposal'

export const TIER_LABELS: Record<SectionTier, string> = {
  qualification: 'Vehicle Qualification',
  sizing: 'Fleet Sizing & Economics',
  proposal: 'Proposal Details',
}

export interface SectionMeta {
  id: string                                // anchor id (e.g. 'section-01')
  num: string                               // display number ('01')
  label: string                             // full label
  short: string                             // short label for nav
  tier: SectionTier
  requiredFields: Array<keyof ProjectFormData>
  /** Section starts collapsed in the form. */
  startCollapsed?: boolean
  /** Fields here are captured for the proposal but aren't matched in any Step 2
   *  qualification check or downstream calc yet (see roadmap MX1). */
  notMatched?: boolean
}

export const FORM_SECTIONS: ReadonlyArray<SectionMeta> = [
  // ── Tier 1 — VEHICLE QUALIFICATION ──────────────────────────────────────
  { id: 'section-01', num: '01', label: 'What are you moving?', short: 'Load',
    tier: 'qualification', requiredFields: ['maxLoadWeightLbs', 'typicalUnitType', 'palletEntryType', 'palletStacking'] },
  { id: 'section-02', num: '02', label: 'How is it transferred?', short: 'Transfer',
    tier: 'qualification', requiredFields: ['transferType', 'pickDropLocationCount'] },
  // 'Environment & site' and the old Tier-2 'Site details' were one subject split
  // across two sections half the form apart — aisle width and temperature here,
  // floor condition and facility size six sections later. Merged 2026-09-14 to
  // mirror the customer questionnaire's 'General Site Info', so an engineer
  // transcribing a returned questionnaire answers one section, not two.
  { id: 'section-03', num: '03', label: 'General Site Info', short: 'Site',
    tier: 'qualification', requiredFields: ['minAisleWidthFt', 'outdoorRequired', 'temperatureEnvironment', 'rampRequired', 'facilitySizeSqFt', 'sharedTrafficTypes'] },
  { id: 'section-04', num: '04', label: 'Certifications', short: 'Certs',
    tier: 'qualification', requiredFields: [] },
  // ── Tier 2 — FLEET SIZING & ECONOMICS ───────────────────────────────────
  { id: 'section-05', num: '05', label: 'Operating schedule', short: 'Schedule',
    tier: 'sizing', requiredFields: ['shiftsPerDay', 'hoursPerShift', 'operatingDaysPattern'] },
  // section-06 is the flow-row list (shared with Step 3); its badge derives from
  // the flows array via the special case in sectionStatus, not requiredFields.
  { id: 'section-06', num: '06', label: 'Throughput & distance', short: 'Throughput',
    tier: 'sizing', requiredFields: [] },
  { id: 'section-07', num: '07', label: 'Labor', short: 'Labor',
    tier: 'sizing', requiredFields: [] },
  // The old single 'Integration' section was Tier 3 ("proposal only", collapsed,
  // badged "not matched in any downstream calc") until 2026-09-11 — which became
  // flatly untrue once the ROM pricing engine started scoring it. It holds some
  // of the biggest pricing drivers in the app: wmsRequired (+5),
  // storageTrackingRequired (+3), interlocks/PLC (+3), hasAgvExperience (+2),
  // barcodeScanningRequired (+2). Anything that moves a gate or a price is
  // Tier 1/2 and starts EXPANDED — an input that changes the quote must never be
  // hidden behind a disclosure.
  //
  // Split in two 2026-09-14 to mirror the questionnaire: what the fleet must
  // physically wait on / talk to, vs. what it must integrate with in software.
  { id: 'section-08', num: '08', label: 'Automation interlocks', short: 'Interlocks',
    tier: 'sizing', requiredFields: ['interlocks'] },
  { id: 'section-09', num: '09', label: 'Software & integration', short: 'Software',
    tier: 'sizing', requiredFields: ['wmsRequired', 'barcodeScanningRequired', 'storageTrackingRequired', 'hasAgvExperience'] },
  // ── Tier 3 — PROPOSAL DETAILS (no gate or price depends on these) ──
  // Expanded like everything else (2026-09-11): no section on Step 1 starts
  // collapsed. An engineer should be able to read the whole intake top to
  // bottom without hunting for a disclosure triangle.
  { id: 'section-10', num: '10', label: 'Dealer & contact', short: 'Dealer',
    tier: 'proposal', requiredFields: [] },
  { id: 'section-11', num: '11', label: 'Timeline', short: 'Timeline',
    tier: 'proposal', requiredFields: [] },
  { id: 'section-12', num: '12', label: 'Project notes', short: 'Notes',
    tier: 'proposal', requiredFields: [] },
] as const

/** 'partial' replaced 'in-progress' (2026-10-03): a section with ANY required
 *  field unanswered is partial, never complete. Previously section 03 reported
 *  COMPLETE on one of six marked fields, because requiredFields listed only the
 *  one that drives a hard gate while the form showed six asterisks. */
export type SectionStatus = 'complete' | 'partial' | 'untouched' | 'optional'

/** Whether a field has an answer.
 *
 *  `false` counts: these are tri-state booleans where undefined means "never
 *  asked" and `false` is a deliberate "No" (no ramps, no WMS, indoor). Treating
 *  `false` as blank would leave sections 03 and 09 permanently short of
 *  complete no matter what the engineer answered.
 *
 *  Numbers still need to be > 0 — 0 is the app-wide unset sentinel for weights,
 *  counts and sizes. The two fields where 0 is a real answer (pickHeightFt /
 *  dropHeightFt, floor-to-floor) are deliberately not in any requiredFields
 *  list, because unset and "floor" are indistinguishable there. */
function isFilled(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

/**
 * A section's status from current form values.
 *
 * 'optional' means the section genuinely marks nothing required — not that its
 * required fields happen to be blank. Anything short of every required field
 * answered is 'partial'; only all of them earns 'complete'.
 */
export function sectionStatus(meta: SectionMeta, values: Partial<ProjectFormData>): SectionStatus {
  // section-06 is the flow-row list — complete once any flow has both a
  // distance and a throughput (keyof-based requiredFields can't express this).
  if (meta.id === 'section-06') {
    const flows = values.flows ?? []
    if (flows.some(f => (f.distanceFt ?? 0) > 0 && (f.thruPerHr ?? 0) > 0)) return 'complete'
    if (flows.length > 0) return 'partial'
    return 'untouched'
  }
  if (meta.requiredFields.length === 0) return 'optional'
  const filled = meta.requiredFields.filter(f => isFilled(values[f])).length
  if (filled === meta.requiredFields.length) return 'complete'
  return filled === 0 ? 'untouched' : 'partial'
}

// ── Qualification readiness meter ────────────────────────────────────────────
// Counts the gate-engine inputs (src/calc/gates.ts) that have an answer.
// Excluded by design: outdoorRequired/freezerCapable (unchecked is an answer,
// not a gap), certifications (optional soft gate), and pick/drop heights
// (floor-to-floor — both 0 — is a valid, common answer, not a gap).

// tempMinF/tempMaxF left the list 2026-07-11: the numeric temperature gates were
// retired — Temperature Environment (Ambient/Refrigerated/Freezer) is the single
// temperature qualifier, and the numeric temps are informational only.
const QUALIFICATION_INPUTS: ReadonlyArray<keyof ProjectFormData> = [
  'maxLoadWeightLbs', 'typicalUnitType',
  'loadLengthIn', 'loadWidthIn', 'loadHeightIn',
  'transferType',
  'maxRampGrade', 'minAisleWidthFt',
]

// Unlike isFilled (badge semantics, number > 0), negative numbers are real
// answers here. 0 stays the app-wide "unset" sentinel, matching the gate engine.
function isAnswered(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return false
}

export function qualificationInputsTotal(_values: Partial<ProjectFormData>): number {
  return QUALIFICATION_INPUTS.length
}

export function qualificationInputsFilled(values: Partial<ProjectFormData>): number {
  return QUALIFICATION_INPUTS.filter(f => isAnswered(values[f])).length
}
