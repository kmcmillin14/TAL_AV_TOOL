// src/calc/sim/layoutEdit.ts — pure edits on a simulation layout (spec v2 §5). PURE: no React, no I/O.
// Every function returns a new layout; the editor keeps the old one for undo. Units: feet.

import { buildGraph, pathLen } from './graph'
import type { SimLayout, SimPoint, SimPointType, SimRole, SimSegment } from './types'

type XY = { x: number; y: number }

export const emptyLayout = (): SimLayout => ({ points: [], segments: [] })

/** The next free id with this prefix (`p1`, `p2`, …). */
function nextId(prefix: string, taken: { id: string }[]): string {
  const used = new Set(taken.map(t => t.id))
  let n = taken.length + 1
  while (used.has(prefix + n)) n++
  return prefix + n
}

/** Points that carry flows (pick/drop work); the rest are vehicle points or junctions. */
export const FLOW_POINT_TYPES: SimPointType[] = ['stand', 'conveyor', 'machine', 'dock']
export const VEHICLE_POINT_TYPES: SimPointType[] = ['charger', 'parking']

const TYPE_NAME: Record<SimPointType, string> = {
  junction: 'Junction', stand: 'Stand', conveyor: 'Conveyor', machine: 'Machine', dock: 'Dock',
  charger: 'Charger', parking: 'Parking',
}

/** Place a point. Flow points get a role (default Pick) and a numbered name; junctions get neither. */
export function addPoint<T extends SimLayout>(L: T, at: XY, type: SimPointType, role?: SimRole): { layout: T; id: string } {
  const id = nextId('p', L.points)
  const isFlowPoint = FLOW_POINT_TYPES.includes(type)
  const point: SimPoint = { id, x: at.x, y: at.y, type }
  if (type !== 'junction') point.name = `${TYPE_NAME[type]} ${L.points.filter(p => p.type === type).length + 1}`
  if (isFlowPoint) point.role = role ?? 'pick'
  return { layout: { ...L, points: [...L.points, point] }, id }
}

/** Place a point on a route: the route is split there and the point joins it (spec §5.1 step 2). */
export function placeOnSegment<T extends SimLayout>(L: T, segId: string, at: XY, type: SimPointType, role?: SimRole): { layout: T; id: string } | null {
  const split = splitSegment(L, segId, at)
  if (!split) return null
  const { layout: named } = addPoint(L, at, type, role)             // the name and role a new point of this type gets
  const { id: _id, x: _x, y: _y, ...fields } = named.points.at(-1)!
  return { layout: updatePoint(split.layout, split.id, fields), id: split.id }
}

export function updatePoint<T extends SimLayout>(L: T, id: string, patch: Partial<Omit<SimPoint, 'id'>>): T {
  return { ...L, points: L.points.map(p => (p.id === id ? { ...p, ...patch } : p)) }
}

/** Remove a point and every route touching it. */
export function removePoint<T extends SimLayout>(L: T, id: string): T {
  return { ...L, points: L.points.filter(p => p.id !== id), segments: L.segments.filter(s => s.a !== id && s.b !== id) }
}

/** Connect two points with a two-way, two-lane route. No route to itself, no duplicates. */
export function addSegment<T extends SimLayout>(L: T, a: string, b: string): { layout: T; id: string | null } {
  if (a === b || L.segments.some(s => (s.a === a && s.b === b) || (s.a === b && s.b === a))) return { layout: L, id: null }
  const id = nextId('s', L.segments)
  return { layout: { ...L, segments: [...L.segments, { id, a, b, dir: 'two', lane: 'two' }] }, id }
}

export function updateSegment<T extends SimLayout>(L: T, id: string, patch: Partial<Omit<SimSegment, 'id' | 'a' | 'b'>>): T {
  return { ...L, segments: L.segments.map(s => (s.id === id ? { ...s, ...patch } : s)) }
}

export function removeSegment<T extends SimLayout>(L: T, id: string): T {
  return { ...L, segments: L.segments.filter(s => s.id !== id) }
}

/** Points by id. */
export const pointById = (L: SimLayout) => new Map(L.points.map(p => [p.id, p]))

/** The closest spot on a straight route to `p`: position, distance, and how far along (0–1). */
export function projectOnSegment(L: SimLayout, segId: string, p: XY, byId = pointById(L)): { x: number; y: number; t: number; dist: number } | null {
  const s = L.segments.find(q => q.id === segId)
  const a = s && byId.get(s.a), b = s && byId.get(s.b)
  if (!a || !b) return null
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const x = a.x + t * dx, y = a.y + t * dy
  return { x, y, t, dist: Math.hypot(p.x - x, p.y - y) }
}

/** Join a new junction into a route at `at`: the route becomes two, keeping its direction and lane. */
export function splitSegment<T extends SimLayout>(L: T, segId: string, at: XY): { layout: T; id: string } | null {
  const s = L.segments.find(q => q.id === segId)
  const on = s && projectOnSegment(L, segId, at)
  if (!s || !on) return null
  const { layout: withPoint, id } = addPoint(L, { x: on.x, y: on.y }, 'junction')
  const second = nextId('s', withPoint.segments)
  const { curve: _curve, ...rest } = s   // a split curve is redrawn straight (curves arrive in the second half of M4)
  const segments = withPoint.segments.flatMap(q => (q.id === segId
    ? [{ ...rest, b: id }, { ...rest, id: second, a: id }]
    : [q]))
  return { layout: { ...withPoint, segments }, id }
}

/** What is under the cursor, nearest first: a point within `pointFt`, else a route within `segFt`. */
export function hitTest(L: SimLayout, at: XY, pointFt: number, segFt: number):
  | { kind: 'point'; id: string }
  | { kind: 'segment'; id: string; x: number; y: number }
  | null {
  let best: { id: string; d: number } | null = null
  for (const p of L.points) {
    const d = Math.hypot(p.x - at.x, p.y - at.y)
    if (d <= pointFt && (!best || d < best.d)) best = { id: p.id, d }
  }
  if (best) return { kind: 'point', id: best.id }
  let seg: { id: string; d: number; x: number; y: number } | null = null
  const byId = pointById(L)
  for (const s of L.segments) {
    const on = projectOnSegment(L, s.id, at, byId)
    if (on && on.dist <= segFt && (!seg || on.dist < seg.d)) seg = { id: s.id, d: on.dist, x: on.x, y: on.y }
  }
  return seg && { kind: 'segment', id: seg.id, x: seg.x, y: seg.y }
}

/** A straight route's length, ft (curves arrive in the second half of Milestone 4). */
export function segmentLengthFt(L: SimLayout, s: SimSegment, byId = pointById(L)): number {
  const a = byId.get(s.a), b = byId.get(s.b)
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
}

/** Points with no route — shown "Not connected" and listed before a run (acceptance 10). */
export function notConnected(L: SimLayout): SimPoint[] {
  const linked = new Set(L.segments.flatMap(s => [s.a, s.b]))
  return L.points.filter(p => p.type !== 'junction' && !linked.has(p.id))
}

/** Travel distance along the routes, ft — `Infinity` when there is no route (acceptance 2). */
export function routeDistanceFt(L: SimLayout, from: string, to: string, G = buildGraph(L)): number {
  const a = G.idx.get(from), b = G.idx.get(to)
  return a == null || b == null ? Infinity : pathLen(G, a, b)
}

/** A point where a flow can start / end — the one rule, shared with the engine. */
export const canPick = (p?: SimPoint) => p?.role === 'pick' || p?.role === 'pickDrop'
export const canDrop = (p?: SimPoint) => p?.role === 'drop' || p?.role === 'pickDrop'

/** Why the Flow tool will not start a flow at this point, or `null` (spec §5.4). */
export function flowStartRefusal(L: SimLayout, from: string): string | null {
  return canPick(pointById(L).get(from)) ? null : 'Start a flow at a Pick point.'
}

/** Why the Flow tool refuses this pair, or `null` (spec §5.4, acceptance 11). */
export function flowRefusal(L: SimLayout, from: string, to: string): string | null {
  const start = flowStartRefusal(L, from)
  if (start) return start
  if (from === to) return 'A flow needs two different points.'
  if (!canDrop(pointById(L).get(to))) return 'End a flow at a Drop point.'
  return null
}

/** A project flow as stored in Sizing — the layout fields are optional. */
export interface LayoutFlow {
  id: string
  origin?: string
  destination?: string
  distanceFt?: number
  liftHeightFt?: number
  fromPointId?: string
  toPointId?: string
  distanceSource?: 'layout'
}

/** Link a flow to two points: its distance now comes from the layout. */
export function linkFlow<F extends LayoutFlow>(L: SimLayout, flow: F, from: string, to: string): F {
  const byId = pointById(L)
  return withLayoutDistance(L, {
    ...flow, fromPointId: from, toPointId: to, distanceSource: 'layout',
    origin: flow.origin || byId.get(from)?.name || '', destination: flow.destination || byId.get(to)?.name || '',
  })
}

/** A linked flow's facts, read from the layout: distance along the routes, and lift height = pick
 *  height + drop height (the simulation lifts at each end; Sizing counts one lift per cycle). Never
 *  typed for a linked flow (spec §5.2, §5.4). Unlinked flows are unchanged; a pair with no route
 *  keeps its typed distance — the run lists "No route" rather than inventing a number. */
export function withLayoutDistance<F extends LayoutFlow>(L: SimLayout, flow: F, G = buildGraph(L)): F {
  if (flow.distanceSource !== 'layout' || !flow.fromPointId || !flow.toPointId) return flow
  const byId = pointById(L)
  const lift = (byId.get(flow.fromPointId)?.heightFt ?? 0) + (byId.get(flow.toPointId)?.heightFt ?? 0)
  const d = routeDistanceFt(L, flow.fromPointId, flow.toPointId, G)
  return { ...flow, liftHeightFt: lift, ...(isFinite(d) ? { distanceFt: Math.round(d * 10) / 10 } : {}) }
}

/** Every linked flow re-measured on the layout, with one graph for all of them. */
export function measureFlows<F extends LayoutFlow>(L: SimLayout, flows: F[]): F[] {
  if (!flows.some(f => f.distanceSource === 'layout')) return flows
  const G = buildGraph(L)
  return flows.map(f => withLayoutDistance(L, f, G))
}

/** Sizing flows not yet on the layout, each with the points whose names match its origin and
 *  destination (one-click linking, spec §5.4). A suggestion needs both ends and a Pick → Drop pair. */
export function linkSuggestions(L: SimLayout, flows: LayoutFlow[]): { flowId: string; from?: string; to?: string }[] {
  const norm = (s?: string) => (s ?? '').trim().toLowerCase()
  const match = (name: string | undefined, ok: (p: SimPoint) => boolean) => {
    const n = norm(name)
    return n ? L.points.find(p => ok(p) && norm(p.name) === n)?.id : undefined
  }
  return flows
    .filter(f => !(f.fromPointId && f.toPointId))
    .map(f => {
      const from = match(f.origin, canPick), to = match(f.destination, canDrop)
      return from && to ? { flowId: f.id, from, to } : { flowId: f.id }
    })
}

/** Scale every coordinate by `k` — used when the drawing's scale is set or changed, so what was
 *  drawn stays on the drawing. */
export function rescaleLayout<T extends SimLayout>(L: T, k: number): T {
  const s = (p: XY) => ({ x: p.x * k, y: p.y * k })
  return {
    ...L,
    points: L.points.map(p => ({ ...p, ...s(p) })),
    segments: L.segments.map(q => (q.curve?.kind === 'arc' ? { ...q, curve: { ...q.curve, mid: s(q.curve.mid) } }
      : q.curve?.kind === 'bezier' ? { ...q, curve: { ...q.curve, c1: s(q.curve.c1), c2: s(q.curve.c2) } }
      : q)),
  }
}

