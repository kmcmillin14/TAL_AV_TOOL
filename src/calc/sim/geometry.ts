// src/calc/sim/geometry.ts — segment geometry for the simulation. PURE.
// A segment is a straight line, a circular arc through a mid handle, or a cubic Bézier.
// Every shape answers: total length, and the point + unit tangent at a distance along it.

import type { SimCurve } from './types'

export interface Vec { x: number; y: number }
export interface Pose { x: number; y: number; tx: number; ty: number }

export interface SegmentGeometry {
  length: number
  curved: boolean
  /** Point and unit tangent at distance `s` from the start (clamped to [0, length]). */
  at(s: number): Pose
}

const BEZIER_SAMPLES = 128

export function segmentGeometry(a: Vec, b: Vec, curve?: SimCurve): SegmentGeometry {
  if (curve?.kind === 'arc') {
    const g = arcThrough(a, curve.mid, b)
    if (g) return g
  }
  if (curve?.kind === 'bezier') return bezier(a, curve.c1, curve.c2, b)
  return straight(a, b)
}

function straight(a: Vec, b: Vec): SegmentGeometry {
  const dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const tx = length > 0 ? dx / length : 1, ty = length > 0 ? dy / length : 0
  return {
    length, curved: false,
    at: s => { const k = length > 0 ? clamp(s, 0, length) / length : 0; return { x: a.x + dx * k, y: a.y + dy * k, tx, ty } },
  }
}

/** Circular arc from a to b passing through m. Collinear points → null (caller falls back to a line). */
function arcThrough(a: Vec, m: Vec, b: Vec): SegmentGeometry | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y
  const cx = (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d
  const cy = (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d
  const r = Math.hypot(a.x - cx, a.y - cy)
  const th0 = Math.atan2(a.y - cy, a.x - cx)
  const thm = Math.atan2(m.y - cy, m.x - cx)
  const th1 = Math.atan2(b.y - cy, b.x - cx)
  // choose the sweep direction (ccw or cw) whose path from a to b passes through m
  const ccw = (x: number) => ((x - th0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  const sweepCcw = ccw(th1)
  const sweep = ccw(thm) < sweepCcw ? sweepCcw : -(2 * Math.PI - sweepCcw)
  const length = r * Math.abs(sweep)
  const sgn = Math.sign(sweep)
  return {
    length, curved: true,
    at: s => {
      const th = th0 + sgn * clamp(s, 0, length) / r
      return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th), tx: -sgn * Math.sin(th), ty: sgn * Math.cos(th) }
    },
  }
}

function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec): SegmentGeometry {
  const pt = (t: number): Vec => {
    const u = 1 - t
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    }
  }
  const der = (t: number): Vec => {
    const u = 1 - t
    return {
      x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
    }
  }
  // cumulative arc length table (numerical integration on a dense polyline)
  const ts: number[] = [0], ls: number[] = [0]
  let prev = pt(0), acc = 0
  for (let i = 1; i <= BEZIER_SAMPLES; i++) {
    const t = i / BEZIER_SAMPLES, p = pt(t)
    acc += Math.hypot(p.x - prev.x, p.y - prev.y); ts.push(t); ls.push(acc); prev = p
  }
  const length = acc
  return {
    length, curved: true,
    at: s => {
      const target = clamp(s, 0, length)
      let lo = 0, hi = ls.length - 1
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ls[mid] < target) lo = mid; else hi = mid }
      const span = ls[hi] - ls[lo]
      const t = span > 0 ? ts[lo] + (ts[hi] - ts[lo]) * (target - ls[lo]) / span : ts[lo]
      const p = pt(t), d = der(t), n = Math.hypot(d.x, d.y) || 1
      return { x: p.x, y: p.y, tx: d.x / n, ty: d.y / n }
    },
  }
}

/** Distance from point p to the nearest point of a geometry (sampled every `step` ft). */
export function distanceToGeometry(g: SegmentGeometry, p: Vec, step = 0.05): number {
  let best = Infinity
  for (let s = 0; s <= g.length + 1e-9; s += step) {
    const q = g.at(s); const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < best) best = d
  }
  return best
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Heading in radians of a unit tangent. */
export const headingOf = (tx: number, ty: number) => Math.atan2(ty, tx)

/** Smallest absolute difference between two angles, radians. */
export function angleDiff(a: number, b: number): number {
  const d = ((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
  return Math.abs(d)
}
