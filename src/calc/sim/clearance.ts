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

import { segmentGeometry } from './geometry'
import { buildGraph, route } from './graph'
import { objectCorners, pointById } from './layoutEdit'
import type { SimLayout, SimObject } from './types'

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

function nearestOnObject(o: SimObject, p: XY): { q: XY; d: number } {
  const c = objectCorners(o)
  let best = { q: c[0], d: Infinity }
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    const q = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < best.d) best = { q, d }
  }
  return best
}

/**
 * Clearance per route. `envelopeFt(segId)` is the envelope width on that route (see `envelopes`).
 * Changing the rule re-derives every cap and violation at once (acceptance 33).
 */
export function segmentClearances(L: SimLayout, envelopeFt: (segId: string) => number, rule: ClearanceRule = B56_5_RULE): SegmentClearance[] {
  const byId = pointById(L), objects = L.objects ?? []
  const low = rule.lowSpeedIn / IN, full = rule.fullSpeedIn / IN
  const middle = (c: number) => (rule.sharedBetweenVehicles ? c : 2 * c)   // between the two lanes
  return L.segments.flatMap((s): SegmentClearance[] => {
    const a = byId.get(s.a), b = byId.get(s.b)
    if (!a || !b) return []
    const env = envelopeFt(s.id)
    const lanes: 1 | 2 = s.dir === 'two' && s.lane !== 'single' ? 2 : 1
    // How far the outer envelope edge sits from the centreline, for a middle clearance `c`.
    const edge = (c: number) => (lanes === 2 ? middle(c) / 2 + env : env / 2)
    const g = segmentGeometry(a, b, s.curve)
    const n = Math.max(1, Math.ceil(g.length / SAMPLE_FT))
    // Nearest object on each side of the centreline: distance from the centreline, and where.
    const side = [{ d: Infinity, p: a as XY, q: a as XY, nx: 0, ny: 0 }, { d: Infinity, p: a as XY, q: a as XY, nx: 0, ny: 0 }]
    for (const o of objects) {
      for (let i = 0; i <= n; i++) {
        const at = g.at((g.length * i) / n)
        const { q, d } = nearestOnObject(o, at)
        if (d - env / 2 > REACH_FT + full) continue
        const k = at.tx * (q.y - at.y) - at.ty * (q.x - at.x) >= 0 ? 0 : 1   // left or right of travel
        if (d < side[k].d) side[k] = { d, p: { x: at.x, y: at.y }, q, nx: k === 0 ? -at.ty : at.ty, ny: k === 0 ? at.tx : -at.tx }
      }
    }
    const near = side.filter(x => isFinite(x.d))
    if (!near.length) return [{ segId: s.id, envelopeFt: env, lanes, tightestIn: null, callout: null, status: 'clear', twoLaneFits: lanes === 2 ? true : null }]
    const at = (c: number) => Math.min(...near.map(x => x.d - edge(c)))          // tightest outer clearance, ft
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
      twoLaneFits: lanes === 2 ? at(low) >= low : null,
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
      if (r?.capFps != null) return [{ ...s, speedLimitFps: Math.min(s.speedLimitFps ?? Infinity, r.capFps) }]
      return [s]
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
