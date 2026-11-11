// src/calc/sim/corners.ts — rounded corners (spec v2 §5.5). PURE: no React, no I/O.
// Where two straight routes meet at a plain junction, a vehicle does not drive the square corner:
// it follows an arc of its turning radius. The layout as drawn stays square; this returns the
// layout a vehicle drives, used to measure and to run. Intersections (three or more routes) and
// equipment points stay as drawn — a vehicle stops there anyway.

import type { SimLayout, SimSegment } from './types'

type XY = { x: number; y: number }
const unit = (a: XY, b: XY) => { const d = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / d, y: (b.y - a.y) / d, d } }

/** The layout with every two-route junction rounded to radius `r` ft. `r` 0 (turns in place, D-6)
 *  leaves it as drawn. A corner whose arc would not fit on its routes stays square. */
export function roundCorners<T extends SimLayout>(L: T, r: number): T {
  if (!(r > 0)) return L
  let out: T = L
  for (const j of L.points) {
    if (j.type !== 'junction') continue
    const segs = out.segments.filter(s => s.a === j.id || s.b === j.id)
    if (segs.length !== 2 || segs.some(s => s.curve)) continue
    const byId = new Map(out.points.map(p => [p.id, p]))
    const J = byId.get(j.id)!
    const [s1, s2] = segs
    const A = byId.get(s1.a === j.id ? s1.b : s1.a), B = byId.get(s2.a === j.id ? s2.b : s2.a)
    if (!A || !B) continue
    const u1 = unit(J, A), u2 = unit(J, B)
    const phi = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)))   // angle between the routes
    if (phi > Math.PI - 1e-3 || phi < 1e-3) continue                                // straight on, or folded back
    const d = r / Math.tan(phi / 2)                                                   // where the arc meets each route
    if (d >= u1.d || d >= u2.d) continue
    const bis = unit({ x: 0, y: 0 }, { x: u1.x + u2.x, y: u1.y + u2.y })
    const toMid = r / Math.sin(phi / 2) - r
    const p1 = { id: `${j.id}~1`, type: 'junction' as const, x: J.x + u1.x * d, y: J.y + u1.y * d }
    const p2 = { id: `${j.id}~2`, type: 'junction' as const, x: J.x + u2.x * d, y: J.y + u2.y * d }
    // Travel direction through the corner follows the routes: into J on s1 means p1 → p2.
    const into = (s: SimSegment) => (s.dir === 'two' ? null : (s.dir === 'ab') === (s.b === j.id))
    const in1 = into(s1), in2 = into(s2)
    const dir: SimSegment['dir'] = in1 === true || in2 === false ? 'ab' : in1 === false || in2 === true ? 'ba' : 'two'
    const arc: SimSegment = {
      id: `${j.id}~arc`, a: p1.id, b: p2.id, dir,
      lane: s1.lane === 'single' || s2.lane === 'single' ? 'single' : s1.lane ?? s2.lane,
      curve: { kind: 'arc', mid: { x: J.x + bis.x * toMid, y: J.y + bis.y * toMid } },
    }
    const reEnd = (s: SimSegment, p: string): SimSegment => (s.a === j.id ? { ...s, a: p } : { ...s, b: p })
    out = {
      ...out,
      points: [...out.points.filter(p => p.id !== j.id), p1, p2],
      segments: out.segments.flatMap(s => (s === s1 ? [reEnd(s, p1.id), arc] : s === s2 ? [reEnd(s, p2.id)] : [s])),
    }
  }
  return out
}
