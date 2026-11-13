// src/calc/sim/headline.ts — Run's deciding headline (owner, 2026-11-12/13): the static calculation from
// Step 3 beside what the simulation measured, and the three sizing checks that decide it. PURE.
// The run starts from the static calc's fleet and tests it; the stepper tests other counts. A fleet is
// right-sized only if it passes all three — orders delivered, utilization at or under the target, and
// charge keeping up — and oversized when one vehicle fewer passes them too.

import { engineFleetSold } from '@/src/calc/fleet'
import type { FleetSummary } from '@/src/calc/types'
import { VERDICT } from './results'
import type { SimResults, Verdict } from './types'

/** A tile's colour against its check. */
export type Tone = 'good' | 'warn' | 'bad' | ''
/** How the fleet tested comes out: all three pass (right), one fails (under), one fewer passes too (over). */
export type Outcome = 'right' | 'under' | 'over' | 'gridlock' | 'notRun'
export type CheckId = 'orders' | 'utilization' | 'battery'

export interface Headline {
  /** The static calc's fleet and the fleet the run places (the one being tested). */
  fleet: { static: number; tested: number }
  /** Check 1 — moves per hour delivered against the demand the run generates (all types). */
  perHr: { simulated: number | null; target: number; pass: boolean | null; tone: Tone }
  /** Check 2 — busy ÷ time not charging: what the static calc expects at its fleet, what the work needs.
   *  When moves fall short, `simulated` is what it would need (measured × demand ÷ moves done) and can
   *  be over 1. */
  utilization: { static: number | null; simulated: number | null; target: number; pass: boolean | null; tone: Tone }
  /** Check 3 — charge keeps up (judged over two days or more; null before): lowest charge (%), charge
   *  trips, the average charge each morning, why it failed, and the static calc's hours per charge. */
  battery: { socMin: number | null; chargeTrips: number | null; runHr: number | null; dayStarts: number[]; why: string | null; pass: boolean | null; tone: Tone
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
  verdictTone: Tone
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const lowOf = (types: SimResults['types'], k: 'shift' | 'day' | 'run') => {
  const xs = types.flatMap(t => (t.battery.lowest[k] != null ? [t.battery.lowest[k]!] : []))
  return xs.length ? Math.min(...xs) : null
}
const toneOf = (pass: boolean | null): Tone => (pass == null ? '' : pass ? 'good' : 'bad')

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
  const measured = res && vehicles > 0 ? sum(types.map(t => t.utilization * t.fleet)) / vehicles : null
  const short = perHr != null && demand > 0 && perHr < demand * VERDICT.MIN_DELIVERED
  const util = measured == null ? null : short ? measured * demand / Math.max(perHr!, 1e-9) : measured
  const socMin = types.length ? Math.min(...types.map(t => t.socMin)) : null

  const ran = !!res && types.length > 0
  const ordersPass = ran ? types.every(t => t.checks.orders) : null
  const utilPass = ran && util != null ? util <= target + 1e-9 : null
  const batteryJudged = types.filter(t => t.checks.battery != null)
  const batteryPass = ran && batteryJudged.length ? batteryJudged.every(t => t.checks.battery) : null
  const battWhy = types.find(t => t.checks.battery === false)?.battery.why ?? null

  const notRun = !!opts.unrunnable || (!!res && !types.length && !res.gridlock)
  const verdict = notRun || !res ? null : res.gridlock ? 'gridlock' : res.verdict
  let outcome: Outcome | null = null
  let setsFleet: Headline['setsFleet'] = null
  if (notRun) outcome = 'notRun'
  else if (res?.gridlock) outcome = 'gridlock'
  else if (ran && verdict !== 'warming') {
    if (ordersPass && utilPass && batteryPass !== false) {
      const fewer = Object.values(opts.oneFewer ?? {})
      outcome = fewer.some(v => v === 'meets') ? 'over' : 'right'
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
  return {
    fleet: { static: sum(groups.map(engineFleetSold)), tested },
    perHr: { simulated: perHr, target: demand, pass: ordersPass, tone: toneOf(ordersPass) },
    utilization: { static: cap > 0 ? sum(groups.map(g => g.groupRaw)) / cap : null, simulated: util, target, pass: utilPass, tone: toneOf(utilPass) },
    battery: {
      socMin, chargeTrips: res ? sum(types.map(t => t.chargeTrips)) : null, runHr: runHrs.length ? Math.min(...runHrs) : null,
      dayStarts: types[0]?.battery.dayStarts ?? [], why: battWhy, pass: batteryPass, tone: toneOf(batteryPass),
      lowest: { shift: lowOf(types, 'shift'), day: lowOf(types, 'day'), run: lowOf(types, 'run') },
    },
    speedFps: (() => { const ts = types.filter(t => t.avgSpeedFps != null); const w = sum(ts.map(t => t.fleet)); return w > 0 ? sum(ts.map(t => t.avgSpeedFps! * t.fleet)) / w : null })(),
    outcome, setsFleet, verdict, notRun,
    verdictTone: outcome === 'right' ? 'good' : outcome === 'over' ? 'warn' : outcome ? 'bad' : '',
  }
}
