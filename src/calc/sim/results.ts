// src/calc/sim/results.ts — results and verdict for a simulation run. PURE.
// Verdict is utilization-based against the project's own target utilization (spec §6.7, D-9).

import type { SimState } from './engine'
import { staffedSeconds } from './shift'
import type { SimResults, TimeSplit, TypeResult, VehicleResult, Verdict } from './types'

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
  // Rates are per staffed hour: off-shift time (no orders) is not counted.
  const hrs = staffedSeconds(S.P, S.t) / 3600
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
    // The three sizing checks (owner, 2026-11-13): orders delivered, utilization at or under the target,
    // and charge keeping up. Any failure is "Falls short"; all three pass is "Meets".
    const battery = batteryCheck(S, vid, veh)
    const checks = {
      orders: delivered >= VERDICT.MIN_DELIVERED && backlogTrend < VERDICT.BACKLOG_SHORT_PER_H,
      utilization: utilization <= S.P.targetUtilization + 1e-9,
      battery: battery.pass,
    }
    let verdict: Verdict
    if (S.gridlock) verdict = 'gridlock'
    else if (S.t < VERDICT.WARMUP_S) verdict = 'warming'
    else verdict = checks.orders && checks.utilization && checks.battery !== false ? 'meets' : 'short'
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
      checks, battery: battery.detail,
      avgSpeedFps: (() => { const mt = veh.reduce((a, v) => a + v.moveT, 0); return mt > 0 ? veh.reduce((a, v) => a + v.distFt, 0) / mt : null })(),
      backlogTrend, verdict,
    })
  }
  const vehicles: VehicleResult[] = S.veh.map(v => {
    const busy = v.tm.travel + v.tm.handle + v.tm.reposition + v.tm.wait
    return {
      id: v.id, vehicleId: v.prof.vehicle.id, done: v.done, perHr: hrs > 0 ? v.done / hrs : 0,
      utilization: busy + v.tm.idle > 0 ? busy / (busy + v.tm.idle) : 0,
      time: { ...v.tm }, soc: v.soc, socMin: v.socMin, chargeTrips: v.chargeTrips,
    }
  })
  const verdict = types.reduce<Verdict>((w, r) => (RANK[r.verdict] > RANK[w] ? r.verdict : w), types.length ? 'meets' : 'warming')
  const generated = S.flows.reduce((a, F) => a + F.gen, 0)
  const delivered = S.flows.reduce((a, F) => a + F.done, 0)
  const inProgress = S.orders.filter(o => o.v != null).length
  return {
    t: S.t,
    verdict: S.t < VERDICT.WARMUP_S && !S.gridlock ? 'warming' : verdict,
    types, vehicles,
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

/** The week's last morning may sit this far below its first before it counts as not recharged, % points. */
const WEEK_SAG_PCT = 2
/** Waiting for a free charger beyond this share of the vehicles' staffed time fails the check. */
const CHARGER_WAIT_SHARE = 0.02

/**
 * Charge keeps up (owner, 2026-11-13): judged once the run covers two days. Charge may fall from day to
 * day through the working week — what matters is that no vehicle drops below the level at which it must
 * charge, and that off-shift and days-off charging bring the fleet back by the start of the next week.
 * It fails when a vehicle drops below the charge level, when the next week's first morning is below
 * this week's, or when vehicles wait for a free charger more than 2% of their staffed time.
 */
function batteryCheck(S: SimState, vid: string, veh: SimState['veh']): { pass: boolean | null; detail: TypeResult['battery'] } {
  const b = S.profiles.get(vid)?.battery
  const ser = S.socSeries.get(vid) ?? []
  const days = Math.floor(S.t / 86400 + 1e-9)
  // Each morning's average charge: the first reading at or after midnight (the run's last reading for a
  // morning it ends on).
  const dayStarts = Array.from({ length: days + 1 }, (_, d) => (d === 0 ? ser[0] : ser.find(([t]) => t >= d * 86400 - 1e-6) ?? (d === days ? ser[ser.length - 1] : undefined))?.[2]).filter((x): x is number => x != null)
  const chargeWaitSec = veh.reduce((a, v) => a + v.chargeWaitT, 0)
  const floorPct = b?.chargeBelowPct ?? null
  // The lowest charge within the first shift, the first day and the whole run.
  const lowIn = (until: number) => { const xs = ser.filter(([t]) => t <= until + 1e-6).map(([, m]) => m); return xs.length ? Math.min(...xs) : null }
  const lowest = { shift: lowIn((S.P.shiftHr ?? Math.min(24, S.P.staffedHr)) * 3600), day: S.t >= 86400 - 1e-6 ? lowIn(86400) : null, run: lowIn(S.t) }
  const detail = (why: string | null) => ({ dayStarts, chargeWaitSec, floorPct, why, lowest })
  if (!b || !veh.length || days < 2) return { pass: null, detail: detail(null) }
  const low = Math.min(...veh.map(v => v.socMin))
  if (low < b.chargeBelowPct - 0.5) return { pass: false, detail: detail(`dropped to ${Math.round(low)}%, below the ${b.chargeBelowPct}% charge level`) }
  // With off-shift or days off the fleet should be back by next week's first morning; round the clock
  // there is no such morning — staying above the charge level is the test.
  const offTime = S.P.staffedHr < 24 || (S.P.daysPerWeek ?? 7) < 7
  if (offTime && days >= 7 && dayStarts.length >= 8 && dayStarts[7] < dayStarts[0] - WEEK_SAG_PCT) {
    return { pass: false, detail: detail(`not recharged by next week (${Math.round(dayStarts[0])}% → ${Math.round(dayStarts[7])}% on the first morning)`) }
  }
  const staffed = staffedSeconds(S.P, S.t) * veh.length
  if (staffed > 0 && chargeWaitSec / staffed > CHARGER_WAIT_SHARE) return { pass: false, detail: detail(`vehicles waited ${(chargeWaitSec / 3600).toFixed(1)} h for a free charger`) }
  return { pass: true, detail: detail(null) }
}

/** How a verdict reads on screen — Simulate's verdict rows and Sizing's chips. */
export const VERDICT_LABEL: Record<Verdict, string> = { meets: 'Meets', tight: 'Tight', short: 'Falls short', gridlock: 'Gridlock', warming: 'Warming up' }
