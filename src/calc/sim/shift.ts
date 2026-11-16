// src/calc/sim/shift.ts — the staffed week (owner, 2026-11-13). PURE.
// Each working day the staffed hours run from midnight (shifts back to back); the rest of the day, and
// the days off at the end of each week, are off-shift: no new orders, and vehicles charge.

import type { SimSettings } from './types'

type Staffed = Pick<SimSettings, 'staffedHr' | 'daysPerWeek'>
type Shifts = Staffed & Pick<SimSettings, 'shiftHr'>
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

/** A move counts as on time when it is finished within this long after the end of the shift it was
 *  ordered in, s (an order placed near the end of a shift may finish just after it). */
export const LATE_GRACE_S = 1800

/** When the shift `t` falls in ends, s (shifts run back to back from midnight, `shiftHr` long; one
 *  staffed block when `shiftHr` is not given). */
export function shiftEnd(P: Shifts, t: number): number {
  const len = Math.min(24, P.shiftHr ?? P.staffedHr) * 3600 || DAY
  const day = Math.floor(t / DAY) * DAY
  return day + (Math.floor((t - day) / len) + 1) * len
}

/** Is a move ordered at `ordered` and finished at `t` late? Finished off-shift, or more than the grace
 *  after the end of the shift it was ordered in — a backlog carried into the next shift. */
export const isLate = (P: Shifts, ordered: number, t: number) => !inShift(P, t) || t > shiftEnd(P, ordered) + LATE_GRACE_S
