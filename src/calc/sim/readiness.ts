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
function homeCounts(layout: SimLayout): { chargers: number; homes: number } {
  const chargers = layout.points.filter(p => p.type === 'charger').length
  return { chargers, homes: chargers + layout.points.filter(p => p.type === 'parking').length }
}

// ---- Validation (the readiness checks) -----------------------------------------------

export type CheckLevel = 'bad' | 'warn' | 'info'
/** The tool that fixes a check (validation's fix button). */
export type CheckFix = 'scale' | 'route' | 'charger' | 'linkFlow' | 'flowsTab'
export interface ReadinessCheck {
  level: CheckLevel
  text: string
  /** What the check is about — validation selects it and centres the view on it. */
  target?: { kind: 'point' | 'flow'; id: string }
  fix?: CheckFix
}

/**
 * Everything standing between the layout and a good run, in plain words (spec §5.1, acceptance 10).
 * `bad` blocks Run; `warn` and `info` are worth knowing. `fleetNeeded` is the vehicles the run will
 * place (the Fleet Engine's figure until the stepper changes it).
 */
export function readinessChecks(input: ReadinessInput & { fleetNeeded: number; driven?: SimLayout }): ReadinessCheck[] {
  const { layout, flows = [], vehicles, fleetNeeded } = input
  const out: ReadinessCheck[] = []
  if (layout?.background && !layout.background.scale) out.push({ level: 'bad', text: 'The drawing is not scaled — use Scale and click a known dimension.', fix: 'scale' })
  if (!layout || !layout.segments.length) {
    out.push({ level: 'bad', text: 'Draw routes along the aisles to simulate.', fix: 'route' })
    return out
  }
  const name = new Map(layout.points.map(p => [p.id, p.name || p.id]))
  // Routes are judged on the layout the run drives (corners rounded, B56.5 applied) when given.
  const G = buildGraph(input.driven ?? layout)
  const byId = new Map(vehicles.map(v => [v.id, v]))
  const linked = linkedFlows(flows)
  const loose = notConnected(layout)
  for (const p of loose) out.push({ level: 'warn', text: `Not connected: ${p.name || p.id} — draw a route to it.`, target: { kind: 'point', id: p.id }, fix: 'route' })
  const unplaced = flows.filter(f => !(f.fromPointId && f.toPointId))
  if (unplaced.length) out.push({ level: 'warn', text: `${unplaced.length} Sizing flow${unplaced.length === 1 ? ' is' : 's are'} not on the layout — left out of the run.`, fix: 'flowsTab' })
  let runnable = 0
  for (const f of linked) {
    const why = flowExclusion(G, f, byId, 100)
    if (!why) { runnable++; continue }
    const noRoute = why === 'No route'
    out.push({
      level: noRoute ? 'bad' : 'warn', target: { kind: 'flow', id: f.id }, fix: noRoute ? 'route' : undefined,
      text: `${name.get(f.fromPointId) ?? '?'} → ${name.get(f.toPointId) ?? '?'}: ${noRoute ? 'no route (check one-way routes, connections and B56.5 blocks)' : why.toLowerCase()}.`,
    })
  }
  const { chargers, homes } = homeCounts(layout)
  if (fleetNeeded > 0 && homes < fleetNeeded) out.push({ level: 'bad', text: `Place a charger or parking spot for every vehicle: ${homes} placed, ${fleetNeeded} needed.`, fix: 'charger' })
  if (!chargers) out.push({ level: 'warn', text: 'No chargers placed — vehicles cannot charge during the run.', fix: 'charger' })
  else if (chargers < fleetNeeded) out.push({ level: 'info', text: `${chargers} charger${chargers === 1 ? '' : 's'} for ${fleetNeeded} vehicles. The Fleet Engine assumes one charger per vehicle.` })
  if (!runnable) out.push({ level: 'bad', text: 'No flow runs yet: link a Pick point to a Drop point, with a vehicle and moves per hour.', fix: 'linkFlow' })
  return byLevel(out)
}

const LEVEL_ORDER: Record<CheckLevel, number> = { bad: 0, warn: 1, info: 2 }
/** Blockers first, then warnings, then notes — the order validation lists them in (stable). */
const byLevel = (checks: ReadinessCheck[]) => [...checks].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])

/** The one validation status: its tone and counts, for the page head and the Validation tab. */
export function checkStatus(checks: ReadinessCheck[]): { tone: 'bad' | 'warn' | 'good'; blockers: number; warnings: number } {
  const blockers = checks.filter(c => c.level === 'bad').length, warnings = checks.filter(c => c.level === 'warn').length
  return { tone: blockers ? 'bad' : warnings ? 'warn' : 'good', blockers, warnings }
}
