// src/calc/sim/highways.ts — highways (Milestone 7, spec "Highways"). PURE.
// A highway is stored as a rectangle and a direction only. Its routes are derived here, for the run,
// distances, validation and snapping alike: the centre line split wherever a point sits on it, where
// another highway's centre line crosses it, and at its ends. Nothing derived is stored.

import { closestOnLine, insideRect, rectCorners } from './geometry'
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

type Ends = { a: XY; b: XY }

/** Where two centre lines cross, or null. */
function crossing(p: Ends, q: Ends): XY | null {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }
  const d = r.x * s.y - r.y * s.x
  if (Math.abs(d) < 1e-9) return null
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / d, u = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / d
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { x: p.a.x + r.x * t, y: p.a.y + r.y * t } : null
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
    on.slice(1).forEach((p, k) => {
      if (p.t - on[k].t < 1e-6) return
      segments.push({ id: `${DERIVED}${h.id}:${k}`, a: on[k].id, b: p.id, dir: h.dir, lane, highwayId: h.id, widthFt: h.widthFt })
    })
  })
  const { highways: _h, ...rest } = L
  const out = { ...rest, points, segments } as T
  expanded.set(L, out)
  return out
}
