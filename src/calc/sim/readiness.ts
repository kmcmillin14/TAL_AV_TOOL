// src/calc/sim/readiness.ts — can this project's simulation run yet? PURE: no React, no I/O.
// Spec v2 §5.1 and acceptance 1: with no layout, Run is disabled and no numbers are shown.

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { flowExclusion } from './engine'
import { buildGraph } from './graph'
import type { SimFlow, SimLayout } from './types'

/** The one thing standing between the project and a run, in the order an engineer fixes them. */
export type RunBlocker =
  /** No routes drawn (no layout, or a layout with no segments). */
  | 'noRoutes'
  /** A drawing is loaded but its scale is not set — distances would be wrong. */
  | 'unscaled'
  /** No flow the engine can run: linked Pick → Drop, connected by routes, with a vehicle and moves/h. */
  | 'noFlows'

/** A project flow as stored: point links, rate and vehicle are all optional until filled in. */
export type ProjectFlowLike = Pick<SimFlow, 'id'> & Partial<Omit<SimFlow, 'id'>>

export interface ReadinessInput {
  layout?: SimLayout & { background?: { scale?: unknown } }
  flows?: ProjectFlowLike[]
  vehicles: Vehicle[]
}

/** The project's flows linked to two layout points, in the engine's shape. */
export function linkedFlows(flows: ProjectFlowLike[] = []): SimFlow[] {
  return flows.flatMap(f => (f.fromPointId && f.toPointId
    ? [{ ...f, fromPointId: f.fromPointId, toPointId: f.toPointId, thruPerHr: f.thruPerHr ?? 0, vehicleId: f.vehicleId ?? '' }]
    : []))
}

/** The first blocker, or `null` when at least one flow would run — by the engine's own rule. */
export function runBlocker({ layout, flows, vehicles }: ReadinessInput): RunBlocker | null {
  if (!layout || layout.segments.length === 0) return 'noRoutes'
  if (layout.background && !layout.background.scale) return 'unscaled'
  const G = buildGraph(layout)
  const byId = new Map(vehicles.map(v => [v.id, v]))
  return linkedFlows(flows).some(f => flowExclusion(G, f, byId, 100) === null) ? null : 'noFlows'
}
