// src/calc/romAnalytics.ts — derived ROM dashboard schedule helpers. PURE.
// No React, no fetch, no localStorage, no fs.

export interface AnalyticsSchedule {
  shiftsPerDay: number
  hoursPerShift: number
  breaksPerShift: number
  breakDurationMin: number
  operatorsPerShift: number
  operatingDaysPerYear: number
}

/** Effective daily operating hours after breaks, capped at 24.
 *  effHoursPerShift = hoursPerShift − breaksPerShift × breakDurationMin/60 */
export function effDailyOpHr(s: AnalyticsSchedule): number {
  const effHoursPerShift = Math.max(0, s.hoursPerShift - (s.breaksPerShift * s.breakDurationMin) / 60)
  return Math.min(24, s.shiftsPerDay * effHoursPerShift)
}
