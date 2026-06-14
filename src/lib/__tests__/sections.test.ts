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

  it('has 12 sections: 4 qualification, 3 sizing, 5 proposal', () => {
    expect(FORM_SECTIONS).toHaveLength(12)
    expect(FORM_SECTIONS.filter(s => s.tier === 'qualification')).toHaveLength(4)
    expect(FORM_SECTIONS.filter(s => s.tier === 'sizing')).toHaveLength(3)
    expect(FORM_SECTIONS.filter(s => s.tier === 'proposal')).toHaveLength(5)
  })
})

describe('qualification readiness meter', () => {
  it('counts 11 inputs regardless of delivery pattern (lift is optional pick/drop)', () => {
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Floor' })).toBe(11)
    expect(qualificationInputsTotal({})).toBe(11)
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Height' })).toBe(11)
    expect(qualificationInputsTotal({ deliveryPattern: 'Conveyor-Conveyor' })).toBe(11)
  })

  it('counts answered strings and nonzero numbers (0 = unset sentinel)', () => {
    expect(qualificationInputsFilled({})).toBe(0)
    expect(qualificationInputsFilled({ maxLoadWeightLbs: 2000 })).toBe(1)
    expect(qualificationInputsFilled({ tempMinF: -10 })).toBe(1)      // negative freezer temp is real
    expect(qualificationInputsFilled({ tempMinF: 0 })).toBe(0)        // 0 = unset, matches the gates
    expect(qualificationInputsFilled({ typicalUnitType: '  ' })).toBe(0) // blank string is not
    expect(qualificationInputsFilled({ maxLoadWeightLbs: NaN })).toBe(0) // cleared field is not
  })

  it('does not count pick/drop heights (floor-to-floor is a valid answer, not a gap)', () => {
    // Lift is now modeled via optional pick/drop heights; they never inflate the meter.
    expect(qualificationInputsFilled({ dropHeightFt: 14 })).toBe(0)
    expect(qualificationInputsFilled({ deliveryPattern: 'Floor-Height', dropHeightFt: 14 })).toBe(1) // deliveryPattern only
  })
})
