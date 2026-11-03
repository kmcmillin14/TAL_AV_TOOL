import { describe, it, expect } from 'vitest'
import { FIELD_SECTION_ID, pricingInputConfidence, pricingGate } from '../romComplexityFromProject'
import { FORM_SECTIONS } from '../constants/sections'
import type { StoredProject } from '../storage'

/** FIELD_SECTION_ID is derived from FORM_SECTIONS.requiredFields (see the
 *  module comment), not hand-maintained — but the derivation still depends on
 *  every PRICING_INPUTS/PRICING_GATE_INPUTS entry's `field` actually being
 *  listed in some section's requiredFields. This is the drift guard: run the
 *  real functions on a blank project (everything unanswered) and confirm
 *  every label they can produce resolves to a real Step 1 section — the
 *  exact failure mode an engineer would hit as a dead "jump to what's
 *  missing" link on Step 4. */
const BLANK_PROJECT = {} as StoredProject

describe('FIELD_SECTION_ID', () => {
  it('has a section for every label pricingInputConfidence can produce', () => {
    const { missing } = pricingInputConfidence(BLANK_PROJECT)
    expect(missing.length).toBeGreaterThan(0)
    for (const label of missing) expect(FIELD_SECTION_ID, label).toHaveProperty(label)
  })

  it('has a section for every label pricingGate can produce', () => {
    const { missingAll } = pricingGate(BLANK_PROJECT)
    expect(missingAll.length).toBeGreaterThan(0)
    for (const label of missingAll) expect(FIELD_SECTION_ID, label).toHaveProperty(label)
  })

  it('every mapped section id actually exists in FORM_SECTIONS', () => {
    const realIds = new Set(FORM_SECTIONS.map(s => s.id))
    for (const [label, sectionId] of Object.entries(FIELD_SECTION_ID)) {
      expect(realIds, `${label} -> ${sectionId}`).toContain(sectionId)
    }
  })
})
