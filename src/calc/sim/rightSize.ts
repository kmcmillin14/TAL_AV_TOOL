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
 * first guess when it does not pass (about how many the failing checks need), and `cannotPass(k)` says
 * that k certainly fails without running it (it could not reach the target utilization).
 * Until a count passes, it goes up from the estimate; once one has, it tries the lowest count under it that
 * might still pass, then halves the range — so an oversized fleet jumps straight down rather than stepping
 * one vehicle at a time — until the count under the lowest pass is known to fail.
 * `done: null` — no count up to n + RIGHT_SIZE_MAX_UP passes (or n gridlocks: the layout is the problem).
 */
export function nextRightSize(n: number, tried: Tried, estimate = n + 1, cannotPass: (k: number) => boolean = () => false):
  { next: number } | { done: number | null } {
  if (tried[n] === 'gridlock') return { done: null }
  const ks = Object.keys(tried).map(Number)
  const lowestPass = ks.filter(k => passes(tried[k])).sort((a, b) => a - b)[0]
  if (lowestPass == null) {
    const highest = Math.max(...ks)
    const next = highest > n ? highest + 1 : Math.max(n + 1, estimate)
    return next > n + RIGHT_SIZE_MAX_UP ? { done: null } : { next }
  }
  // Between the highest failure under the lowest pass and it: the lowest count that might pass first (the
  // estimate when the run was well under its target), then halve what is left.
  const fails = ks.filter(k => k < lowestPass && !passes(tried[k]))
  let lo = Math.max(1, ...fails.map(f => f + 1))
  while (lo < lowestPass && cannotPass(lo)) lo++
  const hi = lowestPass - 1
  if (lo > hi) return { done: lowestPass }
  return { next: fails.length || lo === hi ? Math.floor((lo + hi) / 2) : lo }
}
