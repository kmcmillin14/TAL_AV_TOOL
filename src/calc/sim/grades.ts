// src/calc/sim/grades.ts — the three sizing checks graded on a scale, not pass/fail (owner, 2026-11-22). PURE.
// Each check lands in a band: green (good), amber (tight — it passes, labelled "tight"), red (bad — it
// fails); utilization also has a blue "spare" band well under the target (the fleet may be oversized).
// One place for the band edges: the results, the headline, the verdict and the scales on screen read them.

import type { Verdict } from './types'

export type Grade = 'spare' | 'good' | 'tight' | 'bad'
export type CheckId = 'orders' | 'utilization' | 'battery'

/** Band edges (owner, 2026-11-22). Orders: moves short of the demand, % points. Utilization: points over the
 *  target (spare: this far under). Battery: next week's first morning below this week's, % points; time
 *  waiting for a free charger, share of staffed time; a vehicle this close to the cutsheet floor, % points. */
export const BANDS = {
  orders: { good: 0.5, tight: 3 },
  utilization: { spareUnder: 0.15, tightOver: 0.05 },
  battery: { sagGood: 2, sagTight: 5, waitGood: 0.01, waitTight: 0.02, nearFloor: 5 },
} as const

const RANK: Record<Grade, number> = { spare: 0, good: 0, tight: 1, bad: 2 }
/** The worst of several grades (spare and good rank alike; the first such is kept). */
export const worstGrade = (gs: Grade[]): Grade => gs.reduce((w, g) => (RANK[g] > RANK[w] ? g : w), gs[0] ?? 'good')
/** A grade that passes: everything but red. */
export const gradePasses = (g: Grade | null | undefined) => g != null && g !== 'bad'
/** A verdict that passes all three checks — "Meets", or "Tight" (an amber check). */
export const verdictPasses = (v: Verdict | 'checking' | null | undefined): boolean => v === 'meets' || v === 'tight'

/** Orders: `shortPct` = moves short of the demand, % points (0 = all delivered); a growing backlog fails. */
export function gradeOrders(shortPct: number, backlogGrowing = false): Grade {
  if (backlogGrowing || shortPct > BANDS.orders.tight) return 'bad'
  return shortPct > BANDS.orders.good ? 'tight' : 'good'
}

/** Utilization against its target (both 0–1). Over 100% always fails. */
export function gradeUtilization(u: number, target: number): Grade {
  if (u > 1 + 1e-9 || u > target + BANDS.utilization.tightOver + 1e-9) return 'bad'
  if (u > target + 1e-9) return 'tight'
  return u < target - BANDS.utilization.spareUnder ? 'spare' : 'good'
}

const sagGrade = (pts: number): Grade => (pts > BANDS.battery.sagTight ? 'bad' : pts > BANDS.battery.sagGood ? 'tight' : 'good')

/** Battery: the worst of reaching the floor, how close the lowest came to it, the week's morning sag and
 *  the share of staffed time spent waiting for a free charger. */
export function gradeBattery(f: { lowPct: number; floorPct: number; sagPts: number | null; waitShare: number }): Grade {
  if (f.lowPct <= f.floorPct + 0.5) return 'bad'
  const sag: Grade = f.sagPts == null ? 'good' : sagGrade(f.sagPts)
  const wait: Grade = f.waitShare > BANDS.battery.waitTight ? 'bad' : f.waitShare > BANDS.battery.waitGood ? 'tight' : 'good'
  const near: Grade = f.lowPct <= f.floorPct + BANDS.battery.nearFloor ? 'tight' : 'good'
  return worstGrade([sag, wait, near])
}

/** A check's scale on screen: its range and coloured bands, left to right, and where a value sits (0–1). */
export interface Scale { bands: { from: number; to: number; grade: Grade }[]; pos: (v: number) => number }
const scale = (min: number, max: number, edges: [number, Grade][]): Scale => {
  let from = min
  const bands = edges.map(([to, grade]) => { const b = { from: (from - min) / (max - min), to: (Math.min(to, max) - min) / (max - min), grade }; from = to; return b })
  return { bands, pos: v => Math.max(0, Math.min(1, (v - min) / (max - min))) }
}

/** Orders by moves short (% points, 0–10, left is better); utilization 0–110% around its target; battery by
 *  the morning sag (0–10 points). */
export function checkScale(check: CheckId, target = 0.85): Scale {
  if (check === 'orders') return scale(0, 10, [[BANDS.orders.good, 'good'], [BANDS.orders.tight, 'tight'], [10, 'bad']])
  if (check === 'battery') return scale(0, 10, [[BANDS.battery.sagGood, 'good'], [BANDS.battery.sagTight, 'tight'], [10, 'bad']])
  const tight = Math.min(1, target + BANDS.utilization.tightOver)
  return scale(0, 1.1, [[target - BANDS.utilization.spareUnder, 'spare'], [target, 'good'], [tight, 'tight'], [1.1, 'bad']])
}
