// Maps the TAL customer-deck structure: which template slides belong to which
// selectable section, and which slide is each vehicle chassis's overview.
// This is TEMPLATE structure (slide indices), not vehicle data — vehicle names
// come from the JSON library at render time.
// Body slides S20, S22, S23, S26 are retired (2026-07-10): gate grid,
// charging/buffer tier math, and KPI-tile grid move to appendix slides.

export interface PptxSection {
  key: string
  label: string
  slides: number[]      // 1-based template slide numbers
  always?: boolean      // always included, not user-toggleable
}

/** Sections in deck order. Product Overviews (S11–S17) are handled separately
 *  via VEHICLE_SLIDE (per-vehicle, fleet-filtered). S35 is a trailing slide,
 *  never removed (absent from every section). Retired slides S20/S22/S23/S26
 *  are NOT listed here — they are always removed via RETIRED_SLIDES. */
export const PPTX_SECTIONS: readonly PptxSection[] = [
  { key: 'cover',        label: 'Cover',                   slides: [1], always: true },
  { key: 'company',      label: 'Company & Approach',      slides: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { key: 'appReq',       label: 'Application Requirements', slides: [18] },
  { key: 'matrix',       label: 'Vehicle Selection',        slides: [19] },
  { key: 'fleetEngine',  label: 'Fleet Sizing',             slides: [21] },
  { key: 'materialFlow', label: 'Material Flow Diagram',   slides: [24] },
  { key: 'kpis',         label: 'Financials',               slides: [25] },
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

/** Body slides retired by the customer-deck redesign (2026-07-10): gate grid,
 *  charging/buffer tier math, and the KPI-tile grid. Their content now renders
 *  on appendix slides; the template slides are always removed. */
export const RETIRED_SLIDES: readonly number[] = [20, 22, 23, 26]

/** Semantic slide numbers the content fillers write into — single source of
 *  truth so `content.ts`/`tables.ts` never hardcode literals that can drift
 *  from the section map above. */
export const ROM_SLIDE = {
  requirements: 18,    // 01 — Application Requirements (trimmed table)
  vehicles: 19,        // 02 — Vehicle Selection (fit cards, assigned chassis only)
  fleetSizing: 21,     // 03 — Fleet Sizing (waterfall; replaces the 3 tier slides)
  materialFlow: 24,    // 04 — Material Flow (diagram + trimmed table)
  financials: 25,      // 05 — Financials (3 tiles)
  investment: 27,      // 06 — Investment (pricing table)
  roi: 28,             // 06 — ROI (chart + 3-row table)
} as const

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
  const remove: number[] = [...RETIRED_SLIDES]
  for (let n = 1; n <= TOTAL_SLIDES; n++) {
    if (owned.has(n) && !keep.has(n)) remove.push(n)
  }
  return remove
}
