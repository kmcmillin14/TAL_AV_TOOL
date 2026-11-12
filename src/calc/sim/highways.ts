// src/calc/sim/highways.ts — highways (Milestone 7, spec "Highways"). PURE.
// A highway is stored as a rectangle and a direction only. Its routes are derived here, for the run,
// distances, validation and snapping alike: the centre line split wherever a point sits on it, where
// another highway's centre line crosses it, and at its ends. Nothing derived is stored.

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

/** The rectangle's corners (for drawing and hit tests). */
export function highwayCorners(h: SimHighway): XY[] {
  const { a, b } = highwayEnds(h), u = unit(h), n = { x: -u.y * h.widthFt / 2, y: u.x * h.widthFt / 2 }
  return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }]
}

/** Where `p` falls along the centre line (t: 0 at `a`, 1 at `b`) and how far off it, ft. */
export function alongHighway(h: SimHighway, p: XY): { t: number; off: number; at: XY } {
  const { a, b } = highwayEnds(h), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, c = Math.max(0, Math.min(1, t))
  const at = { x: a.x + dx * c, y: a.y + dy * c }
  return { t, off: Math.hypot(p.x - at.x, p.y - at.y), at }
}

/** Inside the rectangle? */
export const insideHighway = (h: SimHighway, p: XY) => { const r = alongHighway(h, p); return r.t >= 0 && r.t <= 1 && r.off <= h.widthFt / 2 }

/** Where two centre lines cross, or null. */
function crossing(h: SimHighway, k: SimHighway): XY | null {
  const p = highwayEnds(h), q = highwayEnds(k)
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }
  const d = r.x * s.y - r.y * s.x
  if (Math.abs(d) < 1e-9) return null
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / d, u = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / d
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { x: p.a.x + r.x * t, y: p.a.y + r.y * t } : null
}

/**
 * The layout with its highways turned into routes (derived points and segments, ids starting `hw:`).
 * The same layout comes back when it has none; the result has no `highways`, so a second call is a
 * no-op. Each derived segment carries its highway and real width.
 */
export function withHighways<T extends SimLayout>(L: T): T {
  const hs = L.highways ?? []
  if (!hs.length) return L
  const points: SimPoint[] = [...L.points]
  const junction = (id: string, at: XY) => { points.push({ id, x: at.x, y: at.y, type: 'junction' }); return id }
  const near = (at: XY) => points.find(p => Math.hypot(p.x - at.x, p.y - at.y) <= ON_HIGHWAY_FT)
  // Ends: an existing point there is joined; otherwise a derived junction.
  for (const h of hs) for (const [k, at] of Object.entries(highwayEnds(h))) if (!near(at)) junction(`${DERIVED}${h.id}:${k}`, at)
  // Crossings: one derived junction shared by both highways.
  hs.forEach((h, i) => hs.slice(i + 1).forEach(k => { const at = crossing(h, k); if (at && !near(at)) junction(`${DERIVED}x:${h.id}:${k.id}`, at) }))
  const segments: SimSegment[] = [...L.segments]
  for (const h of hs) {
    const on = points.flatMap(p => { const r = alongHighway(h, p); return r.off <= ON_HIGHWAY_FT && r.t >= -1e-6 && r.t <= 1 + 1e-6 ? [{ id: p.id, t: r.t }] : [] })
      .sort((x, y) => x.t - y.t)
    const lane = h.dir === 'two' ? h.lane ?? 'two' : 'single'
    on.slice(1).forEach((p, k) => {
      if (p.t - on[k].t < 1e-6) return
      segments.push({ id: `${DERIVED}${h.id}:${k}`, a: on[k].id, b: p.id, dir: h.dir, lane, highwayId: h.id, widthFt: h.widthFt })
    })
  }
  const { highways: _h, ...rest } = L
  return { ...rest, points, segments } as T
}

/** The highway a derived segment id belongs to. */
export function highwayOfSegment(L: SimLayout, segId: string): SimHighway | undefined {
  if (!segId.startsWith(DERIVED)) return undefined
  const hid = segId.slice(DERIVED.length).split(':')[0]
  return L.highways?.find(h => h.id === hid)
}
