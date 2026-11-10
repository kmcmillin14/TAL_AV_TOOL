// src/calc/sim/results.ts — results and verdict for a simulation run. PURE.
// Verdict is utilization-based against the project's own target utilization (spec §6.7, D-9).

import type { SimState } from './engine'
import type { SimResults, TimeSplit, TypeResult, Verdict } from './types'

export const VERDICT = {
  /** Minimum simulated time before any verdict but "Warming up". */
  WARMUP_S: 1800,
  /** Share of generated moves that must be delivered or under way. */
  MIN_DELIVERED: 0.98,
  /** Utilization above this is "Falls short" whatever the target. */
  UTIL_SHORT: 0.95,
  /** Waiting orders added per hour that count as a growing backlog. */
  BACKLOG_SHORT_PER_H: 1,
} as const

const RANK: Record<Verdict, number> = { warming: 0, meets: 1, tight: 2, short: 3, gridlock: 4 }
export const emptySplit = (): TimeSplit => ({ travel: 0, handle: 0, reposition: 0, wait: 0, charge: 0, idle: 0 })

export function results(S: SimState): SimResults {
  const hrs = S.t / 3600
  const types: TypeResult[] = []
  for (const [vid, prof] of S.profiles) {
    const flows = S.flows.filter(F => F.f.vehicleId === vid)
    const veh = S.veh.filter(v => v.prof.vehicle.id === vid)
    const gen = flows.reduce((a, F) => a + F.gen, 0)
    const done = flows.reduce((a, F) => a + F.done, 0)
    const disp = flows.reduce((a, F) => a + F.dispatched, 0)
    const waitSum = flows.reduce((a, F) => a + F.waitSum, 0)
    const inProgress = S.orders.filter(o => o.v != null && o.F.f.vehicleId === vid).length
    const time = emptySplit()
    for (const v of veh) for (const k of Object.keys(time) as (keyof TimeSplit)[]) time[k] += v.tm[k]
    const busy = time.travel + time.handle + time.reposition + time.wait
    const available = busy + time.idle
    const utilization = available > 0 ? busy / available : 0
    const ser = S.series.get(vid) ?? []
    const last = ser.length - 1
    const backlogTrend = ser.length > 60 ? ser[last][1] - ser[last - 60][1] : 0
    const delivered = gen > 0 ? (done + inProgress) / gen : 1
    let verdict: Verdict
    if (S.gridlock) verdict = 'gridlock'
    else if (S.t < VERDICT.WARMUP_S) verdict = 'warming'
    else if (delivered < VERDICT.MIN_DELIVERED || backlogTrend >= VERDICT.BACKLOG_SHORT_PER_H || utilization > VERDICT.UTIL_SHORT) verdict = 'short'
    else if (utilization > S.P.targetUtilization || backlogTrend > 0) verdict = 'tight'
    else verdict = 'meets'
    const socs = veh.map(v => v.soc)
    types.push({
      vehicleId: vid, fleet: veh.length,
      target: flows.reduce((a, F) => a + F.rate, 0),
      perHr: hrs > 0 ? done / hrs : 0, done, generated: gen, delivered,
      avgWait: disp ? waitSum / disp : 0,
      utilization,
      vehicleSecPerMove: done > 0 ? busy / done : null,
      time,
      socAvg: socs.length ? socs.reduce((a, b) => a + b, 0) / socs.length : 0,
      socMin: veh.length ? Math.min(...veh.map(v => v.socMin)) : 0,
      chargeTrips: veh.reduce((a, v) => a + v.chargeTrips, 0),
      backlogTrend, verdict,
    })
  }
  const verdict = types.reduce<Verdict>((w, r) => (RANK[r.verdict] > RANK[w] ? r.verdict : w), types.length ? 'meets' : 'warming')
  const generated = S.flows.reduce((a, F) => a + F.gen, 0)
  const delivered = S.flows.reduce((a, F) => a + F.done, 0)
  const inProgress = S.orders.filter(o => o.v != null).length
  return {
    t: S.t,
    verdict: S.t < VERDICT.WARMUP_S && !S.gridlock ? 'warming' : verdict,
    types,
    flows: S.flows.map(F => ({
      flowId: F.f.id, measuredFt: F.measuredFt, perHr: hrs > 0 ? F.done / hrs : 0,
      mission: F.done ? F.misSum / F.done : null, wait: F.dispatched ? F.waitSum / F.dispatched : null,
    })),
    gridlock: S.gridlock,
    flags: S.flags,
    excluded: S.excluded,
    orders: { generated, delivered, inProgress, waiting: S.orders.filter(o => o.v == null).length },
  }
}
