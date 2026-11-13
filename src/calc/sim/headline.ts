// src/calc/sim/headline.ts — Run's deciding headline (owner, 2026-11-12): the static calculation from
// Step 3 beside what the simulation measured, for the vehicle types the run places. PURE.
// The run starts from the static calc's fleet and tests it; the stepper tests other counts.

import { engineFleetSold } from '@/src/calc/fleet'
import type { FleetSummary } from '@/src/calc/types'
import { VERDICT } from './results'
import type { SimResults, Verdict } from './types'

/** A tile's colour against its goal — the verdict's own thresholds (results.ts `VERDICT`). */
export type Tone = 'good' | 'warn' | 'bad' | ''

export interface Headline {
  /** The static calc's fleet and the fleet the run places (the one being tested). */
  fleet: { static: number; tested: number }
  /** Busy ÷ time not charging: what the static calc expects at its fleet, what the run needs. When the
   *  fleet cannot keep up (moves short of the demand), `simulated` is what it would need — measured
   *  utilization × demand ÷ moves done — and can be over 1 (shown as its real %, "over by …"). */
  utilization: { static: number | null; simulated: number | null; target: number; tone: Tone }
  /** Moves per hour delivered against the demand the run generates (all types). */
  perHr: { simulated: number | null; target: number; tone: Tone }
  /** Lowest state of charge any placed vehicle reached (%), charge trips, the static calc's hours per charge. */
  battery: { socMin: number | null; chargeTrips: number | null; runHr: number | null; tone: Tone }
  /** Average order wait — created to a vehicle sent — s, weighted by moves done. */
  waitSec: number | null
  /** The run's verdict; null while it runs. `notRun`: the shift ended (or cannot start) with nothing run. */
  verdict: Verdict | null
  notRun: boolean
  verdictTone: Tone
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Lowest charge this high (%) is comfortable; below the second it is a problem. */
const SOC_OK = 30, SOC_LOW = 20

export function runHeadline(
  fleet: FleetSummary, placed: Record<string, number>, res: SimResults | null,
  flows: { vehicleId: string; thruPerHr: number }[], demandPct: number, unrunnable = false,
): Headline {
  const groups = fleet.groups.filter(g => g.vehicleId in placed)
  const cap = sum(groups.map(g => engineFleetSold(g) * (g.charging.availability ?? 1)))
  const runHrs = groups.flatMap(g => (g.charging.runHr != null ? [g.charging.runHr] : []))
  const types = (res?.types ?? []).filter(t => t.vehicleId in placed && t.fleet > 0)
  const vehicles = sum(types.map(t => t.fleet)), done = sum(types.map(t => t.done))
  // The demand the run generates — the engine's rate per flow (thruPerHr × demand %).
  const target = sum(flows.filter(f => f.vehicleId in placed).map(f => (f.thruPerHr * demandPct) / 100))
  const perHr = res ? sum(types.map(t => t.perHr)) : null
  const measured = res && vehicles > 0 ? sum(types.map(t => t.utilization * t.fleet)) / vehicles : null
  const short = perHr != null && target > 0 && perHr < target * VERDICT.MIN_DELIVERED
  const util = measured == null ? null : short ? measured * target / Math.max(perHr!, 1e-9) : measured
  const socMin = types.length ? Math.min(...types.map(t => t.socMin)) : null
  const notRun = unrunnable || (!!res && !types.length && !res.gridlock)
  const verdict = notRun || !res ? null : res.gridlock ? 'gridlock' : res.verdict
  return {
    fleet: { static: sum(groups.map(engineFleetSold)), tested: sum(Object.values(placed)) },
    utilization: {
      static: cap > 0 ? sum(groups.map(g => g.groupRaw)) / cap : null, simulated: util, target: fleet.targetUtilization,
      tone: util == null ? '' : util <= fleet.targetUtilization ? 'good' : util <= VERDICT.UTIL_SHORT ? 'warn' : 'bad',
    },
    perHr: {
      simulated: perHr, target,
      tone: perHr == null || !target ? '' : perHr / target >= VERDICT.MIN_DELIVERED ? 'good' : perHr / target >= 0.9 ? 'warn' : 'bad',
    },
    battery: {
      socMin, chargeTrips: res ? sum(types.map(t => t.chargeTrips)) : null, runHr: runHrs.length ? Math.min(...runHrs) : null,
      tone: socMin == null ? '' : socMin >= SOC_OK ? 'good' : socMin >= SOC_LOW ? 'warn' : 'bad',
    },
    waitSec: done > 0 ? sum(types.map(t => t.avgWait * t.done)) / done : null,
    verdict, notRun,
    verdictTone: notRun ? 'bad' : !verdict || verdict === 'warming' ? '' : verdict === 'meets' ? 'good' : verdict === 'tight' ? 'warn' : 'bad',
  }
}
