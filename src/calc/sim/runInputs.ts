// src/calc/sim/runInputs.ts — what a run drives, from what was drawn. PURE.
// The drawn layout becomes the driven one: corners rounded to the largest turning radius among the
// fleet (spec §5.5) and the B56.5 rule applied — slowed where clearance is reduced, blocked where it
// is under the minimum (§5.9). Flows are the project's flows linked to points.

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { applyClearance, envelopes, segmentClearances, type ClearanceRule, type SegmentClearance } from './clearance'
import { roundCorners } from './corners'
import { linkedFlows, type ProjectFlowLike } from './readiness'
import type { SimFlow, SimLayout } from './types'

export interface RunInputs {
  layout: SimLayout
  flows: SimFlow[]
  /** B56.5 result per drawn route (what was slowed or blocked, and why). */
  clearances: SegmentClearance[]
}

export function runInputs(
  drawn: SimLayout,
  flows: ProjectFlowLike[],
  vehicles: Map<string, Vehicle>,
  rule: ClearanceRule,
  payloadWidthFt: number,
): RunInputs {
  const linked = linkedFlows(flows)
  const veh = (id: string) => vehicles.get(id)
  const env = envelopes(drawn, linked.map(f => ({ ...f, vehicleWidthFt: veh(f.vehicleId)?.calc.widthFt ?? 0 })), payloadWidthFt)
  const clearances = segmentClearances(drawn, env, rule)
  const radius = Math.max(0, ...linked.map(f => veh(f.vehicleId)?.calc.turningRadiusFt ?? 0))
  return { layout: roundCorners(applyClearance(drawn, clearances), radius), flows: linked, clearances }
}
