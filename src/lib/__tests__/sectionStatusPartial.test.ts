import { describe, it, expect } from 'vitest'
import { FORM_SECTIONS, sectionStatus } from '../constants/sections'
import type { ProjectFormData } from '../validations/schemas'

const sec = (id: string) => FORM_SECTIONS.find(s => s.id === id)!
const v = (o: Record<string, unknown>) => o as Partial<ProjectFormData>

describe('section status — partial, never falsely complete', () => {
  it('REGRESSION: section 03 is partial on one of six required fields', () => {
    // It reported COMPLETE here before the 2026-10-03 audit, because
    // requiredFields listed only minAisleWidthFt while the form showed six
    // asterisks.
    expect(sectionStatus(sec('section-03'), v({ minAisleWidthFt: 12 }))).toBe('partial')
  })

  it('reaches complete only when every required field is answered', () => {
    const all = v({
      minAisleWidthFt: 12, outdoorRequired: false, temperatureEnvironment: 'ambient',
      rampRequired: false, facilitySizeSqFt: 50000, sharedTrafficTypes: ['None'],
    })
    expect(sectionStatus(sec('section-03'), all)).toBe('complete')
  })

  it('counts a tri-state "No" as answered, not as blank', () => {
    // Every one of these is false; before the fix the section could never
    // complete no matter what the engineer chose.
    const answeredNo = v({
      wmsRequired: false, barcodeScanningRequired: false,
      storageTrackingRequired: false, hasAgvExperience: false,
    })
    expect(sectionStatus(sec('section-09'), answeredNo)).toBe('complete')
  })

  it('is untouched when nothing is answered, partial once something is', () => {
    expect(sectionStatus(sec('section-09'), v({}))).toBe('untouched')
    expect(sectionStatus(sec('section-09'), v({ wmsRequired: true }))).toBe('partial')
  })

  it("'optional' means the section marks nothing required, not that it is blank", () => {
    for (const id of ['section-04', 'section-07', 'section-10', 'section-11', 'section-12']) {
      expect(sec(id).requiredFields).toHaveLength(0)
      expect(sectionStatus(sec(id), v({}))).toBe('optional')
    }
    // Certifications is deliberately in that list: an empty selection is the
    // normal answer, the gate skips on it, and so it carries no marker either.
    // ...and sections that DO mark fields never report optional.
    for (const id of ['section-01', 'section-03', 'section-08', 'section-09']) {
      expect(sectionStatus(sec(id), v({}))).not.toBe('optional')
    }
  })

  it('the flow list keeps its own rule', () => {
    expect(sectionStatus(sec('section-06'), v({ flows: [] }))).toBe('untouched')
    expect(sectionStatus(sec('section-06'), v({ flows: [{ id: 'f', distanceFt: 0, thruPerHr: 0 }] }))).toBe('partial')
    expect(sectionStatus(sec('section-06'), v({ flows: [{ id: 'f', distanceFt: 100, thruPerHr: 10 }] }))).toBe('complete')
  })

  it('no section claims complete while a gate or price input behind it is blank', () => {
    // The contract: every section that shows an asterisk must be able to report
    // something other than 'optional'.
    const gated = ['section-01', 'section-02', 'section-03', 'section-05', 'section-08', 'section-09']
    for (const id of gated) expect(sec(id).requiredFields.length).toBeGreaterThan(0)
  })
})
