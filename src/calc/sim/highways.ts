// src/calc/sim/highways.ts — highways (Milestone 7, spec "Highways"). PURE.
// A highway is stored as a rectangle and a direction only. Its routes are derived here, for the run,
// distances, validation and snapping alike: the centre line split wherever a point sits on it, where
// another highway's centre line crosses it, and at its ends. Nothing derived is stored.

import { closestOnLine, insidePolygon, insideRect, polygonsTouch, rectCorners } from './geometry'
import type { SimHighway, SimLayout, SimPoint, SimSegment } from './types'

type XY = { x: number; y: number }

/** A point this close to a centre line is on the highway (and joins it), ft. */
export const ON_HIGHWAY_FT = 0.75
/** Derived ids start with this; they are never stored. */
export const DERIVED = 'hw:'

const unit = (h: SimHighway) => { const r = (h.angleDeg * Math.PI) / 180; return { x: Math.cos(r), y: Math.sin(r) } }

/** The centre line's two ends: `a` (the start end) and `b`. */
export function highwayEnds(h: SimHighway): { a: XY; b: XY } {
  const u = unit(h), half = h.lengthFt / 2
  return { a: { x: h.x - u.x * half, y: h.y - u.y * half }, b: { x: h.x + u.x * half, y: h.y + u.y * half } }
}

/** A highway between two ends, at `widthFt`. */
export function highwayFromEnds(a: XY, b: XY, widthFt: number, rest: Omit<SimHighway, 'x' | 'y' | 'lengthFt' | 'widthFt' | 'angleDeg'>): SimHighway {
  return { ...rest, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, lengthFt: Math.hypot(b.x - a.x, b.y - a.y), widthFt, angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/** The highway as a rectangle (the same rotated-rectangle rule as fixed objects). */
const asRect = (h: SimHighway) => ({ x: h.x - h.lengthFt / 2, y: h.y - h.widthFt / 2, w: h.lengthFt, h: h.widthFt, rotationDeg: h.angleDeg })

/** The rectangle's corners (for drawing and hit tests). */
export const highwayCorners = (h: SimHighway): XY[] => rectCorners(asRect(h))

/** Inside the rectangle? */
export const insideHighway = (h: SimHighway, p: XY) => insideRect(asRect(h), p)

/** The highways a lasso (a closed loop, ft) touches — anything it crosses or encloses. */
export function highwaysTouching(L: SimLayout, loop: XY[]): string[] {
  return (L.highways ?? []).filter(h => polygonsTouch(loop, highwayCorners(h))).map(h => h.id)
}

type Ends = { a: XY; b: XY }

/** Where two centre lines cross, or null; `ends` also counts touching at an end (a corner or a T). */
function crossing(p: Ends, q: Ends, ends = false): XY | null {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }
  const d = r.x * s.y - r.y * s.x
  if (Math.abs(d) < 1e-9) return null
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / d, u = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / d
  const lo = ends ? -1e-6 : 1e-6, hi = ends ? 1 + 1e-6 : 1 - 1e-6
  return t > lo && t < hi && u > lo && u < hi ? { x: p.a.x + r.x * t, y: p.a.y + r.y * t } : null
}

/** One expansion per stored layout: the editor, readiness, the graph and the run all ask for it. */
const expanded = new WeakMap<SimLayout, SimLayout>()

/**
 * The layout with its highways turned into routes (derived points and segments, ids starting `hw:`).
 * The same layout comes back when it has none; the result has no `highways`, so a second call is a
 * no-op. Each derived segment carries its highway and real width. Cached per layout object, so the
 * derived segments keep their identity until the layout changes.
 */
export function withHighways<T extends SimLayout>(L: T): T {
  const hs = L.highways ?? []
  if (!hs.length) return L
  const hit = expanded.get(L)
  if (hit) return hit as T
  const ends = hs.map(highwayEnds)
  const points: SimPoint[] = [...L.points]
  const junction = (id: string, at: XY) => { points.push({ id, x: at.x, y: at.y, type: 'junction' }); return id }
  const near = (at: XY) => points.find(p => Math.hypot(p.x - at.x, p.y - at.y) <= ON_HIGHWAY_FT)
  // Ends: an existing point there is joined; otherwise a derived junction.
  hs.forEach((h, i) => { for (const [k, at] of Object.entries(ends[i])) if (!near(at)) junction(`${DERIVED}${h.id}:${k}`, at) })
  // Crossings: one derived junction shared by both highways.
  hs.forEach((h, i) => { for (let j = i + 1; j < hs.length; j++) { const at = crossing(ends[i], ends[j]); if (at && !near(at)) junction(`${DERIVED}x:${h.id}:${hs[j].id}`, at) } })
  const segments: SimSegment[] = [...L.segments]
  hs.forEach((h, i) => {
    const { a, b } = ends[i]
    const on = points.flatMap(p => { const r = closestOnLine(a, b, p); return r.dist <= ON_HIGHWAY_FT ? [{ id: p.id, t: r.t }] : [] })
      .sort((x, y) => x.t - y.t)
    const lane = h.dir === 'two' ? h.lane ?? 'two' : 'single'
    // Consecutive points along the line are joined (two facing each other across it too); a point
    // stacked exactly on the one before is left out rather than breaking the chain.
    const at = new Map(points.map(p => [p.id, p]))
    let prev = on[0], k = 0
    for (const p of on.slice(1)) {
      const q = at.get(p.id)!, r = at.get(prev.id)!
      if (Math.hypot(q.x - r.x, q.y - r.y) < 1e-6) continue
      segments.push({ id: `${DERIVED}${h.id}:${k++}`, a: prev.id, b: p.id, dir: h.dir, lane, highwayId: h.id, widthFt: h.widthFt })
      prev = p
    }
  })
  const { highways: _h, ...rest } = L
  const out = { ...rest, points, segments } as T
  expanded.set(L, out)
  return out
}

// ---- Where highways connect (owner, 2026-11-16) ------------------------------------------------------

/** Two highways joined: the overlap of their bands is one junction (the floor reads as one aisle, and
 *  the engine lets one vehicle through at a time). `poly` is that area, ft. */
export interface HighwayJoin { ids: [string, string]; at: XY; poly: XY[] }
/** A highway end joined to nothing. `near`: a near miss — another highway's centre line within reach;
 *  `join` is how one click joins them: which highway end moves, and to where (straight along that
 *  highway's own line when it can — this one's, else the other's that also stops short — else the
 *  nearest spot). */
export interface LooseEnd { id: string; end: 'a' | 'b'; at: XY; near: XY | null; join: { id: string; end: 'a' | 'b'; to: XY } | null }

/** How far past a band an end may stop and still count as a near miss, ft. */
const NEAR_MISS_FT = 6

/** Clip convex polygon `p` by convex polygon `q` (Sutherland–Hodgman; both counter- or clockwise). */
function clipConvex(p: XY[], q: XY[]): XY[] {
  const area = (r: XY[]) => r.reduce((s, a, i) => { const b = r[(i + 1) % r.length]; return s + a.x * b.y - b.x * a.y }, 0)
  const sign = Math.sign(area(q)) || 1
  let out = p
  for (let i = 0; i < q.length && out.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length]
    const inside = (c: XY) => sign * ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) >= -1e-9
    const cut = (c: XY, d: XY): XY => {
      const ex = b.x - a.x, ey = b.y - a.y
      const t = (ex * (a.y - c.y) - ey * (a.x - c.x)) / (ex * (d.y - c.y) - ey * (d.x - c.x))
      return { x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t }
    }
    const inp = out; out = []
    for (let j = 0; j < inp.length; j++) {
      const c = inp[j], d = inp[(j + 1) % inp.length]
      if (inside(d)) { if (!inside(c)) out.push(cut(c, d)); out.push(d) } else if (inside(c)) out.push(cut(c, d))
    }
  }
  return out
}

/** A highway's rectangle grown by `m` ft all round (so a junction also hides the edge lines at its mouth). */
const grown = (h: SimHighway, m: number) => rectCorners({ x: h.x - h.lengthFt / 2 - m, y: h.y - h.widthFt / 2 - m, w: h.lengthFt + 2 * m, h: h.widthFt + 2 * m, rotationDeg: h.angleDeg })

/**
 * Where highways connect, and the ends that connect to nothing. Two highways join where their centre
 * lines cross, where one's end sits on the other's centre line (a T), or where their ends meet (a
 * corner — its junction fills the outer corner too). The same rule `withHighways` routes by.
 */
export function highwayConnections(L: SimLayout): { joins: HighwayJoin[]; loose: LooseEnd[] } {
  const hs = L.highways ?? []
  const ends = hs.map(highwayEnds)
  const joins: HighwayJoin[] = []
  const joinedEnd = new Set<string>()
  const on = (p: XY, e: { a: XY; b: XY }) => closestOnLine(e.a, e.b, p).dist <= ON_HIGHWAY_FT
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const A = hs[i], B = hs[j], eA = ends[i], eB = ends[j]
    const x = crossing(eA, eB)
    const endsA = (['a', 'b'] as const).filter(k => on(eA[k], eB)), endsB = (['a', 'b'] as const).filter(k => on(eB[k], eA))
    if (!x && !endsA.length && !endsB.length) continue
    endsA.forEach(k => joinedEnd.add(`${A.id}:${k}`)); endsB.forEach(k => joinedEnd.add(`${B.id}:${k}`))
    const at = x ?? (endsA.length ? eA[endsA[0]] : eB[endsB[0]])
    let poly = clipConvex(grown(A, 0.25), grown(B, 0.25))
    if (endsA.length && endsB.length) {
      // A corner: a square at the meeting point, along A and across it, fills the outer corner.
      const u = { x: (eA.b.x - eA.a.x) / (A.lengthFt || 1), y: (eA.b.y - eA.a.y) / (A.lengthFt || 1) }
      const hu = B.widthFt / 2 + 0.25, hn = A.widthFt / 2 + 0.25
      poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => ({ x: at.x + u.x * hu * s - u.y * hn * t, y: at.y + u.y * hu * s + u.x * hn * t }))
    }
    if (poly.length >= 3) joins.push({ ids: [A.id, B.id], at, poly })
  }
  /** Where end `k` of highway `i` meets highway `j`'s centre line going straight on, within reach. */
  const straightOn = (i: number, k: 'a' | 'b', j: number): XY | null => {
    const at = ends[i][k], from = ends[i][k === 'a' ? 'b' : 'a']
    const len = Math.hypot(at.x - from.x, at.y - from.y) || 1
    const reach = hs[j].widthFt / 2 + hs[i].widthFt / 2 + NEAR_MISS_FT
    const x = crossing({ a: from, b: { x: at.x + ((at.x - from.x) / len) * reach * 2, y: at.y + ((at.y - from.y) / len) * reach * 2 } }, ends[j], true)
    return x && Math.hypot(x.x - at.x, x.y - at.y) <= reach ? x : null
  }
  const loose: LooseEnd[] = []
  hs.forEach((h, i) => {
    for (const k of ['a', 'b'] as const) {
      const at = ends[i][k]
      if (joinedEnd.has(`${h.id}:${k}`) || L.points.some(p => Math.hypot(p.x - at.x, p.y - at.y) <= ON_HIGHWAY_FT)) continue
      // A near miss: the closest other highway whose centre line is within reach of this end.
      let j = -1, best = Infinity, near: XY | null = null
      hs.forEach((o, n) => {
        if (n === i) return
        const c = closestOnLine(ends[n].a, ends[n].b, at)
        if (c.dist <= o.widthFt / 2 + h.widthFt / 2 + NEAR_MISS_FT && c.dist < best) { best = c.dist; j = n; near = { x: c.x, y: c.y } }
      })
      let join: LooseEnd['join'] = null
      if (j >= 0) {
        const mine = straightOn(i, k, j)
        // Or the other highway stops short of this one: extend it straight instead.
        const theirs = mine ? null : (['a', 'b'] as const).map(e => ({ e, x: straightOn(j, e, i) })).find(t => t.x && !joinedEnd.has(`${hs[j].id}:${t.e}`))
        join = mine ? { id: h.id, end: k, to: mine } : theirs ? { id: hs[j].id, end: theirs.e, to: theirs.x! } : { id: h.id, end: k, to: near! }
      }
      loose.push({ id: h.id, end: k, at, near, join })
    }
  })
  return { joins, loose }
}

/** Is `p` inside any of these junctions? (Arrows are not drawn inside a junction.) */
export const inJunction = (joins: HighwayJoin[], p: XY) => joins.some(j => insidePolygon(j.poly, p))
