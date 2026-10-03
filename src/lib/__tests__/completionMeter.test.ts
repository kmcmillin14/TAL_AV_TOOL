import { describe, it, expect } from 'vitest'
import { mirrorFirstLoad } from '../mirrorFirstLoad'
import {
  FORM_SECTIONS, sectionStatus,
  qualificationInputsFilled, qualificationInputsTotal,
} from '../constants/sections'
import type { ProjectFormData } from '../validations/schemas'

/** The Step 1 readiness meter and the section-01 badge both read the LEGACY
 *  singular load fields, which the form stopped registering when loads became
 *  an array. mirrorFirstLoad was applied only on the way to storage, so the
 *  live values those two read never carried them: the meter sat at 3 of 8 and
 *  section 01 could not reach 'complete' however much of the load table was
 *  filled (audit 2026-10-03). These pin the mirror onto the read path. */

const loadRow = {
  id: 'l1', unitType: 'Standard Pallet',
  lengthIn: 48, widthIn: 40, heightIn: 50, weightLbs: 2500,
}

/** What watch() returns: loads array only, no singular fields. */
const RAW = { loads: [loadRow] } as unknown as Partial<ProjectFormData>

const sec01 = FORM_SECTIONS.find(s => s.id === 'section-01')!

describe('the completion meter sees the load table', () => {
  it('REGRESSION: raw form values carry none of the five load inputs', () => {
    expect(qualificationInputsFilled(RAW)).toBe(0)
  })

  it('counts all five once mirrored — weight, type and the three dimensions', () => {
    expect(qualificationInputsFilled(mirrorFirstLoad(RAW))).toBe(5)
    expect(qualificationInputsTotal(RAW)).toBe(8)
  })

  it('the meter moves as the load table is filled in, not only on reload', () => {
    const typed = (row: Partial<typeof loadRow>) =>
      qualificationInputsFilled(mirrorFirstLoad(
        { loads: [{ id: 'l1', unitType: '', ...row }] } as unknown as Partial<ProjectFormData>,
      ))
    expect(typed({})).toBe(0)
    expect(typed({ unitType: 'Tote' })).toBe(1)
    expect(typed({ unitType: 'Tote', weightLbs: 900 })).toBe(2)
  })

  it('REGRESSION: section 01 could not reach complete from raw values', () => {
    const answered = { palletEntryType: 'stringer', palletStacking: 'no' }
    expect(sectionStatus(sec01, { ...RAW, ...answered } as Partial<ProjectFormData>)).toBe('partial')
    expect(sectionStatus(sec01, mirrorFirstLoad({ ...RAW, ...answered } as Partial<ProjectFormData>))).toBe('complete')
  })

  it('mirroring an empty load row leaves the section untouched, not complete', () => {
    const blank = { loads: [{ id: 'l1', unitType: '' }] } as unknown as Partial<ProjectFormData>
    expect(sectionStatus(sec01, mirrorFirstLoad(blank))).toBe('untouched')
  })

  it('passes a project with no loads through unchanged', () => {
    const legacy = { maxLoadWeightLbs: 2500, typicalUnitType: 'Standard Pallet' } as Partial<ProjectFormData>
    expect(mirrorFirstLoad(legacy)).toBe(legacy)
    expect(qualificationInputsFilled(legacy)).toBe(2)
  })
})
