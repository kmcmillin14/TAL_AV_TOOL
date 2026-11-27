// src/calc/sim/grades.ts — the three sizing checks graded on a scale, not pass/fail (owner, 2026-11-22). PURE.
// Each check lands in a band: green (good), amber (`tight` — it passes, with no spare capacity; the fleet still reads "Right-sized"), red (bad — it
// fails); utilization also has a blue "spare" band well under the target (the fleet may be oversized).
// One place for the band edges: the results, the headline, the verdict and the scales on screen read them.

import type { BatteryCause, Verdict } from './types'

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
/** A verdict that passes all three checks — "Meets", or `tight` (an amber check; it reads "Right-sized", the amber in that check's colour). */
export const verdictPasses = (v: Verdict | 'checking' | 'unknown' | null | undefined): boolean => v === 'meets' || v === 'tight'

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

/** The same work on `k` vehicles instead of `n`: busy time spread over k (an estimate the run then decides). */
export const utilizationAt = (u: number, n: number, k: number) => (k > 0 ? (u * n) / k : Infinity)
/** Could `k` vehicles pass utilization, judging by the run at `n`? (No: k is not worth running.) */
export const mayPassUtilization = (u: number, n: number, k: number, target: number) => gradePasses(gradeUtilization(utilizationAt(u, n, k), target))

/** About how many vehicles each failing check needs, from a run of `n`: orders by moves per hour delivered
 *  against the demand, utilization by spreading the work to the target, battery one more. The right-size
 *  search starts from the largest; the headline names it ("utilization sets the fleet → about 8"). */
export function fleetNeeds(n: number, f: { perHr: number; demand: number; util: number; target: number; fails: Partial<Record<CheckId, boolean>> }): { check: CheckId; n: number }[] {
  const need: { check: CheckId; n: number }[] = []
  if (f.fails.orders && f.perHr > 0) need.push({ check: 'orders', n: Math.ceil((n * f.demand) / f.perHr) })
  if (f.fails.utilization) need.push({ check: 'utilization', n: Math.ceil((n * f.util) / f.target) })
  if (f.fails.battery) need.push({ check: 'battery', n: n + 1 })
  return need.sort((a, b) => b.n - a.n)
}

const sagGrade = (pts: number): Grade => (pts > BANDS.battery.sagTight ? 'bad' : pts > BANDS.battery.sagGood ? 'tight' : 'good')

/** Battery: the worst of reaching the floor, how close the lowest came to it, the week's morning sag and
 *  the share of staffed time spent waiting for a free charger — and which of them set it (null when green). */
export function gradeBattery(f: { lowPct: number; floorPct: number; sagPts: number | null; waitShare: number }): { grade: Grade; cause: BatteryCause | null } {
  if (f.lowPct <= f.floorPct + 0.5) return { grade: 'bad', cause: 'floor' }
  const parts: [Grade, BatteryCause][] = [
    [f.sagPts == null ? 'good' : sagGrade(f.sagPts), 'sag'],
    [f.waitShare > BANDS.battery.waitTight ? 'bad' : f.waitShare > BANDS.battery.waitGood ? 'tight' : 'good', 'wait'],
    [f.lowPct <= f.floorPct + BANDS.battery.nearFloor ? 'tight' : 'good', 'near'],
  ]
  const grade = worstGrade(parts.map(([g]) => g))
  return { grade, cause: grade === 'good' ? null : parts.find(([g]) => g === grade)![1] }
}

/** A check's scale on screen: its range and coloured bands, left to right, and where a value sits (0–1). */
export interface Scale { bands: { from: number; to: number; grade: Grade }[]; pos: (v: number) => number }
/** `edges` run from the good end of the value; on screen the scale is mirrored — failing on the left, good on
 *  the right — so further right is always better (owner, 2026-11-27). */
const scale = (min: number, max: number, edges: [number, Grade][]): Scale => {
  let from = min
  const flip = (v: number) => 1 - (Math.min(v, max) - min) / (max - min)
  const bands = edges.map(([to, grade]) => { const b = { from: flip(to), to: flip(from), grade }; from = to; return b }).reverse()
  return { bands, pos: v => Math.max(0, Math.min(1, flip(v))) }
}

/** Every scale runs failing on the left to good on the right (owner, 2026-11-27): orders by moves short
 *  (% points, 0–10); utilization from 5 pts under its target to 25 over, good up to the target (spare capacity is a fleet-size question —
 *  the fleet's needs line shows it); battery by the morning sag (0–10 points). */
export function checkScale(check: CheckId, target = 0.85): Scale {
  if (check === 'orders') return scale(0, 10, [[BANDS.orders.good, 'good'], [BANDS.orders.tight, 'tight'], [10, 'bad']])
  if (check === 'battery') return scale(0, 10, [[BANDS.battery.sagGood, 'good'], [BANDS.battery.sagTight, 'tight'], [10, 'bad']])
  const tight = Math.min(1, target + BANDS.utilization.tightOver)
  // Around the target, as Orders and Battery are around their bands (owner, 2026-11-27): at or under it sits
  // at the green right end, 5 pts over in amber, beyond in red (over capacity at the far left).
  return scale(target - 0.05, target + 0.25, [[target, 'good'], [tight, 'tight'], [target + 0.25, 'bad']])
}
