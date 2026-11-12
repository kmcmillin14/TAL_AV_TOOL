// src/calc/sim/readiness.ts — can this project's simulation run yet? PURE: no React, no I/O.
// Spec v2 §5.1 and acceptance 1: with no layout, Run is disabled and no numbers are shown.

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { flowExclusion } from './engine'
import { buildGraph } from './graph'
import { notConnected } from './layoutEdit'
import type { SimFlow, SimLayout } from './types'

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

/** Chargers, and chargers plus parking spots ("homes") — every vehicle needs a home to run. */
export function homeCounts(layout: SimLayout): { chargers: number; homes: number } {
  const chargers = layout.points.filter(p => p.type === 'charger').length
  return { chargers, homes: chargers + layout.points.filter(p => p.type === 'parking').length }
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
  const loose = notConnected(layout)
  if (loose.length) out.push({ level: 'warn', text: `Not connected: ${loose.map(p => p.name || p.id).join(', ')} — draw a route to ${loose.length === 1 ? 'it' : 'them'}.` })
  const unplaced = flows.filter(f => !(f.fromPointId && f.toPointId))
  if (unplaced.length) out.push({ level: 'warn', text: `${unplaced.length} Sizing flow${unplaced.length === 1 ? ' is' : 's are'} not on the layout — left out of the run.` })
  let runnable = 0
  for (const f of linked) {
    const why = flowExclusion(G, f, byId, 100)
    if (!why) runnable++
    if (why) out.push({ level: why === 'No route' ? 'bad' : 'warn', text: `${name.get(f.fromPointId) ?? '?'} → ${name.get(f.toPointId) ?? '?'}: ${why === 'No route' ? 'no route (check one-way routes, connections and B56.5 blocks)' : why.toLowerCase()}.` })
  }
  const { chargers, homes } = homeCounts(layout)
  if (fleetNeeded > 0 && homes < fleetNeeded) out.push({ level: 'bad', text: `Place a charger or parking spot for every vehicle: ${homes} placed, ${fleetNeeded} needed.` })
  if (!chargers) out.push({ level: 'warn', text: 'No chargers placed — vehicles cannot charge during the run.' })
  else if (chargers < fleetNeeded) out.push({ level: 'info', text: `${chargers} charger${chargers === 1 ? '' : 's'} for ${fleetNeeded} vehicles. The Fleet Engine assumes one charger per vehicle.` })
  if (!runnable) out.push({ level: 'bad', text: 'No flow runs yet: link a Pick point to a Drop point, with a vehicle and moves per hour.' })
  return out
}
