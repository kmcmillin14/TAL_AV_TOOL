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

// ---- "Ready to run?" (proof-of-concept checklist) -----------------------------------------------

export type CheckLevel = 'bad' | 'warn' | 'info'
export interface ReadinessCheck { level: CheckLevel; text: string }

/**
 * Everything standing between the layout and a good run, in plain words (spec §5.1, acceptance 10).
 * `bad` blocks Run; `warn` and `info` are worth knowing. `fleetNeeded` is the vehicles the run will
 * place (the Fleet Engine's figure until the stepper changes it).
 */
export function readinessChecks(input: ReadinessInput & { fleetNeeded: number; driven?: SimLayout }): ReadinessCheck[] {
  const { layout, flows = [], vehicles, fleetNeeded } = input
  const out: ReadinessCheck[] = []
  if (layout?.background && !layout.background.scale) out.push({ level: 'bad', text: 'The drawing is not scaled — use Scale and click a known dimension.' })
  if (!layout || !layout.segments.length) {
    out.push({ level: 'bad', text: 'Draw routes along the aisles to simulate.' })
    return out
  }
  const name = new Map(layout.points.map(p => [p.id, p.name || p.id]))
  // Routes are judged on the layout the run drives (corners rounded, B56.5 applied) when given.
  const G = buildGraph(input.driven ?? layout)
  const byId = new Map(vehicles.map(v => [v.id, v]))
  const linked = linkedFlows(flows)
  const loose = layout.points.filter(p => p.type !== 'junction' && !layout.segments.some(s => s.a === p.id || s.b === p.id))
  if (loose.length) out.push({ level: 'warn', text: `Not connected: ${loose.map(p => p.name || p.id).join(', ')} — draw a route to ${loose.length === 1 ? 'it' : 'them'}.` })
  const unplaced = flows.filter(f => !(f.fromPointId && f.toPointId))
  if (unplaced.length) out.push({ level: 'warn', text: `${unplaced.length} Sizing flow${unplaced.length === 1 ? ' is' : 's are'} not on the layout — left out of the run.` })
  let runnable = 0
  for (const f of linked) {
    const why = flowExclusion(G, f, byId, 100)
    if (!why) runnable++
    if (why) out.push({ level: why === 'No route' ? 'bad' : 'warn', text: `${name.get(f.fromPointId) ?? '?'} → ${name.get(f.toPointId) ?? '?'}: ${why === 'No route' ? 'no route (check one-way routes, connections and B56.5 blocks)' : why.toLowerCase()}.` })
  }
  const chargers = layout.points.filter(p => p.type === 'charger').length
  const homes = chargers + layout.points.filter(p => p.type === 'parking').length
  if (fleetNeeded > 0 && homes < fleetNeeded) out.push({ level: 'bad', text: `Place a charger or parking spot for every vehicle: ${homes} placed, ${fleetNeeded} needed.` })
  if (!chargers) out.push({ level: 'warn', text: 'No chargers placed — vehicles cannot charge during the run.' })
  else if (chargers < fleetNeeded) out.push({ level: 'info', text: `${chargers} charger${chargers === 1 ? '' : 's'} for ${fleetNeeded} vehicles. The Fleet Engine assumes one charger per vehicle.` })
  if (!runnable) out.push({ level: 'bad', text: 'No flow runs yet: link a Pick point to a Drop point, with a vehicle and moves per hour.' })
  return out
}
