import type { ProjectFormData } from '@/src/lib/validations/schemas'
import { deliveryPatternRequiresLift } from '@/src/calc/trafficLight'

// All 12 sections of the Step 1 questionnaire, grouped into three tiers
// (qualification → sizing → proposal). The order here is the order they
// render on the page and in the SectionNav. `requiredFields` mirrors the visible
// red asterisks — when every required field has a non-empty value, the section
// reads as 'complete' in the nav. Sections with no required fields are 'optional'.

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
}

export const FORM_SECTIONS: ReadonlyArray<SectionMeta> = [
  // ── Tier 1 — VEHICLE QUALIFICATION ──────────────────────────────────────
  { id: 'section-01', num: '01', label: 'What are you moving?', short: 'Load',
    tier: 'qualification', requiredFields: ['maxLoadWeightLbs', 'typicalUnitType'] },
  { id: 'section-02', num: '02', label: 'How is it transferred?', short: 'Transfer',
    tier: 'qualification', requiredFields: ['transferMethod', 'deliveryPattern'] },
  { id: 'section-03', num: '03', label: 'Environment & site', short: 'Environment',
    tier: 'qualification', requiredFields: ['minAisleWidthFt'] },
  { id: 'section-04', num: '04', label: 'Certifications', short: 'Certs',
    tier: 'qualification', requiredFields: [] },
  // ── Tier 2 — FLEET SIZING & ECONOMICS ───────────────────────────────────
  { id: 'section-05', num: '05', label: 'Operating schedule', short: 'Schedule',
    tier: 'sizing', requiredFields: ['shiftsPerDay', 'hoursPerShift', 'operatingDaysPattern'] },
  { id: 'section-06', num: '06', label: 'Throughput & distance', short: 'Throughput',
    tier: 'sizing', requiredFields: ['requiredThroughputPerHour', 'avgDistanceFt', 'distanceType'] },
  { id: 'section-07', num: '07', label: 'Labor', short: 'Labor',
    tier: 'sizing', requiredFields: [] },
  // ── Tier 3 — PROPOSAL DETAILS (collapsed; consumers arrive in future revisions) ──
  { id: 'section-08', num: '08', label: 'Site details', short: 'Site',
    tier: 'proposal', requiredFields: [], startCollapsed: true },
  { id: 'section-09', num: '09', label: 'Integration', short: 'Integration',
    tier: 'proposal', requiredFields: [], startCollapsed: true },
  { id: 'section-10', num: '10', label: 'Dealer & contact', short: 'Dealer',
    tier: 'proposal', requiredFields: [], startCollapsed: true },
  { id: 'section-11', num: '11', label: 'Timeline', short: 'Timeline',
    tier: 'proposal', requiredFields: [], startCollapsed: true },
  { id: 'section-12', num: '12', label: 'Project notes', short: 'Notes',
    tier: 'proposal', requiredFields: [], startCollapsed: true },
] as const

export type SectionStatus = 'complete' | 'in-progress' | 'untouched' | 'optional'

/** Test whether a field's current value should count as 'filled'. */
function isFilled(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

/**
 * Compute a section's status from current form values.
 * Sections with no required fields are always 'optional'.
 */
export function sectionStatus(meta: SectionMeta, values: Partial<ProjectFormData>): SectionStatus {
  if (meta.requiredFields.length === 0) return 'optional'
  const filled = meta.requiredFields.filter(f => isFilled(values[f])).length
  if (filled === 0) return 'untouched'
  if (filled === meta.requiredFields.length) return 'complete'
  return 'in-progress'
}

/** Total required fields across the whole questionnaire. */
export function totalRequired(): number {
  return FORM_SECTIONS.reduce((sum, s) => sum + s.requiredFields.length, 0)
}

/** Number of required fields currently filled across all sections. */
export function filledRequired(values: Partial<ProjectFormData>): number {
  let count = 0
  for (const s of FORM_SECTIONS) {
    for (const f of s.requiredFields) if (isFilled(values[f])) count++
  }
  return count
}

// ── Qualification readiness meter ────────────────────────────────────────────
// Counts the gate-engine inputs (src/calc/gates.ts) that have an answer.
// Excluded by design: outdoorRequired/freezerCapable (unchecked is an answer,
// not a gap) and certifications (optional soft gate). maxLiftHeightFt counts
// only while the delivery pattern implies a lift.

const QUALIFICATION_INPUTS: ReadonlyArray<keyof ProjectFormData> = [
  'maxLoadWeightLbs', 'typicalUnitType',
  'loadLengthIn', 'loadWidthIn', 'loadHeightIn',
  'transferMethod', 'deliveryPattern',
  'tempMinF', 'tempMaxF', 'maxRampGrade', 'minAisleWidthFt',
]

// Unlike isFilled (badge semantics, number > 0), negative numbers are real
// answers here — e.g. -10 °F for a freezer. 0 stays the app-wide "unset"
// sentinel, matching the gate engine (gates.ts skips temp gates at 0; real
// freezer specs are negative °F).
function isAnswered(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return false
}

function qualificationInputs(values: Partial<ProjectFormData>): ReadonlyArray<keyof ProjectFormData> {
  return deliveryPatternRequiresLift(values.deliveryPattern)
    ? [...QUALIFICATION_INPUTS, 'maxLiftHeightFt']
    : QUALIFICATION_INPUTS
}

export function qualificationInputsTotal(values: Partial<ProjectFormData>): number {
  return qualificationInputs(values).length
}

export function qualificationInputsFilled(values: Partial<ProjectFormData>): number {
  return qualificationInputs(values).filter(f => isAnswered(values[f])).length
}
