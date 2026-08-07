import { describe, it, expect } from 'vitest'
import { isRequiredUnmet, type QSection } from '../QuestionnaireNav'

const sec01: QSection = { id: 'q-sec-01', num: '01', short: 'About you', tier: 'Getting started', fields: ['submissionType', 'customerName'] }
const sec02: QSection = { id: 'q-sec-02', num: '02', short: 'Vehicles', tier: 'Getting started', fields: ['vehiclesOfInterest'] }

describe('isRequiredUnmet', () => {
  it('flags a section carrying submissionType when it is empty', () => {
    expect(isRequiredUnmet(sec01, {})).toBe(true)
  })
  it('clears once submissionType is set', () => {
    expect(isRequiredUnmet(sec01, { submissionType: 'customer' })).toBe(false)
  })
  it('never flags a section that does not carry submissionType', () => {
    expect(isRequiredUnmet(sec02, {})).toBe(false)
  })
})
