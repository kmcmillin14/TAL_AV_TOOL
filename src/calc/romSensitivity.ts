// src/calc/romSensitivity.ts — resilience / what-if recompute. PURE.
// No React, no fetch, no localStorage, no fs.
import type { FleetSummary } from './types'

export interface ResilienceInput { fleet: FleetSummary }
export interface ResilienceResult { throughputHeldWithOneDown: boolean; retainedPct: number }

/** Can the operation hold throughput if one vehicle is offline? For each vehicle type the
 *  available units drop by 1; throughput is held only if the remaining provisioned units
 *  still cover the raw (fractional) demand for every type. retainedPct is the worst-type
 *  ratio of (sold−1) capacity to demand, capped at 1. */
export function resilience(input: ResilienceInput): ResilienceResult {
  const groups = input.fleet.groups
  if (groups.length === 0) return { throughputHeldWithOneDown: true, retainedPct: 1 }
  let held = true
  let worst = 1
  for (const g of groups) {
    if (g.groupRaw <= 0) continue
    const remaining = Math.max(0, g.fleetSold - 1)
    const ratio = Math.min(1, remaining / g.groupRaw)
    if (remaining < g.groupRaw) held = false
    if (ratio < worst) worst = ratio
  }
  return { throughputHeldWithOneDown: held, retainedPct: worst }
}
