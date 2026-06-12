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

/** Default ROM operating days/year derived from Step 1's operating-days pattern.
 *  A derived DEFAULT, never a lock — the ROM assumptions panel's explicit value
 *  always wins (`project.operatingDaysPerYear ?? defaultOperatingDaysPerYear(…)`). */
export function defaultOperatingDaysPerYear(
  pattern?: string | null,
  customDays?: string[] | null,
): number {
  switch (pattern) {
    case 'Mon–Fri': return 260
    case 'Mon–Sat': return 312
    case 'Mon–Sun': return 364
    case 'Custom':  return customDays?.length ? customDays.length * 52 : 312
    default:        return 312
  }
}
