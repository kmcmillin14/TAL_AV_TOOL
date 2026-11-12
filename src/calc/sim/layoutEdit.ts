// src/calc/sim/layoutEdit.ts — pure edits on a simulation layout (spec v2 §5). PURE: no React, no I/O.
// Every function returns a new layout; the editor keeps the old one for undo. Units: feet.

import { roundCorners } from './corners'
import { closestOnLine, insideRect, rectCorners, segmentGeometry } from './geometry'
import { buildGraph, pathLen, tree } from './graph'
import { highwayEnds, highwayFromEnds, insideHighway, ON_HIGHWAY_FT, withHighways } from './highways'
import type { SimCurve, SimHighway, SimLayout, SimObject, SimPoint, SimPointType, SimRole, SimSegment } from './types'

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

/** Connect two points with a two-way, two-lane route. No route to itself, no duplicates. */
export function addSegment<T extends SimLayout>(L: T, a: string, b: string, kind: Pick<SimSegment, 'dir' | 'lane'> = { dir: 'two', lane: 'two' }): { layout: T; id: string | null } {
  if (a === b || L.segments.some(s => (s.a === a && s.b === b) || (s.a === b && s.b === a))) return { layout: L, id: null }
  const id = nextId('s', L.segments)
  return { layout: { ...L, segments: [...L.segments, { id, a, b, dir: kind.dir, lane: kind.dir === 'two' ? kind.lane : 'single' }] }, id }
}

export function updateSegment<T extends SimLayout>(L: T, id: string, patch: Partial<Omit<SimSegment, 'id' | 'a' | 'b'>>): T {
  return { ...L, segments: L.segments.map(s => (s.id === id ? { ...s, ...patch } : s)) }
}

export function removeSegment<T extends SimLayout>(L: T, id: string): T {
  return { ...L, segments: L.segments.filter(s => s.id !== id) }
}

/** Points by id. */
export const pointById = (L: SimLayout) => new Map(L.points.map(p => [p.id, p]))

/** The closest spot on a route to `p`: position, distance, and how far along (0–1). Curves are
 *  searched along their length; straight routes are solved exactly. */
export function projectOnSegment(L: SimLayout, segId: string, p: XY, byId = pointById(L)): { x: number; y: number; t: number; dist: number } | null {
  const s = L.segments.find(q => q.id === segId)
  return s ? projectOn(s, byId, p) : null
}

function projectOn(s: SimSegment, byId: Map<string, SimPoint>, p: XY): { x: number; y: number; t: number; dist: number } | null {
  const a = byId.get(s.a), b = byId.get(s.b)
  if (!a || !b) return null
  if (s.curve) {
    const g = segmentGeometry(a, b, s.curve)
    const n = Math.max(16, Math.ceil(g.length / 0.5))
    let best = { x: a.x, y: a.y, t: 0, dist: Infinity }
    for (let i = 0; i <= n; i++) {
      const q = g.at((g.length * i) / n), d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < best.dist) best = { x: q.x, y: q.y, t: i / n, dist: d }
    }
    return best
  }
  return closestOnLine(a, b, p)
}

/** The nearest point within `reach` ft (skipping `skip`), and the nearest route within `reach` — the
 *  one "what is under the cursor" rule for clicks (`hitTest`) and snaps (`snapDraw`). */
function nearestPoint(L: SimLayout, at: XY, reach: number, skip?: Set<string>): SimPoint | null {
  let best: SimPoint | null = null, bd = Infinity
  for (const p of L.points) {
    if (skip?.has(p.id)) continue
    const d = Math.hypot(p.x - at.x, p.y - at.y)
    if (d <= reach && d < bd) { best = p; bd = d }
  }
  return best
}
function nearestRoute(L: SimLayout, at: XY, reach: number, skip?: Set<string>): { id: string; at: XY } | null {
  const byId = pointById(L)
  let best: { id: string; at: XY } | null = null, bd = Infinity
  for (const s of L.segments) {
    if (skip && (skip.has(s.a) || skip.has(s.b))) continue
    const on = projectOn(s, byId, at)
    if (on && on.dist <= reach && on.dist < bd) { best = { id: s.id, at: { x: on.x, y: on.y } }; bd = on.dist }
  }
  return best
}

/** A curve with `f` applied to its handles (move, copy, rescale). */
function mapCurve(c: SimCurve, f: (p: XY) => XY): SimCurve {
  return c.kind === 'arc' ? { kind: 'arc', mid: f(c.mid) } : { kind: 'bezier', c1: f(c.c1), c2: f(c.c2) }
}

/** Join a new junction into a route at `at`: the route becomes two, keeping its direction and lane. */
export function splitSegment<T extends SimLayout>(L: T, segId: string, at: XY): { layout: T; id: string } | null {
  const s = L.segments.find(q => q.id === segId)
  // A highway's route is derived: a junction on its centre line splits it (withHighways joins it).
  if (!s) {
    const net = withHighways(L), on = net.segments.some(q => q.id === segId && q.highwayId) && projectOnSegment(net, segId, at)
    return on ? addPoint(L, { x: on.x, y: on.y }, 'junction') : null
  }
  const on = projectOnSegment(L, segId, at)
  if (!on) return null
  const { layout: withPoint, id } = addPoint(L, { x: on.x, y: on.y }, 'junction')
  const second = nextId('s', withPoint.segments)
  const { curve: _curve, ...rest } = s   // a split curve becomes two straight routes; bend them again if needed
  const segments = withPoint.segments.flatMap(q => (q.id === segId
    ? [{ ...rest, b: id }, { ...rest, id: second, a: id }]
    : [q]))
  return { layout: { ...withPoint, segments }, id }
}

/** What is under the cursor, nearest first: a point within `pointFt`, else a route within `segFt`. */
export function hitTest(L: SimLayout, at: XY, pointFt: number, segFt: number):
  | { kind: 'point'; id: string }
  | { kind: 'segment'; id: string; x: number; y: number }
  | { kind: 'highway'; id: string }
  | { kind: 'object'; id: string }
  | null {
  const p = nearestPoint(L, at, pointFt)
  if (p) return { kind: 'point', id: p.id }
  const r = nearestRoute(L, at, segFt)
  if (r) return { kind: 'segment', id: r.id, x: r.at.x, y: r.at.y }
  const hw = [...(L.highways ?? [])].reverse().find(h => insideHighway(h, at))
  if (hw) return { kind: 'highway', id: hw.id }
  const obj = [...(L.objects ?? [])].reverse().find(o => insideRect(o, at))
  return obj ? { kind: 'object', id: obj.id } : null
}

/** A route's length along its line or curve, ft. */
export function segmentLengthFt(L: SimLayout, s: SimSegment, byId = pointById(L)): number {
  const a = byId.get(s.a), b = byId.get(s.b)
  return a && b ? segmentGeometry(a, b, s.curve).length : 0
}

/** Points with no route — shown "Not connected" and listed before a run (acceptance 10). */
export function notConnected(L: SimLayout): SimPoint[] {
  const linked = new Set(withHighways(L).segments.flatMap(s => [s.a, s.b]))
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

/** Why the Flow tool will not start at this point, or `null`: a flow starts at its Pick, or at its
 *  Drop and is linked back to a Pick (spec §5.4). */
export function flowStartRefusal(L: SimLayout, start: string): string | null {
  const p = pointById(L).get(start)
  return canPick(p) || canDrop(p) ? null : 'Start a flow at a Pick or a Drop point.'
}

/** Why the Flow tool refuses this Pick → Drop pair, or `null` (spec §5.4, acceptance 11). */
export function flowRefusal(L: SimLayout, from: string, to: string, byId = pointById(L)): string | null {
  if (!canPick(byId.get(from))) return 'Start a flow at a Pick point.'
  if (from === to) return 'A flow needs two different points.'
  if (!canDrop(byId.get(to))) return 'End a flow at a Drop point.'
  return null
}

/** One point a flow could link to from a start point (the Flow tool's highlight, "Add flow to…"),
 *  with the flow's Pick and Drop already in order. */
export interface FlowTarget { id: string; pick: string; drop: string; ok: boolean; reason?: string; distanceFt?: number }
/** What a start can link to: a Pick's Drops, a Drop's Picks, a Pick & drop point's both. */
export type FlowEnd = 'Drop' | 'Pick' | 'Pick or Drop'

const REVERSED = { two: 'two', ab: 'ba', ba: 'ab' } as const
/**
 * Every point a flow can link to from `start`, with the reason when it cannot (`flowRefusal`, plus
 * *Already linked* and *No route*). A Pick start lists Drops; a Drop start lists Picks (the flow still
 * runs Pick → Drop); a Pick & drop point lists both. `null` when the start can be neither. Junctions
 * are left out. Valid targets first, nearest first. One shortest-path tree per direction gives every
 * distance (from the start; on the routes reversed, to it). `G` may be passed in (the forward graph).
 */
export function flowTargets(L: SimLayout, start: string, flows: { fromPointId?: string; toPointId?: string }[], G = buildGraph(L)): { end: FlowEnd; targets: FlowTarget[] } | null {
  const byId = pointById(L), s = byId.get(start)
  const out = canPick(s), into = canDrop(s)
  if (!out && !into) return null
  const i = G.idx.get(start)!
  const fwd = out ? tree(G, i).dist : null
  const back = into ? (() => { const N = withHighways(L), R = buildGraph({ ...N, segments: N.segments.map(q => ({ ...q, dir: REVERSED[q.dir] })) }); return tree(R, R.idx.get(start)!).dist })() : null
  const targets = L.points.filter(p => p.type !== 'junction' && p.id !== start).map((p): FlowTarget => {
    // Start → p when the start picks and p drops; otherwise p → start.
    const forward = out && canDrop(p)
    const [pick, drop] = forward || !into ? [start, p.id] : [p.id, start]
    const base = { id: p.id, pick, drop }
    const why = flowRefusal(L, pick, drop, byId)
    if (why) return { ...base, ok: false, reason: why }
    if (flows.some(f => f.fromPointId === pick && f.toPointId === drop)) return { ...base, ok: false, reason: 'Already linked.' }
    const d = (forward ? fwd! : back!)[G.idx.get(p.id)!]
    return isFinite(d) ? { ...base, ok: true, distanceFt: d } : { ...base, ok: false, reason: 'No route — check one-way routes and connections.' }
  })
  return {
    end: out && into ? 'Pick or Drop' : out ? 'Drop' : 'Pick',
    targets: targets.sort((x, y) => Number(y.ok) - Number(x.ok) || (x.distanceFt ?? 0) - (y.distanceFt ?? 0)),
  }
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

/** Every linked flow re-measured on the layout a vehicle drives: corners rounded to the flow's
 *  vehicle turning radius (`radiusFor`, spec §5.5; 0 = turns in place). One graph per radius. */
export function measureFlows<F extends LayoutFlow & { vehicleId?: string }>(L: SimLayout, flows: F[], radiusFor: (vehicleId?: string) => number = () => 0): F[] {
  if (!flows.some(f => f.distanceSource === 'layout')) return flows
  const graphs = new Map<number, { L: SimLayout; G: ReturnType<typeof buildGraph> }>()
  const driven = (r: number) => {
    let g = graphs.get(r)
    if (!g) { const R = roundCorners(L, r); g = { L: R, G: buildGraph(R) }; graphs.set(r, g) }
    return g
  }
  return flows.map(f => {
    if (f.distanceSource !== 'layout') return f
    const { L: R, G } = driven(radiusFor(f.vehicleId))
    return withLayoutDistance(R, f, G)
  })
}

/** Names match regardless of case and surrounding spaces — one rule for placing and linking. */
export const sameName = (a?: string, b?: string) => !!a?.trim() && a.trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/** Sizing flows not yet on the layout, each with the points whose names match its origin and
 *  destination (one-click linking, spec §5.4). A suggestion needs both ends and a Pick → Drop pair. */
export function linkSuggestions(L: SimLayout, flows: LayoutFlow[]): { flowId: string; from?: string; to?: string }[] {
  const match = (name: string | undefined, ok: (p: SimPoint) => boolean) => L.points.find(p => ok(p) && sameName(p.name, name))?.id
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
    segments: L.segments.map(q => (q.curve ? { ...q, curve: mapCurve(q.curve, s) } : q)),
    ...(L.objects ? { objects: L.objects.map(o => ({ ...o, ...s(o), w: o.w * k, h: o.h * k })) } : {}),
  }
}


// ---- Curves (spec §5.5) -------------------------------------------------------------------------

/** Bend a route through `mid` (an arc), give it spline handles, or straighten it (`undefined`). */
export function setCurve<T extends SimLayout>(L: T, segId: string, curve: SimCurve | undefined): T {
  return { ...L, segments: L.segments.map(s => (s.id === segId ? { ...s, curve } : s)) }
}

/** Spline handles for a route: on its current line or arc, a third and two thirds along. */
export function splineHandles(L: SimLayout, segId: string): SimCurve | null {
  const s = L.segments.find(q => q.id === segId)
  const byId = pointById(L), a = s && byId.get(s.a), b = s && byId.get(s.b)
  if (!s || !a || !b) return null
  const g = segmentGeometry(a, b, s.curve)
  const at = (k: number) => { const q = g.at(g.length * k); return { x: q.x, y: q.y } }
  return { kind: 'bezier', c1: at(1 / 3), c2: at(2 / 3) }
}

// ---- Repeat, copy, move (spec §5.7) -------------------------------------------------------------

/** "Charger 3" → "Charger 4"; "Stand A" → "Stand A 2". */
function nextName(name: string, k: number): string {
  const m = name.match(/^(.*?)(\d+)$/)
  return m ? `${m[1]}${Number(m[2]) + k}` : `${name} ${k + 1}`
}

/** Repeat a point to `count` in all, `stepFt` apart along `dir` (a direction, any length), named in
 *  sequence (`Charger 1…6`). One edit — one undo removes the whole repeat (acceptance 14). */
/** Next names after `name` (Charger 1 → Charger 2, 3…) that no point on the layout already has. */
function freshNames(L: SimLayout): (name: string) => string {
  const used = new Set(L.points.map(p => p.name).filter(Boolean))
  return name => { let k = 1, n = nextName(name, k); while (used.has(n)) n = nextName(name, ++k); used.add(n); return n }
}

export function repeatPoint<T extends SimLayout>(L: T, id: string, count: number, stepFt: number, dir: XY): { layout: T; ids: string[] } {
  const src = L.points.find(p => p.id === id)
  const n = Math.hypot(dir.x, dir.y)
  if (!src || count < 2 || !(n > 0)) return { layout: L, ids: src ? [id] : [] }
  const points = [...L.points], ids = [id], fresh = freshNames(L)
  for (let k = 1; k < count; k++) {
    const pid = nextId('p', points)
    points.push({ ...src, id: pid, x: src.x + (dir.x / n) * stepFt * k, y: src.y + (dir.y / n) * stepFt * k, ...(src.name ? { name: fresh(src.name) } : {}) })
    ids.push(pid)
  }
  return { layout: { ...L, points }, ids }
}

/** Copy points — and the routes between them — `offset` ft away, with new ids and names. */
export function copyPoints<T extends SimLayout>(L: T, ids: string[], offset: XY): { layout: T; ids: string[] } {
  const pick = new Set(ids), map = new Map<string, string>()
  const points = [...L.points], segments = [...L.segments]
  const freshName = freshNames(L)
  for (const p of L.points) {
    if (!pick.has(p.id)) continue
    const pid = nextId('p', points)
    map.set(p.id, pid)
    points.push({ ...p, id: pid, x: p.x + offset.x, y: p.y + offset.y, ...(p.name ? { name: freshName(p.name) } : {}) })
  }
  const shift = (q: XY) => ({ x: q.x + offset.x, y: q.y + offset.y })
  for (const s of L.segments) {
    if (!map.has(s.a) || !map.has(s.b)) continue
    const curve = s.curve && mapCurve(s.curve, shift)
    segments.push({ ...s, id: nextId('s', segments), a: map.get(s.a)!, b: map.get(s.b)!, ...(curve ? { curve } : {}) })
  }
  return { layout: { ...L, points, segments }, ids: [...map.values()] }
}

/** Move points (and the curve handles of routes between them) by `d` ft. */
export function movePoints<T extends SimLayout>(L: T, ids: string[], d: XY): T {
  const pick = new Set(ids)
  const shift = (q: XY) => ({ x: q.x + d.x, y: q.y + d.y })
  return {
    ...L,
    points: L.points.map(p => (pick.has(p.id) ? { ...p, ...shift(p) } : p)),
    segments: L.segments.map(s => (!s.curve || !pick.has(s.a) || !pick.has(s.b) ? s
      : { ...s, curve: mapCurve(s.curve, shift) })),
  }
}

/** Remove several points and every route touching them. */
export function removePoints<T extends SimLayout>(L: T, ids: string[]): T {
  const gone = new Set(ids)
  return { ...L, points: L.points.filter(p => !gone.has(p.id)), segments: L.segments.filter(s => !gone.has(s.a) && !gone.has(s.b)) }
}

/** Points whose position lies inside the rectangle spanned by two corners (marquee select). */
export function pointsInBox(L: SimLayout, a: XY, b: XY): string[] {
  const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)]
  return L.points.filter(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map(p => p.id)
}

// ---- Fixed objects (spec §5.8) ------------------------------------------------------------------

/** An object's four corners, ft, in order. */
export const objectCorners = (o: SimObject): XY[] => rectCorners(o)

/**
 * Snap a route point to the fixed objects (owner, 2026-11-11). A route is an aisle centreline, so it
 * snaps to each object's outline grown by `offsetFt` — half the aisle — which leaves the B56.5
 * clearance between the lane and the face. A corner within `radiusFt` wins over an edge; `accept`
 * can refuse a candidate (e.g. one that would bend a squared line), and the next one is tried.
 */
export function snapToObjects(
  L: SimLayout, at: XY, radiusFt: number, offsetFt = 0, accept: (q: XY) => boolean = () => true,
): { at: XY; snapped: 'corner' | 'edge' | null } {
  const corners: XY[] = [], edges: XY[] = []
  for (const o of L.objects ?? []) {
    const c = objectCorners({ ...o, x: o.x - offsetFt, y: o.y - offsetFt, w: o.w + 2 * offsetFt, h: o.h + 2 * offsetFt })
    corners.push(...c)
    for (let i = 0; i < 4; i++) {
      const q = closestOnLine(c[i], c[(i + 1) % 4], at)
      edges.push({ x: q.x, y: q.y })
    }
  }
  const nearest = (qs: XY[]) => qs
    .map(q => ({ q, d: Math.hypot(q.x - at.x, q.y - at.y) }))
    .filter(c => c.d <= radiusFt && accept(c.q))
    .sort((m, n) => m.d - n.d)[0]?.q
  const corner = nearest(corners)
  if (corner) return { at: corner, snapped: 'corner' }
  const edge = nearest(edges)
  return edge ? { at: edge, snapped: 'edge' } : { at, snapped: null }
}

/** Turn a point into another type, named and given a role as a new point of that type would be. */
export function convertPoint<T extends SimLayout>(L: T, id: string, type: SimPointType, role?: SimRole): T {
  const others = { ...L, points: L.points.filter(p => p.id !== id) }
  const { id: _id, x: _x, y: _y, ...fields } = addPoint(others, { x: 0, y: 0 }, type, role).layout.points.at(-1)!
  return { ...L, points: L.points.map(p => (p.id === id ? { id, x: p.x, y: p.y, ...fields } : p)) }
}

/** Add a rectangle between two corners (drawn with the Object tool). Tiny drags are ignored. */
export function addObject<T extends SimLayout>(L: T, a: XY, b: XY): { layout: T; id: string | null } {
  const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y)
  if (w < 0.1 || h < 0.1) return { layout: L, id: null }
  const objects = L.objects ?? []
  const id = nextId('o', objects)
  const o: SimObject = { id, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h, name: `Object ${objects.length + 1}` }
  return { layout: { ...L, objects: [...objects, o] }, id }
}

export function updateObject<T extends SimLayout>(L: T, id: string, patch: Partial<Omit<SimObject, 'id'>>): T {
  return { ...L, objects: (L.objects ?? []).map(o => (o.id === id ? { ...o, ...patch } : o)) }
}

export function removeObject<T extends SimLayout>(L: T, id: string): T {
  return { ...L, objects: (L.objects ?? []).filter(o => o.id !== id) }
}

// ---- Highways (Milestone 7): stored as rectangles; their routes are derived (highways.ts) ----

/** A highway from end `a` to end `b`, `widthFt` wide. Too short (under 2 ft): nothing. */
export function addHighway<T extends SimLayout>(L: T, a: XY, b: XY, widthFt: number, kind: Pick<SimHighway, 'dir' | 'lane'> = { dir: 'two', lane: 'two' }): { layout: T; id: string | null } {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return { layout: L, id: null }
  const highways = L.highways ?? []
  const id = nextId('h', highways)
  return { layout: { ...L, highways: [...highways, highwayFromEnds(a, b, widthFt, { id, ...kind, name: `Highway ${highways.length + 1}` })] }, id }
}

/**
 * Change a highway. The stations and junctions on its centre line go with it (kept at their distance
 * from the end that stayed put, or from the centre when it moved or turned), so they stay joined.
 * The angle is kept within ±180°.
 */
export function updateHighway<T extends SimLayout>(L: T, id: string, patch: Partial<Omit<SimHighway, 'id'>>): T {
  const h = L.highways?.find(q => q.id === id)
  if (!h) return L
  const next = { ...h, ...patch }
  if (patch.angleDeg != null) next.angleDeg = ((((patch.angleDeg + 180) % 360) + 360) % 360) - 180
  const highways = L.highways!.map(q => (q.id === id ? next : q))
  const was = highwayEnds(h), now = highwayEnds(next)
  const same = (p: XY, q: XY) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6
  if (same(was.a, now.a) && same(was.b, now.b)) return { ...L, highways }
  // The anchor and the unit vectors along / across, before and after.
  const frame = (e: { a: XY; b: XY }, len: number) => {
    const u = { x: (e.b.x - e.a.x) / (len || 1), y: (e.b.y - e.a.y) / (len || 1) }
    const o = same(was.a, now.a) ? e.a : same(was.b, now.b) ? e.b : { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
    return { o, u, n: { x: -u.y, y: u.x } }
  }
  const f0 = frame(was, h.lengthFt), f1 = frame(now, next.lengthFt)
  const points = L.points.map(p => {
    if (closestOnLine(was.a, was.b, p).dist > ON_HIGHWAY_FT) return p
    const dx = p.x - f0.o.x, dy = p.y - f0.o.y, s = dx * f0.u.x + dy * f0.u.y, d = dx * f0.n.x + dy * f0.n.y
    return { ...p, x: f1.o.x + s * f1.u.x + d * f1.n.x, y: f1.o.y + s * f1.u.y + d * f1.n.y }
  })
  return { ...L, points, highways }
}

export function removeHighway<T extends SimLayout>(L: T, id: string): T {
  return { ...L, highways: (L.highways ?? []).filter(h => h.id !== id) }
}


// ---- Drawing snaps (owner, 2026-11-11: "snapping to the endpoints … needs to be smooth and easy") ----

/** Snap reach in screen pixels: generous for points (a click near an end joins it), tighter for the rest. */
const SNAP_PX = { point: 22, route: 12, object: 12, align: 12 }

/** Square to `from`: horizontal or vertical, whichever is closer. */
function squareTo(from: XY, to: XY): XY {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

export type DrawSnap =
  | { kind: 'point'; id: string; at: XY }
  | { kind: 'route'; id: string; at: XY }
  /** Open floor: on an object's aisle line, lined up with existing points (`guides`), else on the grid.
   *  `spur`: where a point placed here would join a route (Place tool, `spurTarget`). */
  | { kind: 'object' | 'free'; at: XY; guides: XY[]; spur?: { id: string; at: XY } | null }

/** The grid a free click lands on, ft: whole feet, finer as you zoom in (6 in, 3 in, 1 in) so the
 *  landing spot is never more than ~4 screen pixels from the cursor. */
export function drawGridFt(px: number): number {
  return [1, 0.5, 0.25, 1 / 12].find(step => step <= 8 * px) ?? 1 / 12
}
const onGrid = (v: number, step: number) => Math.round(Math.round(v / step) * step * 1e6) / 1e6

/**
 * Where a drawing click lands — the one rule for the crosshair, the click and a dragged point, so
 * the click always lands where the crosshair is drawn:
 * an existing point within reach (joined), else a route (split there), else open floor —
 * straight (horizontal or vertical from `from`) when the cursor is within reach of straight or `lock`
 * (Shift) is held, any angle otherwise; onto an object's aisle line `offsetFt` out (only where a
 * straight line stays straight); lined up with any existing point's x or y; else on the grid.
 */
export function snapDraw(
  L: SimLayout, at: XY,
  o: { px: number; from?: XY | null; lock?: boolean; offsetFt?: number; exclude?: Set<string>; routes?: boolean },
): DrawSnap {
  const skip = o.exclude ?? new Set<string>()
  const p = nearestPoint(L, at, SNAP_PX.point * o.px, skip)
  if (p) return { kind: 'point', id: p.id, at: { x: p.x, y: p.y } }
  const route = o.routes !== false ? nearestRoute(L, at, SNAP_PX.route * o.px, skip) : null
  if (route) return { kind: 'route', id: route.id, at: route.at }

  const reach = SNAP_PX.align * o.px
  const sq = o.from ? squareTo(o.from, at) : null
  const from = o.from && sq && (o.lock || Math.hypot(sq.x - at.x, sq.y - at.y) <= reach) ? o.from : null
  const q = from ? sq! : at
  const straight = (c: XY) => !from || Math.abs(c.x - from.x) < 1e-6 || Math.abs(c.y - from.y) < 1e-6
  const obj = snapToObjects(L, q, SNAP_PX.object * o.px, o.offsetFt ?? 0, straight)
  if (obj.snapped) return { kind: 'object', at: obj.at, guides: [] }

  // Free axes: both on open floor; only the one along the line when straight.
  const freeX = !from || q.y === from.y, freeY = !from || q.x === from.x
  const near = (axis: 'x' | 'y') => {
    let g: SimPoint | null = null
    for (const c of L.points) if (!skip.has(c.id) && Math.abs(c[axis] - q[axis]) <= reach && (!g || Math.abs(c[axis] - q[axis]) < Math.abs(g[axis] - q[axis]))) g = c
    return g
  }
  const gx = freeX ? near('x') : null, gy = freeY ? near('y') : null
  const step = drawGridFt(o.px)
  const r = {
    x: gx ? gx.x : freeX ? onGrid(q.x, step) : q.x,
    y: gy ? gy.y : freeY ? onGrid(q.y, step) : q.y,
  }
  return { kind: 'free', at: r, guides: [gx, gy].flatMap(g => (g ? [{ x: g.x, y: g.y }] : [])) }
}

/**
 * Join point `from` into point `into` (a dragged end dropped on another point): routes are re-wired,
 * a route that would join a point to itself or repeat another is dropped. A junction dropped onto, or
 * receiving, a named point keeps the named point's type, name and role.
 */
export function mergePoints<T extends SimLayout>(L: T, from: string, into: string): T {
  const a = L.points.find(p => p.id === from), b = L.points.find(p => p.id === into)
  if (!a || !b || from === into) return L
  const { id: _a, x: _x, y: _y, ...aFields } = a
  const kept: SimPoint = b.type === 'junction' && a.type !== 'junction' ? { ...aFields, id: b.id, x: b.x, y: b.y } : b
  const seen = new Set<string>()
  const segments = L.segments.flatMap(s => {
    const t = { ...s, a: s.a === from ? into : s.a, b: s.b === from ? into : s.b }
    const pair = [t.a, t.b].sort().join('|')
    if (t.a === t.b || seen.has(pair)) return []
    seen.add(pair)
    return [t]
  })
  return { ...L, points: L.points.flatMap(p => (p.id === from ? [] : p.id === into ? [kept] : [p])), segments }
}

/** A flow with its layout links removed — back to a Sizing-only flow (its last distance kept). */
export function unlinked<F extends { fromPointId?: string; toPointId?: string; distanceSource?: 'layout' }>(f: F): F {
  return { ...f, fromPointId: undefined, toPointId: undefined, distanceSource: undefined }
}

// ---- Stations connect themselves (owner, 2026-11-11) ---------------------------------------------

/** A point placed within this distance of a route is joined to it by a spur, ft. */
export const SPUR_REACH_FT = 40

/** Where a point placed at `at` would join the network: the nearest spot on the nearest route within
 *  `SPUR_REACH_FT`, or null when no route is that close. */
export function spurTarget(L: SimLayout, at: XY): { id: string; at: XY } | null {
  // Curved routes are left alone: splitting one for a spur would straighten it.
  const net = withHighways(L)
  return nearestRoute({ ...net, segments: net.segments.filter(s => !s.curve) }, at, SPUR_REACH_FT)
}

/**
 * Place a point on open floor and join it to a route with a short spur (two-way, single-lane — one
 * vehicle in the stub at a time): the route is split at `join.at` and the spur runs from there to the
 * point. Falls back to a plain placement when the route is gone.
 */
export function placeWithSpur<T extends SimLayout>(L: T, at: XY, type: SimPointType, role: SimRole | undefined, join: { id: string; at: XY }): { layout: T; id: string } {
  const placed = addPoint(L, at, type, role)
  const spur = { dir: 'two', lane: 'single' } as const
  // Nearest spot is a route's end (the point was placed past it): join that end — no split, no
  // zero-length route.
  const s = L.segments.find(q => q.id === join.id)
  const end = s && [s.a, s.b].find(id => { const q = L.points.find(p => p.id === id); return q && Math.hypot(q.x - join.at.x, q.y - join.at.y) < 1e-6 })
  if (end) return { layout: addSegment(placed.layout, end, placed.id, spur).layout, id: placed.id }
  const split = splitSegment(placed.layout, join.id, join.at)
  if (!split) return placed
  return { layout: addSegment(split.layout, split.id, placed.id, spur).layout, id: placed.id }
}

/** The next direction for a route when its badge is clicked: two-way → one-way → the other way. */
export function nextDirection(dir: SimSegment['dir']): SimSegment['dir'] {
  return dir === 'two' ? 'ab' : dir === 'ab' ? 'ba' : 'two'
}
