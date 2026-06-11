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
  it('counts 11 inputs when the delivery pattern needs no lift', () => {
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Floor' })).toBe(11)
    expect(qualificationInputsTotal({})).toBe(11)
  })

  it('counts 12 inputs when the delivery pattern requires lift', () => {
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Height' })).toBe(12)
    expect(qualificationInputsTotal({ deliveryPattern: 'Conveyor-Conveyor' })).toBe(12)
  })

  it('counts answered strings and numbers, including 0 °F', () => {
    expect(qualificationInputsFilled({})).toBe(0)
    expect(qualificationInputsFilled({ maxLoadWeightLbs: 2000 })).toBe(1)
    expect(qualificationInputsFilled({ tempMinF: 0 })).toBe(1)        // 0 °F is a real answer
    expect(qualificationInputsFilled({ typicalUnitType: '  ' })).toBe(0) // blank string is not
    expect(qualificationInputsFilled({ maxLoadWeightLbs: NaN })).toBe(0) // cleared field is not
  })

  it('counts lift height only while the pattern requires it', () => {
    expect(qualificationInputsFilled({ maxLiftHeightFt: 14 })).toBe(0)
    expect(
      qualificationInputsFilled({ deliveryPattern: 'Floor-Height', maxLiftHeightFt: 14 }),
    ).toBe(2) // deliveryPattern + maxLiftHeightFt
  })
})
