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

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Longest run of consecutive operating days before a rest day (wrapping the week).
 *  Infinity when all 7 days operate (no weekly reset). Drives the charging model's
 *  weekend-reset credit. Unset/unknown patterns default to Mon–Sat (6), matching
 *  `defaultOperatingDaysPerYear`. */
export function consecutiveOperatingDays(pattern?: string | null, customDays?: string[] | null): number {
  let on: boolean[]
  switch (pattern) {
    case 'Mon–Fri': on = [true, true, true, true, true, false, false]; break
    case 'Mon–Sat': on = [true, true, true, true, true, true, false]; break
    case 'Mon–Sun': return Infinity
    case 'Custom': {
      const set = new Set(customDays ?? [])
      on = WEEK.map(d => set.has(d))
      break
    }
    default: on = [true, true, true, true, true, true, false] // Mon–Sat
  }
  if (on.every(Boolean)) return Infinity
  if (!on.some(Boolean)) return 0
  const n = on.length
  let max = 0, run = 0
  for (let k = 0; k < 2 * n; k++) {        // 2× pass handles wrap-around
    if (on[k % n]) { run++; if (run > max) max = run } else run = 0
  }
  return Math.min(max, n)
}
