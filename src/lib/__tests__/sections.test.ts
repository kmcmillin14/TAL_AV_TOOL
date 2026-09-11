import { describe, it, expect } from 'vitest'
import {
  FORM_SECTIONS,
  qualificationInputsTotal,
  qualificationInputsFilled,
} from '../constants/sections'

describe('FORM_SECTIONS tiers', () => {
  it('renders tiers contiguously in order qualification → sizing → proposal', () => {
    const tiers = FORM_SECTIONS.map(s => s.tier)
    const firstSizing = tiers.indexOf('sizing')
    const firstProposal = tiers.indexOf('proposal')
    expect(tiers.slice(0, firstSizing).every(t => t === 'qualification')).toBe(true)
    expect(tiers.slice(firstSizing, firstProposal).every(t => t === 'sizing')).toBe(true)
    expect(tiers.slice(firstProposal).every(t => t === 'proposal')).toBe(true)
  })

  it('has 12 sections: 4 qualification, 5 sizing, 3 proposal', () => {
    expect(FORM_SECTIONS).toHaveLength(12)
    expect(FORM_SECTIONS.filter(s => s.tier === 'qualification')).toHaveLength(4)
    // 08 Site details and 09 Integration moved sizing-ward 2026-09-11 — they
    // hold the ROM pricing drivers, so they're no longer "proposal only".
    expect(FORM_SECTIONS.filter(s => s.tier === 'sizing')).toHaveLength(5)
    expect(FORM_SECTIONS.filter(s => s.tier === 'proposal')).toHaveLength(3)
  })

  it('never hides a section that drives a gate or a price behind a collapse', () => {
    // An input that moves the quote must be visible without a disclosure —
    // 08/09 were collapsed AND badged "not matched in any downstream calc"
    // while holding the biggest pricing drivers in the app.
    const mustBeOpen = ['section-08', 'section-09']
    for (const id of mustBeOpen) {
      const sec = FORM_SECTIONS.find(s => s.id === id)!
      expect(sec.startCollapsed, `${id} must start expanded`).toBeFalsy()
      expect(sec.notMatched, `${id} feeds ROM pricing — cannot be badged "not matched"`).toBeFalsy()
    }
  })
})

describe('qualification readiness meter', () => {
  it('counts 8 inputs (temps left 2026-07-11 with the numeric temperature gates)', () => {
    expect(qualificationInputsTotal({})).toBe(8)
    expect(qualificationInputsTotal({ transferType: 'forklift' })).toBe(8)
  })

  it('counts answered strings and nonzero numbers (0 = unset sentinel)', () => {
    expect(qualificationInputsFilled({})).toBe(0)
    expect(qualificationInputsFilled({ maxLoadWeightLbs: 2000 })).toBe(1)
    expect(qualificationInputsFilled({ tempMinF: -10 })).toBe(0)     // temps no longer counted (informational)
    expect(qualificationInputsFilled({ maxRampGrade: 0 })).toBe(0)   // 0 = unset sentinel
    expect(qualificationInputsFilled({ typicalUnitType: '  ' })).toBe(0) // blank string is not
    expect(qualificationInputsFilled({ maxLoadWeightLbs: NaN })).toBe(0) // cleared field is not
  })

  it('counts transfer type but not the optional transfer height or legacy fields', () => {
    expect(qualificationInputsFilled({ transferType: 'forklift' })).toBe(1)
    expect(qualificationInputsFilled({ transferHeightFt: 14 })).toBe(0)        // height is optional, not a gap
    expect(qualificationInputsFilled({ deliveryPattern: 'Floor-Height' })).toBe(0) // legacy field no longer counted
    expect(qualificationInputsFilled({ transferMethod: 'Lift' })).toBe(0)     // legacy field no longer counted
  })
})
