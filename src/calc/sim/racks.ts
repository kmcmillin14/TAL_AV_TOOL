// src/calc/sim/racks.ts — racks (Milestone 7a, owner 2026-11-16/17). PURE.
// A rack is one endpoint: a point at the middle of its served face, with its body, levels and pallet
// in `point.rack`. Everything else — the position size, bays, positions, the top beam, the body's
// corners and each position for the run — is worked out here from the pallet and the face picked up.

import type { SimLayout, SimPoint, SimRack } from './types'

type XY = { x: number; y: number }
/** A Step 1 load as racks read it, in. */
export interface RackLoad { id: string; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }

/** Gaps (owner, 2026-11-17: "gaps are good"), in: beside each pallet, beam depth, lift-off above it. */
export const RACK_GAP_IN = 4, RACK_BEAM_IN = 5, RACK_LIFT_OFF_IN = 6

/** The rack's pallet, in — its load's dims, or the custom ones; null when none is chosen (or the load
 *  has no size). */
export function rackPallet(r: SimRack, loads: RackLoad[]): { l: number; w: number; h: number; loadId?: string } | null {
  const p = r.pallet
  if (!p) return null
  if ('loadId' in p) {
    const L = loads.find(q => q.id === p.loadId)
    return L?.lengthIn && L.widthIn && L.heightIn ? { l: L.lengthIn, w: L.widthIn, h: L.heightIn, loadId: L.id } : null
  }
  return { l: p.lengthIn, w: p.widthIn, h: p.heightIn }
}

export interface RackGeometry {
  pallet: { l: number; w: number; h: number; loadId?: string } | null
  /** Each position, in: width (face + gap), height (load + beam + lift-off), depth (the other side) —
   *  as calculated (`auto`) and as used (edits win). */
  auto: { slotIn: number; levelIn: number } | null
  slotIn: number; levelIn: number; depthIn: number
  /** The face picked up, in (short or long side of the pallet). */
  faceIn: number
  bayIn: number; bays: number
  /** Positions along the rack, and in all (× levels). */
  long: number; positions: number
  /** The top beam: (levels − 1) × level height, ft. */
  topBeamFt: number
  /** The body, ft: the face's two ends, then the back's. */
  corners: XY[]
  warnings: string[]
}

const unit = (deg: number) => { const r = (deg * Math.PI) / 180; return { x: Math.cos(r), y: Math.sin(r) } }

/** A rack's sizes and shape, from its pallet and the face picked up. */
export function rackGeometry(p: SimPoint, loads: RackLoad[]): RackGeometry | null {
  const r = p.rack
  if (!r) return null
  const pallet = rackPallet(r, loads)
  const short = pallet ? Math.min(pallet.l, pallet.w) : 0, long = pallet ? Math.max(pallet.l, pallet.w) : 0
  const faceIn = r.face === 'long' ? long : short
  const auto = pallet ? { slotIn: faceIn + RACK_GAP_IN, levelIn: pallet.h + RACK_BEAM_IN + RACK_LIFT_OFF_IN } : null
  const slotIn = r.slotIn ?? auto?.slotIn ?? 0, levelIn = r.levelIn ?? auto?.levelIn ?? 0
  const depthIn = r.face === 'long' ? short : long
  const bayIn = r.perBay * slotIn + RACK_GAP_IN
  const bays = pallet && bayIn > 0 ? Math.max(1, Math.floor((r.lengthFt * 12) / bayIn + 1e-6)) : 0   // a length set from a total lands exactly on a bay
  const longCount = bays * r.perBay
  const u = unit(r.angleDeg), n = { x: -u.y * r.away, y: u.x * r.away }, h = r.lengthFt / 2, off = r.offsetFt ?? 0
  const f0 = { x: p.x + n.x * off, y: p.y + n.y * off }   // the face's middle (the point stands off it, in the aisle)
  const a = { x: f0.x - u.x * h, y: f0.y - u.y * h }, b = { x: f0.x + u.x * h, y: f0.y + u.y * h }
  const back = (q: XY) => ({ x: q.x + n.x * r.depthFt, y: q.y + n.y * r.depthFt })
  const warnings: string[] = []
  if (!pallet) warnings.push('Choose the pallet')
  else if (r.depthFt * 12 < depthIn - 6) warnings.push(`Shallower than the pallet (${Math.round(depthIn)} in deep)`)
  return {
    pallet, auto, slotIn, levelIn, depthIn, faceIn, bayIn, bays, long: longCount, positions: longCount * r.levels,
    topBeamFt: ((r.levels - 1) * levelIn) / 12, corners: [a, b, back(b), back(a)], warnings,
  }
}

/** "12 long × 3 high = 36 positions". */
export const rackCount = (g: RackGeometry, levels: number) => `${g.long} long × ${levels} high = ${g.positions} positions`

/** The length that holds at least `total` positions: the fewest bays, ft (null without a pallet). */
export function rackLengthFor(p: SimPoint, loads: RackLoad[], total: number): number | null {
  const g = rackGeometry(p, loads), r = p.rack
  if (!g?.pallet || !r || !(total > 0)) return null
  const bays = Math.max(1, Math.ceil(total / (r.perBay * r.levels)))
  return (bays * g.bayIn) / 12
}

/**
 * Each position for the run: its lift height and its offset along the face from the rack's point, ft —
 * levels and bays cycled so consecutive moves spread over the rack (level fastest). Empty without a pallet.
 */
export function rackSlots(p: SimPoint, loads: RackLoad[]): { heightFt: number; alongFt: number }[] {
  const g = rackGeometry(p, loads), r = p.rack
  if (!g?.pallet || !r) return []
  const out: { heightFt: number; alongFt: number }[] = []
  const start = -(g.bays * g.bayIn) / 2
  for (let bay = 0; bay < g.bays; bay++) for (let j = 0; j < r.perBay; j++) for (let lv = 0; lv < r.levels; lv++) {
    const mid = start + bay * g.bayIn + RACK_GAP_IN + j * g.slotIn + g.slotIn / 2
    out.push({ heightFt: (lv * g.levelIn) / 12, alongFt: mid / 12 })
  }
  return out
}

/** A rack's average lift, ft — the mean of its positions' level heights (Sizing's one lift per move). */
export function rackMeanLiftFt(p: SimPoint, loads: RackLoad[]): number {
  const s = rackSlots(p, loads)
  return s.length ? Math.round((s.reduce((t, q) => t + q.heightFt, 0) / s.length) * 10) / 10 : 0
}

/** The layout with each rack's positions attached for the run (derived, never stored). */
export function withRackSlots<T extends SimLayout>(L: T, loads: RackLoad[]): T {
  if (!L.points.some(p => p.rack)) return L
  return { ...L, points: L.points.map(p => (p.rack ? { ...p, rackSlots: rackSlots(p, loads) } : p)) }
}

/**
 * A rack dragged out as a box (two corners, ft): its long side is the face; of the two long sides, the
 * one `served` scores lower (nearer a path) is served. Returns the point position and the rack.
 */
export function rackFromBox(c0: XY, c1: XY, served: (face: [XY, XY]) => number, base: Omit<SimRack, 'lengthFt' | 'angleDeg' | 'depthFt' | 'away'>): { at: XY; rack: SimRack } | null {
  const x0 = Math.min(c0.x, c1.x), x1 = Math.max(c0.x, c1.x), y0 = Math.min(c0.y, c1.y), y1 = Math.max(c0.y, c1.y)
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  const horiz = x1 - x0 >= y1 - y0
  // Faces as [start, end] in the direction the rack runs (+x or +y).
  const A: [XY, XY] = horiz ? [{ x: x0, y: y0 }, { x: x1, y: y0 }] : [{ x: x0, y: y0 }, { x: x0, y: y1 }]
  const B: [XY, XY] = horiz ? [{ x: x0, y: y1 }, { x: x1, y: y1 }] : [{ x: x1, y: y0 }, { x: x1, y: y1 }]
  const useA = served(A) <= served(B), f = useA ? A : B
  const angleDeg = horiz ? 0 : 90
  // Right of +x is +y; right of +y is −x. The body lies towards the other face.
  const away: 1 | -1 = horiz ? (useA ? 1 : -1) : (useA ? -1 : 1)
  return { at: { x: (f[0].x + f[1].x) / 2, y: (f[0].y + f[1].y) / 2 }, rack: { ...base, lengthFt: horiz ? x1 - x0 : y1 - y0, angleDeg, depthFt: horiz ? y1 - y0 : x1 - x0, away } }
}

/** The rack served from its other long side: the point moves across the body to stand as far off the
 *  other face; the body stays put. */
export function flipRack(p: SimPoint): SimPoint {
  const r = p.rack
  if (!r) return p
  const u = unit(r.angleDeg), n = { x: -u.y * r.away, y: u.x * r.away }, d = r.depthFt + 2 * (r.offsetFt ?? 0)
  return { ...p, x: p.x + n.x * d, y: p.y + n.y * d, rack: { ...r, away: (r.away === 1 ? -1 : 1) } }
}

/** A rack end moved to `to`, ft (the other end stays): longer or shorter along the face, never below `minFt`. */
export function stretchRack(p: SimPoint, end: 'a' | 'b', to: XY, minFt: number): SimPoint {
  const r = p.rack
  if (!r) return p
  const u = unit(r.angleDeg), h = r.lengthFt / 2
  const fixed = end === 'a' ? { x: p.x + u.x * h, y: p.y + u.y * h } : { x: p.x - u.x * h, y: p.y - u.y * h }
  const s = end === 'a' ? -1 : 1
  const len = Math.max(minFt, s * ((to.x - fixed.x) * u.x + (to.y - fixed.y) * u.y))
  return { ...p, x: fixed.x + (s * u.x * len) / 2, y: fixed.y + (s * u.y * len) / 2, rack: { ...r, lengthFt: len } }
}

/** A rack's two ends along its face, ft. */
export function rackEnds(p: SimPoint): { a: XY; b: XY } | null {
  const r = p.rack
  if (!r) return null
  const u = unit(r.angleDeg), h = r.lengthFt / 2
  return { a: { x: p.x - u.x * h, y: p.y - u.y * h }, b: { x: p.x + u.x * h, y: p.y + u.y * h } }
}
