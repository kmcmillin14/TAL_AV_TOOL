import type { ProjectFormData } from '@/src/lib/validations/schemas'

// All 13 sections of the Step 1 questionnaire. The order here is the order they
// render on the page and in the SectionNav. `requiredFields` mirrors the visible
// red asterisks — when every required field has a non-empty value, the section
// reads as 'complete' in the nav. Sections with no required fields are 'optional'.

export interface SectionMeta {
  id: string                                // anchor id (e.g. 'section-01')
  num: string                               // display number ('01')
  label: string                             // full label
  short: string                             // short label for nav
  requiredFields: Array<keyof ProjectFormData>
  /** Section is collapsible in the form (defaults to false). */
  collapsible?: boolean
}

export const FORM_SECTIONS: ReadonlyArray<SectionMeta> = [
  {
    id: 'section-01', num: '01',
    label: 'What are you moving?',           short: 'Load',
    requiredFields: ['maxLoadWeightLbs', 'typicalUnitType'],
  },
  {
    id: 'section-02', num: '02',
    label: 'How is it transferred?',         short: 'Transfer',
    // maxLiftHeightFt is conditionally required (only when deliveryPattern involves height).
    // Tracking that conditionally is added complexity; treat it as optional for the nav badge.
    requiredFields: ['transferMethod', 'deliveryPattern'],
  },
  {
    id: 'section-03', num: '03',
    label: 'Where does it operate?',         short: 'Site',
    requiredFields: ['minAisleWidthFt', 'floorCondition'],
  },
  {
    id: 'section-04', num: '04',
    label: 'Operating Schedule',             short: 'Schedule',
    requiredFields: ['shiftsPerDay', 'hoursPerShift', 'operatingDaysPattern'],
  },
  {
    id: 'section-05', num: '05',
    label: 'Throughput & Distance',          short: 'Throughput',
    requiredFields: ['requiredThroughputPerHour', 'avgDistanceFt', 'distanceType'],
  },
  {
    id: 'section-06', num: '06',
    label: 'Labor & ROI',                    short: 'Labor',
    requiredFields: [],
  },
  {
    id: 'section-07', num: '07',
    label: 'Ramps & Inclines',               short: 'Ramps',
    requiredFields: [],
  },
  {
    id: 'section-08', num: '08',
    label: 'Dealer & Contact',               short: 'Contact',
    requiredFields: [],
  },
  {
    id: 'section-09', num: '09',
    label: 'Certifications & Compliance',    short: 'Certs',
    requiredFields: [],
  },
  {
    id: 'section-10', num: '10',
    label: 'Equipment Integration',          short: 'Integration',
    requiredFields: [],
  },
  {
    id: 'section-11', num: '11',
    label: 'Environment',                    short: 'Environment',
    requiredFields: [],
    collapsible: true,
  },
  {
    id: 'section-12', num: '12',
    label: 'Software Integration',           short: 'Software',
    requiredFields: [],
    collapsible: true,
  },
  {
    id: 'section-13', num: '13',
    label: 'Project Notes',                  short: 'Notes',
    requiredFields: [],
  },
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
