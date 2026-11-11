// src/calc/sim/layoutEdit.ts — pure edits on a simulation layout (spec v2 §5). PURE: no React, no I/O.
// Every function returns a new layout; the editor keeps the old one for undo. Units: feet.

import { roundCorners } from './corners'
import { segmentGeometry } from './geometry'
import { buildGraph, pathLen } from './graph'
import type { SimCurve, SimLayout, SimObject, SimPoint, SimPointType, SimRole, SimSegment } from './types'

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
  const a = s && byId.get(s.a), b = s && byId.get(s.b)
  if (!s || !a || !b) return null
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
  | { kind: 'object'; id: string }
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
  if (seg) return { kind: 'segment', id: seg.id, x: seg.x, y: seg.y }
  const obj = [...(L.objects ?? [])].reverse().find(o => insideObject(o, at))
  return obj ? { kind: 'object', id: obj.id } : null
}

/** A route's length along its line or curve, ft. */
export function segmentLengthFt(L: SimLayout, s: SimSegment, byId = pointById(L)): number {
  const a = byId.get(s.a), b = byId.get(s.b)
  return a && b ? segmentGeometry(a, b, s.curve).length : 0
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
    segments: L.segments.map(q => (q.curve?.kind === 'arc' ? { ...q, curve: { ...q.curve, mid: s(q.curve.mid) } }
      : q.curve?.kind === 'bezier' ? { ...q, curve: { ...q.curve, c1: s(q.curve.c1), c2: s(q.curve.c2) } }
      : q)),
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
export function repeatPoint<T extends SimLayout>(L: T, id: string, count: number, stepFt: number, dir: XY): { layout: T; ids: string[] } {
  const src = L.points.find(p => p.id === id)
  const n = Math.hypot(dir.x, dir.y)
  if (!src || count < 2 || !(n > 0)) return { layout: L, ids: src ? [id] : [] }
  const points = [...L.points], ids = [id]
  for (let k = 1; k < count; k++) {
    const pid = nextId('p', points)
    points.push({ ...src, id: pid, x: src.x + (dir.x / n) * stepFt * k, y: src.y + (dir.y / n) * stepFt * k, ...(src.name ? { name: nextName(src.name, k) } : {}) })
    ids.push(pid)
  }
  return { layout: { ...L, points }, ids }
}

/** Copy points — and the routes between them — `offset` ft away, with new ids and names. */
export function copyPoints<T extends SimLayout>(L: T, ids: string[], offset: XY): { layout: T; ids: string[] } {
  const pick = new Set(ids), map = new Map<string, string>()
  const points = [...L.points], segments = [...L.segments]
  const used = new Set(L.points.map(p => p.name).filter(Boolean))
  const freshName = (name: string) => { let k = 1, n = nextName(name, k); while (used.has(n)) n = nextName(name, ++k); used.add(n); return n }
  for (const p of L.points) {
    if (!pick.has(p.id)) continue
    const pid = nextId('p', points)
    map.set(p.id, pid)
    points.push({ ...p, id: pid, x: p.x + offset.x, y: p.y + offset.y, ...(p.name ? { name: freshName(p.name) } : {}) })
  }
  const shift = (q: XY) => ({ x: q.x + offset.x, y: q.y + offset.y })
  for (const s of L.segments) {
    if (!map.has(s.a) || !map.has(s.b)) continue
    const curve: SimCurve | undefined = s.curve?.kind === 'arc' ? { kind: 'arc', mid: shift(s.curve.mid) }
      : s.curve?.kind === 'bezier' ? { kind: 'bezier', c1: shift(s.curve.c1), c2: shift(s.curve.c2) } : undefined
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
      : { ...s, curve: s.curve.kind === 'arc' ? { kind: 'arc', mid: shift(s.curve.mid) } : { kind: 'bezier', c1: shift(s.curve.c1), c2: shift(s.curve.c2) } })),
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
export function objectCorners(o: SimObject): XY[] {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, th = ((o.rotationDeg ?? 0) * Math.PI) / 180
  const c = Math.cos(th), s = Math.sin(th)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
    const dx = (i * o.w) / 2, dy = (j * o.h) / 2
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
  })
}

function insideObject(o: SimObject, p: XY): boolean {
  const th = (-(o.rotationDeg ?? 0) * Math.PI) / 180, cx = o.x + o.w / 2, cy = o.y + o.h / 2
  const dx = p.x - cx, dy = p.y - cy
  const lx = dx * Math.cos(th) - dy * Math.sin(th), ly = dx * Math.sin(th) + dy * Math.cos(th)
  return Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2
}

/** Snap a spot to the fixed objects: an object corner within `radiusFt`, else the nearest point on an
 *  object's edge within `radiusFt`; otherwise the spot unchanged. Routes drawn along walls and rack
 *  faces then meet them exactly. */
export function snapToObjects(L: SimLayout, at: XY, radiusFt: number): { at: XY; snapped: 'corner' | 'edge' | null } {
  let best: { at: XY; d: number; kind: 'corner' | 'edge' } | null = null
  for (const o of L.objects ?? []) {
    const c = objectCorners(o)
    for (const q of c) {
      const d = Math.hypot(q.x - at.x, q.y - at.y)
      if (d <= radiusFt && (!best || best.kind !== 'corner' || d < best.d)) best = { at: q, d, kind: 'corner' }
    }
  }
  if (best) return { at: best.at, snapped: 'corner' }
  for (const o of L.objects ?? []) {
    const c = objectCorners(o)
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      const q = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(q.x - at.x, q.y - at.y)
      if (d <= radiusFt && (!best || d < best.d)) best = { at: q, d, kind: 'edge' }
    }
  }
  return best ? { at: best.at, snapped: 'edge' } : { at, snapped: null }
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
