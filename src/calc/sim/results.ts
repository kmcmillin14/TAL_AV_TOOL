// src/calc/sim/results.ts — results and verdict for a simulation run. PURE.
// Verdict is utilization-based against the project's own target utilization (spec §6.7, D-9).

import type { SimState } from './engine'
import { BANDS, gradeBattery, gradeOrders, gradePasses, gradeUtilization, worstGrade, type Grade } from './grades'
import { staffedSeconds } from './shift'
import type { SimResults, TimeSplit, TypeResult, VehicleResult, Verdict } from './types'

export const VERDICT = {
  /** Minimum simulated time before any verdict but "Warming up". */
  WARMUP_S: 1800,
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
    // Moves finished off-shift are the backlog worked off after hours — late, not delivered on time.
    const done = flows.reduce((a, F) => a + F.done - F.late, 0)
    const disp = flows.reduce((a, F) => a + F.dispatched, 0)
    const waitSum = flows.reduce((a, F) => a + F.waitSum, 0)
    const inProgress = S.orders.filter(o => o.v != null && o.F.f.vehicleId === vid).length
    const time = emptySplit()
    for (const v of veh) for (const k of Object.keys(time) as (keyof TimeSplit)[]) time[k] += v.tm[k]
    const busy = time.travel + time.handle + time.reposition + time.wait
    // Utilization is busy ÷ the shift's working time (not charging). Busy time off-shift — catching up a
    // backlog — is overtime: it counts as work but adds no capacity, so an undersized fleet reads over 100%.
    const busyOff = veh.reduce((a, v) => a + v.busyOff, 0)
    const available = busy - busyOff + time.idle
    // Orders never finished (still waiting at the end) would need more busy time again, in proportion.
    const finished = flows.reduce((a, F) => a + F.done, 0) + inProgress
    const utilization = available > 0 ? (busy / available) * (finished > 0 && finished < gen ? gen / finished : 1) : 0
    const ser = S.series.get(vid) ?? []
    const last = ser.length - 1
    const backlogTrend = ser.length > 60 ? ser[last][1] - ser[last - 60][1] : 0
    const delivered = gen > 0 ? (done + inProgress) / gen : 1
    // The three sizing checks (owner, 2026-11-13), graded (owner, 2026-11-22): orders delivered,
    // utilization against the target, and charge keeping up — green, amber ("tight", still passing) or red.
    // Any red is "Falls short"; any amber "Tight"; all green "Meets".
    const battery = batteryCheck(S, vid, veh)
    const grades = {
      orders: gradeOrders(Math.max(0, (1 - delivered) * 100), backlogTrend >= VERDICT.BACKLOG_SHORT_PER_H),
      utilization: gradeUtilization(utilization, S.P.targetUtilization),
      battery: battery.grade,
    }
    const checks = { orders: gradePasses(grades.orders), utilization: gradePasses(grades.utilization), battery: battery.grade && gradePasses(battery.grade) }
    let verdict: Verdict
    if (S.gridlock) verdict = 'gridlock'
    else if (S.t < VERDICT.WARMUP_S) verdict = 'warming'
    else {
      const g = worstGrade([grades.orders, grades.utilization, ...(grades.battery ? [grades.battery] : [])])
      verdict = g === 'bad' ? 'short' : g === 'tight' ? 'tight' : 'meets'
    }
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
      grades,
      checks, battery: battery.detail,
      avgSpeedFps: (() => { const mt = veh.reduce((a, v) => a + v.moveT, 0); return mt > 0 ? veh.reduce((a, v) => a + v.distFt, 0) / mt : null })(),
      backlogTrend, verdict,
    })
  }
  const vehicles: VehicleResult[] = S.veh.map(v => {
    const busy = v.tm.travel + v.tm.handle + v.tm.reposition + v.tm.wait
    return {
      id: v.id, vehicleId: v.prof.vehicle.id, done: v.done, perHr: hrs > 0 ? v.done / hrs : 0,
      utilization: busy - v.busyOff + v.tm.idle > 0 ? busy / (busy - v.busyOff + v.tm.idle) : 0,
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
      flowId: F.f.id, measuredFt: F.measuredFt, perHr: hrs > 0 ? (F.done - F.late) / hrs : 0,
      mission: F.done ? F.misSum / F.done : null, wait: F.dispatched ? F.waitSum / F.dispatched : null,
    })),
    gridlock: S.gridlock,
    flags: S.flags,
    excluded: S.excluded,
    orders: { generated, delivered, inProgress, waiting: S.orders.filter(o => o.v == null).length },
  }
}

/**
 * Charge keeps up (owner, 2026-11-13): judged once the run covers two days. Charge may fall from day to
 * day through the working week — what matters is that vehicles charge when they reach the charge level
 * without running flat, and that off-shift and days-off charging bring the fleet back by the start of
 * the next week. It fails when a vehicle reaches the cutsheet floor, when the next week's first morning
 * is below this week's, or when vehicles wait for a free charger more than 2% of their staffed time.
 */
function batteryCheck(S: SimState, vid: string, veh: SimState['veh']): { grade: Grade | null; detail: TypeResult['battery'] } {
  const b = S.profiles.get(vid)?.battery
  const ser = S.socSeries.get(vid) ?? []
  const days = Math.floor(S.t / 86400 + 1e-9)
  // Each morning's average charge: the first reading at or after midnight (the run's last reading for a
  // morning it ends on).
  const dayStarts = Array.from({ length: days + 1 }, (_, d) => (d === 0 ? ser[0] : ser.find(([t]) => t >= d * 86400 - 1e-6) ?? (d === days ? ser[ser.length - 1] : undefined))?.[2]).filter((x): x is number => x != null)
  const chargeWaitSec = veh.reduce((a, v) => a + v.chargeWaitT, 0)
  const floorPct = b?.minSocPct ?? null
  // The lowest charge within the first shift, the first day and the whole run.
  const lowIn = (until: number) => { const xs = ser.filter(([t]) => t <= until + 1e-6).map(([, m]) => m); return xs.length ? Math.min(...xs) : null }
  const lowest = { shift: lowIn((S.P.shiftHr ?? Math.min(24, S.P.staffedHr)) * 3600), day: S.t >= 86400 - 1e-6 ? lowIn(86400) : null, run: lowIn(S.t) }
  // With off-shift or days off the fleet should be back by next week's first morning; round the clock
  // there is no such morning — staying clear of the floor and the chargers' queue is the test.
  const offTime = S.P.staffedHr < 24 || (S.P.daysPerWeek ?? 7) < 7
  const sagPts = offTime && days >= 7 && dayStarts.length >= 8 ? Math.max(0, dayStarts[0] - dayStarts[7]) : null
  const detail = (why: string | null) => ({ dayStarts, chargeWaitSec, floorPct, why, lowest, sagPts })
  if (!b || !veh.length || days < 2) return { grade: null, detail: detail(null) }
  const low = Math.min(...veh.map(v => v.socMin))
  const staffed = staffedSeconds(S.P, S.t) * veh.length
  const waitShare = staffed > 0 ? chargeWaitSec / staffed : 0
  const grade = gradeBattery({ lowPct: low, floorPct: b.minSocPct, sagPts, waitShare })
  // Why, for the worst factor: the floor, then the week's sag, then the chargers' queue, then nearing the floor.
  const why = grade === 'good' ? null
    : low <= b.minSocPct + 0.5 ? `a vehicle reached the ${b.minSocPct}% floor`
    : sagPts != null && sagPts > BANDS.battery.sagGood ? `${grade === 'bad' ? 'not recharged' : 'nearly recharged'} by next week (${Math.round(dayStarts[0])}% → ${Math.round(dayStarts[7])}% on the first morning)`
    : waitShare > BANDS.battery.waitGood ? `vehicles waited ${(chargeWaitSec / 3600).toFixed(1)} h for a free charger`
    : `a vehicle came within ${BANDS.battery.nearFloor} pts of the ${b.minSocPct}% floor`
  return { grade, detail: detail(why) }
}

/** How a verdict reads on screen — Simulate's verdict rows and Sizing's chips. */
export const VERDICT_LABEL: Record<Verdict, string> = { meets: 'Meets', tight: 'Tight', short: 'Falls short', gridlock: 'Gridlock', warming: 'Warming up' }
