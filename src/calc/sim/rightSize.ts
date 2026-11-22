// src/calc/sim/rightSize.ts — the right fleet size for one vehicle type (owner, 2026-11-22). PURE.
// After a run, the simulation tries other counts of one type (the others held) until it knows the smallest
// count that passes all three checks: down from a count that passes, up from one that does not. This file
// only decides which count to try next from what has been tried; the run view runs them.

import { verdictPasses as passes } from './grades'
import type { Verdict } from './types'

/** Counts tried so far and what each one did. */
export type Tried = Record<number, Verdict>

/** Give up looking this far above the count run (the layout, not the fleet, is the limit there). */
export const RIGHT_SIZE_MAX_UP = 20

/**
 * The next count to try, or the answer. `n` is the count run (its verdict is in `tried`), `estimate` a
 * first guess when it does not pass (about how many the failing check needs), and `cannotPass(k)` says
 * that k certainly fails without running it (e.g. it could not reach the target utilization).
 * `done: null` — no count up to n + RIGHT_SIZE_MAX_UP passes (or n gridlocks: the layout is the problem).
 */
export function nextRightSize(n: number, tried: Tried, estimate = n + 1, cannotPass: (k: number) => boolean = () => false):
  { next: number } | { done: number | null } {
  const v = tried[n]
  if (v === 'gridlock') return { done: null }
  if (passes(v)) {
    // Down: the lowest count in the unbroken run of passes below n.
    let k = n
    while (k > 1 && passes(tried[k - 1])) k--
    const below = k - 1
    if (below < 1 || (below in tried) || cannotPass(below)) return { done: k }
    return { next: below }
  }
  // Up: the smallest count above n that passes, once the one under it is known to fail (or is n).
  const above = Object.keys(tried).map(Number).filter(k => k > n)
  const lowestPass = above.filter(k => passes(tried[k])).sort((a, b) => a - b)[0]
  if (lowestPass != null) {
    const under = lowestPass - 1
    if (under === n || (under in tried && !passes(tried[under]))) return { done: lowestPass }
    return { next: under }
  }
  const highestFail = Math.max(n, ...above)
  const next = above.length ? highestFail + 1 : Math.max(n + 1, estimate)
  return next > n + RIGHT_SIZE_MAX_UP ? { done: null } : { next }
}
