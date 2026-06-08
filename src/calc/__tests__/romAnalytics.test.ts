import { describe, it, expect } from 'vitest'
import { effDailyOpHr, type AnalyticsSchedule } from '../romAnalytics'
import { projectSchema } from '@/src/lib/validations/schemas'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import type { StoredProject } from '@/src/lib/storage'

const sched: AnalyticsSchedule = {
  shiftsPerDay: 2, hoursPerShift: 8, breaksPerShift: 2, breakDurationMin: 15,
  operatorsPerShift: 3, operatingDaysPerYear: 250,
}

describe('effDailyOpHr', () => {
  it('subtracts breaks per shift and multiplies by shifts, capped at 24', () => {
    // effHoursPerShift = 8 − 2×15/60 = 7.5 ; ×2 shifts = 15
    expect(effDailyOpHr(sched)).toBeCloseTo(15, 5)
    expect(effDailyOpHr({ ...sched, shiftsPerDay: 4, hoursPerShift: 8, breaksPerShift: 0 })).toBe(24)
  })
})

describe('serviceLifeYears default', () => {
  it('defaults to 7 when absent', () => {
    expect(projectSchema.parse({}).serviceLifeYears).toBe(7)
  })
})

describe('appRequirementsFromProject', () => {
  it('maps project fields with safe defaults', () => {
    const p = { maxLoadWeightLbs: 2000, minAisleWidthFt: 10, certifications: ['UL'] } as unknown as StoredProject
    const r = appRequirementsFromProject(p)
    expect(r.maxLoadWeightLbs).toBe(2000)
    expect(r.minAisleWidthFt).toBe(10)
    expect(r.certifications).toEqual(['UL'])
    expect(r.typicalUnitType).toBe('')
    expect(r.outdoorRequired).toBe(false)
  })
})
