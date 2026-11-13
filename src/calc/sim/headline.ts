// src/calc/sim/headline.ts — Run's deciding headline (owner, 2026-11-12): the static calculation from
// Step 3 beside what the simulation measured, for the vehicle types the run places. PURE.
// The run starts from the static calc's fleet and tests it; the stepper tests other counts.

import { engineFleetSold, staticUtilization } from '@/src/calc/fleet'
import type { FleetSummary } from '@/src/calc/types'
import type { SimResults, Verdict } from './types'

export interface Headline {
  /** The static calc's fleet and the fleet the run places (the one being tested). */
  fleet: { static: number; tested: number }
  /** Busy ÷ time not charging: what the static calc expects at its fleet, what the run measured. */
  utilization: { static: number | null; simulated: number | null; target: number }
  /** Moves per hour delivered against the demand (all types). */
  perHr: { simulated: number | null; target: number }
  /** Lowest state of charge any vehicle reached (%), charge trips, and the static calc's hours per charge. */
  battery: { socMin: number | null; chargeTrips: number | null; runHr: number | null }
  /** Average order wait, s (weighted by moves delivered). */
  waitSec: number | null
  verdict: Verdict | null
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function runHeadline(fleet: FleetSummary, placed: Record<string, number>, res: SimResults | null, targetPerHr: number): Headline {
  const groups = fleet.groups.filter(g => g.vehicleId in placed)
  const staticN = sum(groups.map(engineFleetSold))
  const cap = sum(groups.map(g => engineFleetSold(g) * (g.charging.availability ?? 1)))
  const runHrs = groups.flatMap(g => (g.charging.runHr != null ? [g.charging.runHr] : []))
  const types = res?.types.filter(t => t.vehicleId in placed) ?? []
  const vehicles = sum(types.map(t => t.fleet)), delivered = sum(types.map(t => t.delivered))
  return {
    fleet: { static: staticN, tested: sum(Object.values(placed)) },
    utilization: {
      static: groups.length === 1 ? staticUtilization(groups[0], engineFleetSold(groups[0])) : cap > 0 ? sum(groups.map(g => g.groupRaw)) / cap : null,
      simulated: res && vehicles > 0 ? sum(types.map(t => t.utilization * t.fleet)) / vehicles : null,
      target: fleet.targetUtilization,
    },
    perHr: { simulated: res ? sum(types.map(t => t.perHr)) : null, target: res ? sum(types.map(t => t.target)) : targetPerHr },
    battery: {
      socMin: types.length ? Math.min(...types.map(t => t.socMin)) : null,
      chargeTrips: res ? sum(types.map(t => t.chargeTrips)) : null,
      runHr: runHrs.length ? Math.min(...runHrs) : null,
    },
    waitSec: delivered > 0 ? sum(types.map(t => t.avgWait * t.delivered)) / delivered : null,
    verdict: res ? (res.gridlock ? 'gridlock' : res.verdict) : null,
  }
}
