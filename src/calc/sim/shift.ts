// src/calc/sim/shift.ts — the staffed week (owner, 2026-11-13). PURE.
// Each working day the staffed hours run from midnight (shifts back to back); the rest of the day, and
// the days off at the end of each week, are off-shift: no new orders, and vehicles charge.

import type { SimSettings } from './types'

type Staffed = Pick<SimSettings, 'staffedHr' | 'daysPerWeek'>
const DAY = 86400
const workDay = (P: Staffed, t: number) => Math.floor(t / DAY) % 7 < (P.daysPerWeek ?? 7)

/** Is `t` inside the staffed window? */
export function inShift(P: Staffed, t: number): boolean {
  return workDay(P, t) && (P.staffedHr >= 24 || t % DAY < P.staffedHr * 3600)
}

/** Staffed seconds from 0 to `t` — the time rates and utilization are measured over. */
export function staffedSeconds(P: Staffed, t: number): number {
  const on = Math.min(24, P.staffedHr) * 3600, days = Math.floor(t / DAY)
  let s = 0
  for (let d = 0; d < days; d++) if (workDay(P, d * DAY)) s += on
  return s + (workDay(P, t) ? Math.min(t % DAY, on) : 0)
}
