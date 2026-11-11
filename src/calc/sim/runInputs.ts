// src/calc/sim/runInputs.ts — what a run drives, from what was drawn. PURE.
// The drawn layout becomes the driven one: corners rounded to the largest turning radius among the
// fleet (spec §5.5) and the B56.5 rule applied — slowed where clearance is reduced, blocked where it
// is under the minimum (§5.9). Flows are the project's flows linked to points.

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { applyClearance, B56_5_RULE, envelopes, laneWidthFt, segmentClearances, type ClearanceRule, type SegmentClearance } from './clearance'
import { roundCorners } from './corners'
import { linkedFlows, type ProjectFlowLike } from './readiness'
import type { SimFlow, SimLayout } from './types'

export interface RunInputs {
  layout: SimLayout
  flows: SimFlow[]
  /** B56.5 result per drawn route (what was slowed or blocked, and why). */
  clearances: SegmentClearance[]
  /** Aisle width to draw per route of `layout`, ft — envelope (vehicle or pallet) plus B56.5
   *  clearances; a rounded corner takes the wider of the two routes it joins. */
  laneWidths: Record<string, number>
  /** Envelope a new route would carry, ft — the widest on the layout (0 when no vehicle is linked). */
  envelopeFt: number
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
  const laneWidths: Record<string, number> = {}
  for (const s of drawn.segments) {
    const w = laneWidthFt(s, env(s.id), rule)
    laneWidths[s.id] = w
    for (const j of [s.a, s.b]) laneWidths[`${j}~arc`] = Math.max(laneWidths[`${j}~arc`] ?? 0, w)   // corner at j (corners.ts)
  }
  const envelopeFt = Math.max(0, ...drawn.segments.map(s => env(s.id)))
  return { layout: roundCorners(applyClearance(drawn, clearances), radius), flows: linked, clearances, laneWidths, envelopeFt }
}

/** The project's B56.5 rule: its stored values, else the owner rule (D-2). */
export function clearanceRule(c?: { thresholdFps: number; lowSpeedIn: number; fullSpeedIn: number | null; sharedBetweenVehicles: boolean } | null): ClearanceRule {
  return c ? { thresholdFps: c.thresholdFps, lowSpeedIn: c.lowSpeedIn, fullSpeedIn: c.fullSpeedIn ?? B56_5_RULE.fullSpeedIn, sharedBetweenVehicles: c.sharedBetweenVehicles } : B56_5_RULE
}

/** The handled load from Step 1, ft: the longest and widest of the project's loads (each from its own
 *  dimension — a load with a width but no length still sets the width). Null when none is entered. */
export function payloadFt(loads: { lengthIn?: number | null; widthIn?: number | null }[] = []): { length: number; width: number } | null {
  const length = Math.max(0, ...loads.map(l => (l.lengthIn ?? 0) / 12)), width = Math.max(0, ...loads.map(l => (l.widthIn ?? 0) / 12))
  return length > 0 || width > 0 ? { length, width } : null
}

/** The fleet a run places: per vehicle type with a flow on the layout, the stepper's value if set,
 *  else the Fleet Engine's. Types with no linked flow are left out — they would only take homes. */
export function runFleet(engine: Record<string, number>, overrides: Record<string, number> = {}, linkedVehicleIds: string[]): Record<string, number> {
  return Object.fromEntries([...new Set(linkedVehicleIds)].map(vid => [vid, overrides[vid] ?? engine[vid] ?? 0]))
}
