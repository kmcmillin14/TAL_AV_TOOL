// src/calc/sim/clearance.ts — ANSI/ITSDF B56.5 clearance path (spec v2 §5.9, D-2). PURE.
// Owner rule (engineer-editable): below 1.2 m/s (3.94 ft/s) at least 6 in per side; at or above,
// 0.5 m (19.69 in) per side — measured from the widest point of the vehicle or its payload. Between
// two vehicles on a two-lane, two-way route the middle clearance is shared: one, not two.
//
// Per route, against the fixed objects:
//   tightest ≥ full-speed clearance → full speed
//   tightest ≥ low-speed clearance  → speed capped below the threshold ("B56.5 reduced clearance")
//   tightest <  low-speed clearance → violation: the route is blocked
// and a two-lane route where clearance + envelope + shared + envelope + clearance does not fit is
// flagged (one click makes it single-lane).

import { closestOnLine, segmentGeometry } from './geometry'
import { buildGraph, route } from './graph'
import { objectCorners, pointById } from './layoutEdit'
import type { SimLayout } from './types'

type XY = { x: number; y: number }

export interface ClearanceRule {
  /** Speed at which the larger clearance applies, ft/s (1.2 m/s). */
  thresholdFps: number
  /** Minimum clearance per side below the threshold, in. */
  lowSpeedIn: number
  /** Clearance per side at or above the threshold, in. */
  fullSpeedIn: number
  /** Two vehicles passing on a two-lane route share one clearance between them. */
  sharedBetweenVehicles: boolean
}

/** The owner's rule (D-2), stored imperial. Source chip: "Engineer rule — ANSI/ITSDF B56.5". */
export const B56_5_RULE: ClearanceRule = { thresholdFps: 3.94, lowSpeedIn: 6, fullSpeedIn: 19.69, sharedBetweenVehicles: true }

export const REDUCED_CLEARANCE = 'B56.5 reduced clearance'

export interface SegmentClearance {
  segId: string
  /** Envelope width used on this route, ft — the widest vehicle or payload that drives it. */
  envelopeFt: number
  lanes: 1 | 2
  /** Smallest clearance from an envelope edge to an object, in — null when no object is near. */
  tightestIn: number | null
  /** The callout at the tightest point: envelope edge → object. */
  callout: { from: XY; to: XY } | null
  status: 'clear' | 'full' | 'capped' | 'violation'
  /** Speed cap below the threshold, ft/s (capped routes only). */
  capFps?: number
  reason?: string
  /** Two-lane routes: do both envelopes and the clearances fit? (null on single-lane routes) */
  twoLaneFits: boolean | null
}

const IN = 12
/** Objects further than this from a route's envelope do not affect it, ft. */
const REACH_FT = 20
const SAMPLE_FT = 0.25

/** Nearest spot on an object's outline (its four corners) to `p`. */
function nearestOnObject(c: XY[], p: XY): { q: XY; d: number } {
  let best = { q: c[0], d: Infinity }
  for (let i = 0; i < 4; i++) {
    const q = closestOnLine(c[i], c[(i + 1) % 4], p)
    if (q.dist < best.d) best = { q: { x: q.x, y: q.y }, d: q.dist }
  }
  return best
}

type Box = { x0: number; y0: number; x1: number; y1: number }
const box = (ps: XY[]): Box => ({ x0: Math.min(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), x1: Math.max(...ps.map(p => p.x)), y1: Math.max(...ps.map(p => p.y)) })
/** Gap between two boxes, ft (0 when they overlap) — objects further than the reach are skipped whole. */
const boxGap = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1))

/**
 * Clearance per route. `envelopeFt(segId)` is the envelope width on that route (see `envelopes`).
 * Changing the rule re-derives every cap and violation at once (acceptance 33).
 */
export function segmentClearances(L: SimLayout, envelopeFt: (segId: string) => number, rule: ClearanceRule = B56_5_RULE): SegmentClearance[] {
  const byId = pointById(L)
  const objects = (L.objects ?? []).map(o => { const c = objectCorners(o); return { c, box: box(c) } })
  const low = rule.lowSpeedIn / IN, full = rule.fullSpeedIn / IN
  const middle = (c: number) => (rule.sharedBetweenVehicles ? c : 2 * c)   // between the two lanes
  return L.segments.flatMap((s): SegmentClearance[] => {
    const a = byId.get(s.a), b = byId.get(s.b)
    if (!a || !b) return []
    const env = envelopeFt(s.id)
    const lanes: 1 | 2 = s.dir === 'two' && s.lane !== 'single' ? 2 : 1
    // How far the outer envelope edge sits from the centreline, for a middle clearance `c`.
    const edgeAt = (c: number, l: 1 | 2) => (l === 2 ? middle(c) / 2 + env : env / 2)
    const g = segmentGeometry(a, b, s.curve)
    const n = Math.max(1, Math.ceil(g.length / SAMPLE_FT))
    // Nearest object on each side of the centreline: distance from the centreline, and where.
    const side = [{ d: Infinity, p: a as XY, q: a as XY, nx: 0, ny: 0 }, { d: Infinity, p: a as XY, q: a as XY, nx: 0, ny: 0 }]
    // A highway's own edges bound it like walls, half its width either side of the centre line — so
    // its width is judged by the same rule (full speed · slowed · blocked · second lane fits).
    if (s.widthFt) {
      const m = g.at(g.length / 2), half = s.widthFt / 2
      side[0] = { d: half, p: { x: m.x, y: m.y }, q: { x: m.x - m.ty * half, y: m.y + m.tx * half }, nx: -m.ty, ny: m.tx }
      side[1] = { d: half, p: { x: m.x, y: m.y }, q: { x: m.x + m.ty * half, y: m.y - m.tx * half }, nx: m.ty, ny: -m.tx }
    }
    // Objects whose box is beyond reach of the route's box cannot be nearest — skip them whole
    // (1 ft margin covers a curve's bulge between the 9 box samples).
    const segBox = box(Array.from({ length: 9 }, (_, i) => g.at((g.length * i) / 8)))
    for (const o of objects) {
      if (boxGap(segBox, o.box) - env / 2 - 1 > REACH_FT + full) continue
      for (let i = 0; i <= n; i++) {
        const at = g.at((g.length * i) / n)
        const { q, d } = nearestOnObject(o.c, at)
        if (d - env / 2 > REACH_FT + full) continue
        const k = at.tx * (q.y - at.y) - at.ty * (q.x - at.x) >= 0 ? 0 : 1   // left or right of travel
        if (d < side[k].d) side[k] = { d, p: { x: at.x, y: at.y }, q, nx: k === 0 ? -at.ty : at.ty, ny: k === 0 ? at.tx : -at.tx }
      }
    }
    const near = side.filter(x => isFinite(x.d))
    if (!near.length) return [{ segId: s.id, envelopeFt: env, lanes, tightestIn: null, callout: null, status: 'clear', twoLaneFits: lanes === 2 ? true : null }]
    const clearAt = (c: number, l: 1 | 2) => Math.min(...near.map(x => x.d - edgeAt(c, l)))   // tightest outer clearance, ft
    // A two-lane route too narrow for two envelopes is judged — and driven — as single-lane, flagged
    // so one click makes it single-lane (acceptance 32), never blocked for the second lane alone.
    const twoLaneFits = lanes === 2 ? clearAt(low, 2) >= low : null
    const judged: 1 | 2 = twoLaneFits === false ? 1 : lanes
    const at = (c: number) => clearAt(c, judged), edge = (c: number) => edgeAt(c, judged)
    const tight = near.reduce((m, x) => (x.d < m.d ? x : m))
    const tightFt = at(full) >= full ? at(full) : at(low)
    const status: SegmentClearance['status'] = at(full) >= full ? 'full' : at(low) >= low ? 'capped' : 'violation'
    const e = edge(status === 'full' ? full : low)
    return [{
      segId: s.id, envelopeFt: env, lanes,
      tightestIn: Math.round(tightFt * IN * 100) / 100,
      callout: { from: { x: tight.p.x + tight.nx * e, y: tight.p.y + tight.ny * e }, to: tight.q },
      status,
      ...(status === 'capped' ? { capFps: Math.floor(rule.thresholdFps * 100 - 1) / 100, reason: REDUCED_CLEARANCE } : {}),
      ...(status === 'violation' ? { reason: `Under ${rule.lowSpeedIn} in clearance — blocked` } : {}),
      twoLaneFits,
    }]
  })
}

/** The layout a vehicle drives under the rule: capped routes slowed, violations removed. */
export function applyClearance<T extends SimLayout>(L: T, results: SegmentClearance[]): T {
  const by = new Map(results.map(r => [r.segId, r]))
  return {
    ...L,
    segments: L.segments.flatMap(s => {
      const r = by.get(s.id)
      if (r?.status === 'violation') return []
      const lane = r?.twoLaneFits === false ? { lane: 'single' as const } : {}
      if (r?.capFps != null) return [{ ...s, ...lane, speedLimitFps: Math.min(s.speedLimitFps ?? Infinity, r.capFps) }]
      return [{ ...s, ...lane }]
    }),
  }
}

/**
 * Envelope width per route (acceptance 29): the widest of vehicle and payload on the loaded legs
 * (pick → drop), the vehicle alone elsewhere. Routes no flow uses get the widest empty vehicle.
 */
export function envelopes(
  L: SimLayout,
  flows: { fromPointId: string; toPointId: string; vehicleWidthFt: number }[],
  payloadWidthFt: number,
): (segId: string) => number {
  const G = buildGraph(L)
  const loaded = new Map<string, number>(), empty = Math.max(0, ...flows.map(f => f.vehicleWidthFt))
  for (const f of flows) {
    const a = G.idx.get(f.fromPointId), b = G.idx.get(f.toPointId)
    const r = a != null && b != null ? route(G, a, b) : null
    for (const e of r?.edges ?? []) {
      const id = L.segments[e.seg].id
      loaded.set(id, Math.max(loaded.get(id) ?? 0, f.vehicleWidthFt, payloadWidthFt))
    }
  }
  return id => Math.max(loaded.get(id) ?? 0, empty)
}

/**
 * How wide a route's aisle is drawn, ft (owner, 2026-11-11: "factor pallet size in lane generation"):
 * the envelope (wider of vehicle and pallet) plus the B56.5 full-speed clearance each side — and for a
 * two-way, two-lane route both envelopes with one shared clearance between them (D-2). With no
 * envelope yet (no vehicle drives it), the proof of concept's 10 ft two-lane / 6 ft single-lane.
 */
export function laneWidthFt(seg: { dir: 'two' | 'ab' | 'ba'; lane?: 'single' | 'two' }, envelopeFt = 0, rule: ClearanceRule = B56_5_RULE): number {
  const twoLanes = seg.dir === 'two' && seg.lane !== 'single'
  if (!(envelopeFt > 0)) return twoLanes ? 10 : 6
  const c = rule.fullSpeedIn / 12
  return twoLanes ? 2 * envelopeFt + 2 * c + (rule.sharedBetweenVehicles ? c : 2 * c) : envelopeFt + 2 * c
}
