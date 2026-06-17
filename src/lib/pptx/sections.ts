// Maps the TAL ROM deck's structure: which template slides belong to which
// selectable section, and which slide is each vehicle chassis's overview.
// This is TEMPLATE structure (slide indices), not vehicle data — vehicle names
// come from the JSON library at render time.

export interface PptxSection {
  key: string
  label: string
  slides: number[]      // 1-based template slide numbers
  always?: boolean      // always included, not user-toggleable
}

/** Sections in deck order. Product Overviews (S11–S17) are handled separately
 *  via VEHICLE_SLIDE (per-vehicle, fleet-filtered). S35 is a trailing slide,
 *  never removed (absent from every section). */
export const PPTX_SECTIONS: readonly PptxSection[] = [
  { key: 'cover',        label: 'Cover',                   slides: [1], always: true },
  { key: 'company',      label: 'Company & Approach',      slides: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { key: 'appReq',       label: 'Application Requirements', slides: [18] },
  { key: 'matrix',       label: 'Vehicle Selection Matrix', slides: [19, 20] },
  { key: 'fleetEngine',  label: 'Fleet Engine',            slides: [21, 22, 23] },
  { key: 'materialFlow', label: 'Material Flow Diagram',   slides: [24] },
  { key: 'kpis',         label: 'KPIs',                    slides: [25, 26] },
  { key: 'investment',   label: 'Investment Summary',      slides: [27] },
  { key: 'roi',          label: 'ROI Calculation',         slides: [28] },
  { key: 'services',     label: 'Services & Support',      slides: [29, 30, 31, 32] },
  { key: 'whyTal',       label: 'Why TAL',                 slides: [33] },
  { key: 'contact',      label: 'Thank You / Contact',     slides: [34], always: true },
]

/** app vehicleId → its overview slide number. Cleanfix (S17) has no app vehicle
 *  and is always dropped. */
export const VEHICLE_SLIDE: Readonly<Record<string, number>> = {
  '8tb50a': 11,
  '8hbc40a': 12,
  'm10': 13,
  'ml2': 14,
  'ebase7': 15,
  'cb18': 16,
}

/** Every product-overview slide (used to compute the default "remove" set). */
export const ALL_VEHICLE_SLIDES: readonly number[] = [11, 12, 13, 14, 15, 16, 17]

export const TOTAL_SLIDES = 35

/** A user's section/vehicle selections, by key/id. */
export interface PptxSelection {
  sections: Record<string, boolean>     // section key → included
  vehicles: Record<string, boolean>     // app vehicleId → included
}

/**
 * Resolve which 1-based slide numbers to REMOVE for a given selection.
 * Keeps: always-on sections, selected sections, selected fleet vehicles, and
 * any slide not owned by a section/vehicle (e.g. trailing S35). Removes the rest
 * — including every non-selected vehicle overview and always Cleanfix (S17).
 */
export function slidesToRemove(selection: PptxSelection): number[] {
  const keep = new Set<number>()
  for (const s of PPTX_SECTIONS) {
    if (s.always || selection.sections[s.key]) s.slides.forEach(n => keep.add(n))
  }
  for (const [id, slide] of Object.entries(VEHICLE_SLIDE)) {
    if (selection.vehicles[id]) keep.add(slide)
  }
  // Slides owned by NO section and NO vehicle stay by default (e.g. S35).
  const owned = new Set<number>([
    ...PPTX_SECTIONS.flatMap(s => s.slides),
    ...ALL_VEHICLE_SLIDES,
  ])
  const remove: number[] = []
  for (let n = 1; n <= TOTAL_SLIDES; n++) {
    if (owned.has(n) && !keep.has(n)) remove.push(n)
  }
  return remove
}
