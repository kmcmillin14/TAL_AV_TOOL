// src/calc/sim/headline.ts — Run's deciding headline (owner, 2026-11-12/13): the static calculation from
// Step 3 beside what the simulation measured, and the three sizing checks that decide it. PURE.
// The run starts from the static calc's fleet and tests it; the stepper tests other counts. A fleet is
// right-sized only if it passes all three — orders delivered, utilization at or under the target, and
// charge keeping up — and oversized when one vehicle fewer passes them too.

import { engineFleetSold } from '@/src/calc/fleet'
import type { FleetSummary } from '@/src/calc/types'
import { gradePasses, gradeUtilization, verdictPasses, worstGrade, type CheckId, type Grade } from './grades'
import type { BatteryCause, SimResults, Verdict } from './types'

export type { CheckId }

/** A tile's colour against its check. */
export type Tone = 'good' | 'warn' | 'bad' | ''
/** How the fleet tested comes out: all three pass (right), one fails (under), one fewer passes too (over). */
export type Outcome = 'right' | 'under' | 'over' | 'gridlock' | 'notRun'

export interface Headline {
  /** The static calc's fleet and the fleet the run places (the one being tested). */
  fleet: { static: number; tested: number }
  /** Check 1 — moves per hour delivered against the demand the run generates (all types). */
  perHr: { simulated: number | null; target: number; pass: boolean | null; tone: Tone; grade: Grade | null
    /** Moves short of the demand, % points, the worst type (its scale's value). */
    shortPct: number | null
    /** The run's totals: moves delivered on time against the moves the stations called for. */
    moves: { delivered: number; demanded: number } | null }
  /** Check 2 — busy ÷ the shift's time not charging: what the static calc expects at its fleet, what the
   *  work needs (with overtime and unfinished orders — over 1 when the fleet is too small). */
  utilization: { static: number | null; simulated: number | null; target: number; pass: boolean | null; tone: Tone; grade: Grade | null
    /** Low enough to try one vehicle fewer: about what N − 1 would run at (≤ the target), else null. */
    fewerAt: number | null }
  /** Check 3 — charge keeps up (judged over two days or more; null before): lowest charge (%), charge
   *  trips, the average charge each morning, why it failed, and the static calc's hours per charge. */
  battery: { socMin: number | null; chargeTrips: number | null; runHr: number | null; dayStarts: number[]; why: string | null; pass: boolean | null; tone: Tone; grade: Grade | null
    /** Next week's first morning below this week's, % points, the worst type (the battery scale's value). */
    sagPts: number | null
    /** What set a grade worse than green — named on Simulate's battery line when it is not the sag. */
    cause: BatteryCause | null
    /** Lowest charge in the first shift, the first day and the whole run (%), the lowest of the types. */
    lowest: { shift: number | null; day: number | null; run: number | null } }
  /** Average speed while moving across the fleet, ft/s (feet driven ÷ seconds moving, all types). */
  speedFps: number | null
  /** null while the run is going. */
  outcome: Outcome | null
  /** Undersized: the check that needs the most vehicles, and about how many. */
  setsFleet: { check: CheckId; n: number } | null
  /** The run's own verdict word (kept for Sizing's chip). */
  verdict: Verdict | null
  notRun: boolean
  /** The checks that pass but are amber: a right-sized fleet with these has no spare capacity there (amber tone). */
  tight: CheckId[]
  verdictTone: Tone
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const lowOf = (types: SimResults['types'], k: 'shift' | 'day' | 'run') => {
  const xs = types.flatMap(t => (t.battery.lowest[k] != null ? [t.battery.lowest[k]!] : []))
  return xs.length ? Math.min(...xs) : null
}
/** A grade's tile colour: amber for tight, red for bad; spare and good read green. */
const toneOf = (g: Grade | null): Tone => (g == null ? '' : g === 'bad' ? 'bad' : g === 'tight' ? 'warn' : 'good')

export function runHeadline(
  fleet: FleetSummary, placed: Record<string, number>, res: SimResults | null,
  flows: { vehicleId: string; thruPerHr: number }[], demandPct: number,
  opts: { unrunnable?: boolean; targetUtilization?: number; oneFewer?: Record<string, Verdict | 'checking'> } = {},
): Headline {
  const target = opts.targetUtilization ?? fleet.targetUtilization
  const groups = fleet.groups.filter(g => g.vehicleId in placed)
  const cap = sum(groups.map(g => engineFleetSold(g) * (g.charging.availability ?? 1)))
  const runHrs = groups.flatMap(g => (g.charging.runHr != null ? [g.charging.runHr] : []))
  const types = (res?.types ?? []).filter(t => t.vehicleId in placed && t.fleet > 0)
  const vehicles = sum(types.map(t => t.fleet)), done = sum(types.map(t => t.done))
  const tested = sum(Object.values(placed))
  // The demand the run generates — the engine's rate per flow (thruPerHr × demand %).
  const demand = sum(flows.filter(f => f.vehicleId in placed).map(f => (f.thruPerHr * demandPct) / 100))
  const perHr = res ? sum(types.map(t => t.perHr)) : null
  // The run's utilization already counts overtime and unfinished orders (results.ts), so over capacity
  // reads over 100% without scaling here.
  const util = res && vehicles > 0 ? sum(types.map(t => t.utilization * t.fleet)) / vehicles : null
  const socMin = types.length ? Math.min(...types.map(t => t.socMin)) : null

  const ran = !!res && types.length > 0
  // Graded (owner, 2026-11-22): each check's worst band across types (utilization on the fleet's own figure);
  // a check passes unless red.
  const ordersGrade = ran ? worstGrade(types.map(t => t.grades.orders)) : null
  const utilGrade = ran && util != null ? gradeUtilization(util, target) : null
  const batteryGrades = types.flatMap(t => (t.grades.battery ? [t.grades.battery] : []))
  const batteryGrade = ran && batteryGrades.length ? worstGrade(batteryGrades) : null
  const ordersPass = ordersGrade && gradePasses(ordersGrade), utilPass = utilGrade && gradePasses(utilGrade), batteryPass = batteryGrade && gradePasses(batteryGrade)
  const fewer = utilPass && tested > 1 && util != null ? (util * tested) / (tested - 1) : null
  const fewerAt = fewer != null && fewer <= target ? fewer : null
  const battFrom = types.find(t => t.grades.battery && t.grades.battery !== 'good')?.battery
  const battWhy = battFrom?.why ?? null
  const shortPct = ran ? Math.max(...types.map(t => Math.max(0, (1 - t.delivered) * 100))) : null
  const sags = types.flatMap(t => (t.battery.sagPts != null ? [t.battery.sagPts] : []))

  const notRun = !!opts.unrunnable || (!!res && !types.length && !res.gridlock)
  const verdict = notRun || !res ? null : res.gridlock ? 'gridlock' : res.verdict
  let outcome: Outcome | null = null
  let setsFleet: Headline['setsFleet'] = null
  if (notRun) outcome = 'notRun'
  else if (res?.gridlock) outcome = 'gridlock'
  else if (ran && verdict !== 'warming') {
    if (ordersPass && utilPass && batteryPass !== false) {
      const fewer = Object.values(opts.oneFewer ?? {})
      outcome = fewer.some(verdictPasses) ? 'over' : 'right'
    } else {
      outcome = 'under'
      // About how many vehicles each failing check needs; the largest sets the fleet.
      const need: { check: CheckId; n: number }[] = []
      if (!ordersPass && perHr) need.push({ check: 'orders', n: Math.ceil(tested * demand / perHr) })
      if (!utilPass && util != null) need.push({ check: 'utilization', n: Math.ceil(tested * util / target) })
      if (batteryPass === false) need.push({ check: 'battery', n: tested + 1 })
      setsFleet = need.sort((a, b) => b.n - a.n)[0] ?? null
    }
  }
  const tightAny = [ordersGrade, utilGrade, batteryGrade].includes('tight')
  return {
    fleet: { static: sum(groups.map(engineFleetSold)), tested },
    perHr: { simulated: perHr, target: demand, pass: ordersPass, tone: toneOf(ordersGrade), grade: ordersGrade, shortPct,
      moves: ran ? { delivered: sum(types.map(t => t.done)), demanded: sum(types.map(t => t.generated)) } : null },
    utilization: {
      static: cap > 0 ? sum(groups.map(g => g.groupRaw)) / cap : null, simulated: util, target, pass: utilPass,
      // The same work on one vehicle fewer: busy time spread over N − 1 (an estimate; the one-fewer run decides).
      fewerAt, tone: fewerAt != null ? 'warn' : toneOf(utilGrade), grade: utilGrade,
    },
    battery: {
      socMin, chargeTrips: res ? sum(types.map(t => t.chargeTrips)) : null, runHr: runHrs.length ? Math.min(...runHrs) : null,
      dayStarts: types[0]?.battery.dayStarts ?? [], why: battWhy, pass: batteryPass, tone: toneOf(batteryGrade), grade: batteryGrade,
      sagPts: sags.length ? Math.max(...sags) : null, cause: battFrom?.cause ?? null,
      lowest: { shift: lowOf(types, 'shift'), day: lowOf(types, 'day'), run: lowOf(types, 'run') },
    },
    speedFps: (() => { const ts = types.filter(t => t.avgSpeedFps != null); const w = sum(ts.map(t => t.fleet)); return w > 0 ? sum(ts.map(t => t.avgSpeedFps! * t.fleet)) / w : null })(),
    outcome, setsFleet, verdict, notRun,
    tight: ([['orders', ordersGrade], ['utilization', utilGrade], ['battery', batteryGrade]] as const).filter(([, g]) => g === 'tight').map(([c]) => c),
    verdictTone: outcome === 'right' ? (tightAny ? 'warn' : 'good') : outcome === 'over' ? 'warn' : outcome ? 'bad' : '',
  }
}
