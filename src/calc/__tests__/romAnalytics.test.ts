import { describe, it, expect } from 'vitest'
import { effDailyOpHr, defaultOperatingDaysPerYear, type AnalyticsSchedule } from '../romAnalytics'
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

describe('defaultOperatingDaysPerYear', () => {
  it('derives from the operating-days pattern', () => {
    expect(defaultOperatingDaysPerYear('Mon–Fri')).toBe(260)
    expect(defaultOperatingDaysPerYear('Mon–Sat')).toBe(312)
    expect(defaultOperatingDaysPerYear('Mon–Sun')).toBe(364)
  })

  it('Custom pattern uses selected days × 52', () => {
    expect(defaultOperatingDaysPerYear('Custom', ['Mon', 'Tue', 'Wed', 'Thu'])).toBe(208)
    expect(defaultOperatingDaysPerYear('Custom', [])).toBe(312)  // no days picked yet
    expect(defaultOperatingDaysPerYear('Custom', null)).toBe(312)
  })

  it('falls back to 312 when the pattern is unset or unknown', () => {
    expect(defaultOperatingDaysPerYear(undefined)).toBe(312)
    expect(defaultOperatingDaysPerYear('')).toBe(312)
  })
})
