// src/calc/sim/shift.ts — the staffed day (owner, 2026-11-13). PURE.

import type { SimSettings } from './types'

/** Is `t` inside the staffed window? Each day the staffed hours run from midnight (shifts back to back);
 *  the rest of the day is off-shift: no new orders, and vehicles charge. */
export function inShift(P: Pick<SimSettings, 'staffedHr'>, t: number): boolean {
  return P.staffedHr >= 24 || t % 86400 < P.staffedHr * 3600
}
/** Staffed seconds from 0 to `t` — the time rates and utilization are measured over. */
export function staffedSeconds(P: Pick<SimSettings, 'staffedHr'>, t: number): number {
  if (P.staffedHr >= 24) return t
  const day = 86400, on = P.staffedHr * 3600
  return Math.floor(t / day) * on + Math.min(t % day, on)
}
