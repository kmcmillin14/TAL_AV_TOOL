// src/calc/sim/engine.ts — the Fleet Simulation engine. PURE: no React, no I/O.
//
// Port of the TAL proof of concept (docs/superpowers/reference/fleet-simulation-poc/engine.js).
// Kept behaviour-for-behaviour (spec §6.5): zones hold one vehicle; the dead-end spur rule
// (vehicles wait at the gate); nearest claims first; zone handover at merges; following judged
// per sample point with the path direction; mutual-block tiebreak; gridlock after a 30 s
// wait-for cycle or 120 s behind a parked vehicle; fixed 0.25 s step.
// Changed (spec §11): vehicle per flow from the library; point ids instead of names; curved
// segments; single-lane segments (no passing); heading/approach rules; transfer, lift and
// battery rules shared with the Fleet Engine.

import { liftSeconds, transferSeconds } from '../flowMetrics'
import { angleDiff, headingOf, type Pose } from './geometry'
import { buildGraph, pathLen, route, type Edge, type Graph } from './graph'
import { rng } from './rng'
import type { Gridlock, SimFlag, SimFlow, SimLayout, SimPoint, SimSettings, TimeSplit, TransferOrientation, VehicleSimData } from './types'
import { defaultOrientation, resolveProfile, type VehicleProfile } from './vehicle'
import { emptySplit } from './results'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export const DT = 0.25
export const CYCLE_GRIDLOCK_S = 30
export const PARKED_BLOCK_S = 120
/** No vehicle with work moved or handled for this long while orders wait → reported as a stall. */
export const STALL_S = 120
/** Heading tolerance at a pick/drop before a reposition is needed (acceptance 25). */
export const HEADING_TOL_RAD = (5 * Math.PI) / 180
/** Same-direction test for following: cos(angle) above this counts as "same way". */
const SAME_WAY_COS = -0.3
/** In-lane test: the other vehicle heads within ~45° of the path at that point. */
const IN_LANE_COS = Math.SQRT1_2
/** Clearance between a waiting vehicle's body and a junction it has no permission for, ft (D-12). */
export const JUNCTION_CLEAR_FT = 2

type Mode = 'home' | 'free' | 'toHome' | 'toCharge' | 'toPick' | 'toDrop' | 'pick' | 'drop' | 'charging'
const MOVING = new Set<Mode>(['toPick', 'toDrop', 'toHome', 'toCharge'])

export interface FlowState {
  f: SimFlow
  prof: VehicleProfile
  /** How the vehicle meets the pick/drop for this flow's transfer method. */
  orientation: TransferOrientation
  from: number
  to: number
  rate: number
  iv: number
  next: number
  pickSec: number
  dropSec: number
  measuredFt: number
  gen: number
  done: number
  misSum: number
  waitSum: number
  dispatched: number
}

export interface Order { F: FlowState; t0: number; v: number | null; td: number }

export interface SimVehicle {
  i: number
  id: string
  prof: VehicleProfile
  node: number
  atNode: boolean
  nodes: number[]
  edges: Edge[]
  pi: number
  s: number
  x: number
  y: number
  /** Travel heading (direction of motion), radians. */
  th: number
  /** Body heading (+x of the vehicle frame, forks toward −x), radians. */
  h: number
  speed: number
  mode: Mode
  job: Order | null
  loaded: boolean
  soc: number
  held: Set<string>
  /** Junction nodes this vehicle has permission for (D-12). */
  heldJ: Set<number>
  tl: number
  repo: number
  want: number
  moved: number
  waitFor: number | null
  waitZone: string | null
  blockedBy: SimVehicle | null
  /** The block is head-on on a single-lane segment (no passing, no tiebreak). */
  headOn: boolean
  cycT: number
  parkT: number
  mustCharge: boolean
  chargeTrips: number
  socMin: number
  tm: TimeSplit
  /** Heading on arrival at every pick/drop and the heading the point requires (acceptance 25). */
  handlingLog: { node: number; arrivalH: number; required: number; repoSec: number }[]
}

export interface SimState {
  G: Graph
  P: SimSettings
  t: number
  rand: () => number
  orders: Order[]
  /** Orders not yet dispatched (lets dispatch skip a step with nothing to do). */
  waiting: number
  veh: SimVehicle[]
  locks: Map<string, number>
  /** Junction node → vehicle index holding permission for it (D-12). */
  jlocks: Map<number, number>
  flows: FlowState[]
  excluded: { flowId: string; why: string }[]
  /** [t, waiting orders] per vehicle type, sampled every 60 s. */
  series: Map<string, [number, number][]>
  gridlock: Gridlock | null
  /** Last time a vehicle with work moved or handled a load (stall detection). */
  lastProgress: number
  flags: SimFlag[]
  profiles: Map<string, VehicleProfile>
}

/** No routes drawn → nothing to simulate (spec §2.2, acceptance 1). */
export function layoutReady(layout: SimLayout): boolean {
  return layout.segments.length > 0
}

const canPick = (p: SimPoint) => p.role === 'pick' || p.role === 'pickDrop'
const canDrop = (p: SimPoint) => p.role === 'drop' || p.role === 'pickDrop'

/** An override's set values only: an empty (null/undefined) override never hides the JSON value. */
const definedOnly = <T extends object>(o: T | null | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, x]) => x != null)) as Partial<T>

/**
 * Build a simulation. Returns null when there is no layout to run.
 * `vehicles` is the library (each vehicle's `calc.sim` block is read from its JSON); `simData` holds
 * per-project overrides laid over that block, field by field.
 */
export function createSim(
  layout: SimLayout,
  flows: SimFlow[],
  vehicles: Vehicle[],
  settings: SimSettings,
  simData: Record<string, VehicleSimData | null | undefined> = {},
): SimState | null {
  if (!layoutReady(layout)) return null
  const G = buildGraph(layout)
  const P = settings
  const rand = rng(P.seed)
  const byId = new Map(vehicles.map(v => [v.id, v]))
  const profiles = new Map<string, VehicleProfile>()
  const S: SimState = {
    G, P, t: 0, rand, orders: [], waiting: 0, veh: [], locks: new Map(), jlocks: new Map(), flows: [], excluded: [],
    series: new Map(), gridlock: null, lastProgress: 0, flags: [], profiles,
  }
  const profileFor = (vid: string) => {
    let p = profiles.get(vid)
    if (!p) { const v = byId.get(vid); if (!v) return null; p = resolveProfile(v, { ...v.calc.sim, ...definedOnly(simData[vid]) }, P.pacePct); profiles.set(vid, p); S.flags.push(...p.flags) }
    return p
  }

  for (const f of flows) {
    const a = G.idx.get(f.fromPointId), b = G.idx.get(f.toPointId)
    const why =
      a == null || b == null ? 'Point not on the layout'
      : !canPick(G.points[a]) ? 'From point is not a Pick point'
      : !canDrop(G.points[b]) ? 'To point is not a Drop point'
      : !(f.thruPerHr > 0) ? 'No moves per hour'
      : !(P.demandPct > 0) ? 'Demand is 0%'
      : !byId.has(f.vehicleId) ? 'Vehicle not in the library'
      : !byId.get(f.vehicleId)!.transferMethods?.[f.transferMethodIdx ?? 0] ? 'Transfer method not on this vehicle'
      : !isFinite(pathLen(G, a, b)) ? 'No route'
      : null
    if (why) { S.excluded.push({ flowId: f.id, why }); continue }
    const prof = profileFor(f.vehicleId)!
    const transfer = prof.vehicle.transferMethods[f.transferMethodIdx ?? 0]
    const { loadSec, unloadSec } = transferSeconds(transfer, f.transferSecOverride)
    const orientation = transfer.orientation ?? defaultOrientation(transfer.method)
    if (!transfer.orientation) S.flags.push({ vehicleId: f.vehicleId, field: 'transferOrientation', message: `${transfer.method} on flow ${f.id}: transfer orientation not specified — ${orientation}` })
    const pa = G.points[a!], pb = G.points[b!]
    const lift = (p: SimPoint) => liftSeconds(p.heightFt ?? 0, transfer, prof.vehicle.calc.liftSpeedFps)
    const rate = f.thruPerHr * P.demandPct / 100
    const iv = 3600 / rate
    S.flows.push({
      f, prof, orientation, from: a!, to: b!, rate, iv,
      next: iv * (0.05 + 0.95 * rand()),
      pickSec: loadSec + lift(pa) + (pa.handshakeSec ?? 0),
      dropSec: unloadSec + lift(pb) + (pb.handshakeSec ?? 0),
      measuredFt: pathLen(G, a!, b!),
      gen: 0, done: 0, misSum: 0, waitSum: 0, dispatched: 0,
    })
  }

  // place each vehicle type's fleet at homes: chargers first, then parking
  const homes = [...G.chargers, ...G.parking]
  let k = 0
  for (const [vid, n] of Object.entries(P.fleet)) {
    const prof = profileFor(vid)
    if (!prof) { S.flags.push({ vehicleId: vid, field: 'fleet', message: `Vehicle ${vid} is not in the library — not placed` }); continue }
    const count = Math.max(0, Math.floor(n))
    for (let j = 0; j < count; j++) {
      if (k >= homes.length) { S.flags.push({ vehicleId: vid, field: 'homes', message: `${count - j} ${prof.vehicle.name} have no charger or parking spot and were not placed` }); break }
      const node = homes[k++], p = G.points[node], z = G.zone[node]!
      const i = S.veh.length
      S.locks.set(z, i)
      const soc = startSoc(prof, P)
      S.veh.push({
        i, id: `${vid}-${j + 1}`, prof, node, atNode: true, nodes: [node], edges: [], pi: 1, s: 0,
        x: p.x, y: p.y, th: -Math.PI / 2, h: -Math.PI / 2, speed: 0, mode: 'home', job: null, loaded: false,
        soc, held: new Set([z]), heldJ: new Set(), tl: 0, repo: 0, want: 0, moved: 0, waitFor: null, waitZone: null, blockedBy: null, headOn: false,
        cycT: 0, parkT: 0, mustCharge: false, chargeTrips: 0, socMin: soc,
        tm: emptySplit(), handlingLog: [],
      })
    }
  }
  if (P.staffedHr >= 24) S.flags.push({ field: 'startSoc', message: 'No off-shift window — vehicles start mid charge band' })
  for (const vid of profiles.keys()) S.series.set(vid, [])
  return S
}

function startSoc(p: VehicleProfile, P: SimSettings) {
  const b = p.battery
  if (!b) return 100
  return P.staffedHr < 24 ? b.maxSocPct : (b.chargeBelowPct + b.chargeUntilPct) / 2
}

// ---------- position along the current path ----------
function edgeLen(G: Graph, e: Edge) { return G.geo[e.seg].length }
function poseOn(G: Graph, e: Edge, s: number): Pose {
  const g = G.geo[e.seg]
  if (e.forward) return g.at(s)
  const p = g.at(g.length - s)
  return { x: p.x, y: p.y, tx: -p.tx, ty: -p.ty }
}
const curEdge = (v: SimVehicle) => (v.pi - 1 < v.edges.length ? v.edges[v.pi - 1] : null)

function startNode(v: SimVehicle) { return v.atNode ? v.node : v.nodes[v.pi] }
function distToStart(S: SimState, v: SimVehicle) { if (v.atNode) return 0; const e = curEdge(v)!; return edgeLen(S.G, e) - v.s }

function setRoute(S: SimState, v: SimVehicle, dst: number): boolean {
  if (v.atNode) {
    const r = route(S.G, v.node, dst); if (!r) return false
    v.nodes = r.nodes; v.edges = r.edges; v.pi = 1; v.s = 0
  } else {
    const e = curEdge(v)!, from = v.nodes[v.pi - 1], to = v.nodes[v.pi]
    const r = route(S.G, to, dst); if (!r) return false
    v.nodes = [from, ...r.nodes]; v.edges = [e, ...r.edges]; v.pi = 1
  }
  if (v.atNode && v.pi >= v.nodes.length) arrive(S, v)
  return true
}

function nearestFree(S: SimState, v: SimVehicle, nodes: number[]) {
  let best = -1, bd = Infinity
  const s = startNode(v), d0 = distToStart(S, v)
  for (const n of nodes) {
    const h = S.locks.get(S.G.zone[n]!)
    if (h != null && h !== v.i) continue
    const d = d0 + pathLen(S.G, s, n); if (d < bd) { bd = d; best = n }
  }
  return best
}
function reserve(S: SimState, v: SimVehicle, node: number) { const z = S.G.zone[node]!; S.locks.set(z, v.i); v.held.add(z) }
const needsCharge = (v: SimVehicle) => v.prof.battery != null && v.soc < v.prof.battery.chargeBelowPct

function goHome(S: SimState, v: SimVehicle) {
  let n = nearestFree(S, v, S.G.chargers); if (n < 0) n = nearestFree(S, v, S.G.parking)
  if (n < 0) { v.mode = 'free'; return false }
  reserve(S, v, n); v.mode = 'toHome'
  if (!setRoute(S, v, n)) { const z = S.G.zone[n]!; v.held.delete(z); S.locks.delete(z); v.mode = 'free'; return false }
  return true
}
function goCharge(S: SimState, v: SimVehicle) {
  v.mustCharge = true
  const n = nearestFree(S, v, S.G.chargers)
  if (n < 0) { if (v.mode !== 'home') goHome(S, v); else v.mode = 'home'; return }
  reserve(S, v, n); v.mode = 'toCharge'; setRoute(S, v, n)
}

function dispatch(S: SimState) {
  if (S.waiting === 0) return
  const exhausted = new Set<string>()
  for (const o of S.orders) {
    if (o.v != null) continue
    const F = o.F, vid = F.f.vehicleId
    if (exhausted.has(vid)) continue
    let best: SimVehicle | null = null, bd = Infinity
    for (const v of S.veh) {
      if (v.prof.vehicle.id !== vid) continue
      if (!(v.mode === 'home' || v.mode === 'toHome' || v.mode === 'free')) continue
      if (v.mustCharge || needsCharge(v)) continue
      if (v.mode === 'toHome' && inJunction(S, v)) continue   // D-12: no new job mid-crossing; a parked vehicle stays eligible
      const d = distToStart(S, v) + pathLen(S.G, startNode(v), F.from)
      if (d < bd) { bd = d; best = v }
    }
    if (!best || !isFinite(bd)) { exhausted.add(vid); continue }
    o.v = best.i; o.td = S.t; S.waiting--; F.waitSum += S.t - o.t0; F.dispatched++
    best.job = o; best.mode = 'toPick'; setRoute(S, best, F.from)
  }
}
/** Half the vehicle plus clearance: where it stops short of a junction or stub gate it may not enter. */
const bodyClear = (v: SimVehicle) => v.prof.lengthFt / 2 + JUNCTION_CLEAR_FT

function releaseJunction(S: SimState, v: SimVehicle, n: number) {
  v.heldJ.delete(n); if (S.jlocks.get(n) === v.i) S.jlocks.delete(n)
}

/** The vehicle's body reaches junction n — one test for dispatch and release. */
function overJunction(S: SimState, v: SimVehicle, n: number) {
  const q = S.G.points[n]
  return Math.hypot(q.x - v.x, q.y - v.y) <= bodyClear(v)
}

/** True while the vehicle's body is over a junction it holds permission for. */
function inJunction(S: SimState, v: SimVehicle) {
  for (const n of v.heldJ) if (overJunction(S, v, n)) return true
  return false
}

/** How far past its stop point a junction must already be decided: one step of travel, or the
 *  braking distance when the vehicle JSON gives a deceleration. */
function horizon(v: SimVehicle, target: number) {
  const brake = v.prof.decel ? (target * target) / (2 * v.prof.decel) : 0
  return Math.max(target * DT + 1, brake + target * DT)
}

/** Junctions less than one vehicle length + clearances apart are taken and kept as one block. */
const blockSpan = (v: SimVehicle) => v.prof.lengthFt + 2 * JUNCTION_CLEAR_FT

/** Body heading the vehicle needs at a point, from the point's approach heading and the
 *  transfer orientation (spec §6.4). */
function requiredHeading(v: SimVehicle, p: SimPoint, F: FlowState) {
  const approach = p.approachHeadingDeg != null ? (p.approachHeadingDeg * Math.PI) / 180 : v.th
  switch (F.orientation) {
    case 'rear': return approach + Math.PI      // forks first: the body faces away from the point
    case 'left': return approach - Math.PI / 2  // the point is on the vehicle's left
    case 'right': return approach + Math.PI / 2
    default: return approach                    // front, under
  }
}

function startHandling(S: SimState, v: SimVehicle, picking: boolean) {
  const F = v.job!.F, p = S.G.points[v.node]
  const req = requiredHeading(v, p, F)
  let repo = 0
  if (angleDiff(v.h, req) > HEADING_TOL_RAD && v.prof.travelDirection === 'single') {
    const pr = v.prof
    repo = (pr.approachDistanceFt != null ? pr.approachDistanceFt / pr.reverseSpeed : 0) + pr.reorientSec
  }
  v.handlingLog.push({ node: v.node, arrivalH: v.h, required: req, repoSec: repo })
  v.h = req
  v.repo = repo
  v.tl = picking ? F.pickSec : F.dropSec
  v.mode = picking ? 'pick' : 'drop'
}

function arrive(S: SimState, v: SimVehicle) {
  v.speed = 0
  if (v.mode === 'toPick') startHandling(S, v, true)
  else if (v.mode === 'toDrop') startHandling(S, v, false)
  else if (v.mode === 'toHome') v.mode = 'home'
  else if (v.mode === 'toCharge') { v.mode = 'charging'; v.chargeTrips++ }
}

function afterDrop(S: SimState, v: SimVehicle) {
  v.job = null; v.loaded = false; v.mode = 'free'
  if (needsCharge(v)) { goCharge(S, v); return }
  dispatch(S)
  if (v.mode === 'free') goHome(S, v)
}

/** Sample points along v's remaining path, every foot up to `look` ft: [x, y, travel dir, single-lane, distance]. */
function ahead(S: SimState, v: SimVehicle, look: number): [number, number, number, boolean, number][] {
  const out: [number, number, number, boolean, number][] = []
  let d = 0, s = v.atNode ? 0 : v.s
  for (let i = v.pi - 1; i < v.edges.length && d < look; i++, s = 0) {
    const e = v.edges[i], L = edgeLen(S.G, e), single = S.G.singleLane[e.seg]
    for (; s + 1 <= L && d < look; d += 1) {
      s += 1
      const p = poseOn(S.G, e, s); out.push([p.x, p.y, headingOf(p.tx, p.ty), single, d + 1])
    }
    d += L - s
  }
  return out
}

/** Distance from v's position to each remaining path node (index-aligned with v.nodes). */
function pathAccs(S: SimState, v: SimVehicle) {
  const a = new Array<number>(v.nodes.length).fill(0)
  if (v.pi >= v.nodes.length) return a
  let acc = edgeLen(S.G, v.edges[v.pi - 1]) - (v.atNode ? 0 : v.s)
  for (let i = v.pi; i < v.nodes.length; i++) {
    if (i > v.pi) acc += edgeLen(S.G, v.edges[i - 1])
    a[i] = acc
  }
  return a
}
/** Where v must hold zone z (path index i): at the spur's gate if the gate is still ahead. */
function claimPoint(S: SimState, v: SimVehicle, accs: number[], i: number, z: string) {
  const gate = S.G.zoneGate.get(z)!
  if (gate !== S.G.zoneNode.get(z)) for (let j = i; j >= v.pi; j--) if (v.nodes[j] === gate) return { dist: accs[j], atGate: true }
  return { dist: accs[i], atGate: false }
}
/** Distance to v's next claim point — an unheld zone or junction — so the nearest claims first. */
function nextClaimDist(S: SimState, v: SimVehicle, accs: number[] | null) {
  if (!accs) return Infinity
  for (let i = v.pi; i < v.nodes.length; i++) {
    const n = v.nodes[i], z = S.G.zone[n]
    if (S.G.junction[n] && !v.heldJ.has(n)) return accs[i] - bodyClear(v)
    if (z && !v.held.has(z)) return claimPoint(S, v, accs, i, z).dist
  }
  return Infinity
}

/** Cruise speed on the current edge: loaded/empty, capped on curves and by slow zones. */
function cruise(S: SimState, v: SimVehicle) {
  let c = v.loaded ? v.prof.speedLoaded : v.prof.speedEmpty
  const e = curEdge(v)
  if (e) {
    if (S.G.geo[e.seg].curved) c = Math.min(c, v.prof.turnSpeed)
    const lim = S.G.speedLimit[e.seg]; if (lim != null && lim > 0) c = Math.min(c, lim)
  }
  return c
}

function faceTravel(S: SimState, v: SimVehicle) {
  const e = curEdge(v); if (!e) return
  const p = poseOn(S.G, e, v.atNode ? 0 : v.s)
  v.th = headingOf(p.tx, p.ty)
  const end = v.loaded ? v.prof.preferredTravel.loaded : v.prof.preferredTravel.empty
  v.h = v.prof.travelDirection === 'single' && end === 'forksLeading' ? v.th + Math.PI : v.th
}

function nearestLabel(G: Graph, node: number) {
  let best: string | null = null, bd = Infinity
  G.points.forEach((p, i) => { if (p.name) { const d = Math.hypot(p.x - G.points[node].x, p.y - G.points[node].y); if (d < bd) { bd = d; best = p.name } } })
  return best ? 'near ' + best : 'on a route'
}

export function step(S: SimState) {
  if (S.gridlock) return
  const P = S.P, G = S.G
  S.t += DT
  const t = S.t
  // arrivals
  for (const F of S.flows) while (F.next <= t) {
    S.orders.push({ F, t0: F.next, v: null, td: 0 }); F.gen++; S.waiting++
    F.next += P.arrivals === 'random' ? -Math.log(1 - S.rand()) * F.iv : F.iv
  }
  dispatch(S)
  for (const v of S.veh) if (v.mode === 'free') goHome(S, v)
  for (const v of S.veh) if (v.mustCharge && v.mode === 'home' && G.points[v.node].type !== 'charger') goCharge(S, v)

  // plan: zone and junction permissions limit how far each vehicle may go; nearest claims first
  const accsOf = S.veh.map(v => (MOVING.has(v.mode) && v.pi < v.nodes.length ? pathAccs(S, v) : null))
  const order = S.veh.map(v => [v, nextClaimDist(S, v, accsOf[v.i])] as const)
    .sort((a, b) => a[1] - b[1] || a[0].i - b[0].i).map(e => e[0])
  for (const v of order) {
    v.want = 0; v.waitFor = null; v.waitZone = null; v.blockedBy = null; v.headOn = false
    const accs = accsOf[v.i]
    if (!accs) continue
    let limit = Infinity, stopAt = accs[v.nodes.length - 1]
    const gap = v.prof.lengthFt + 2
    for (let i = v.pi; i < v.nodes.length; i++) {
      const z = G.zone[v.nodes[i]]
      if (!z || v.held.has(z)) continue
      const { dist, atGate } = claimPoint(S, v, accs, i, z)
      if (dist > gap + P.safetyFt + 12) break
      const h = S.locks.get(z)
      if (h == null) { S.locks.set(z, v.i); v.held.add(z); continue }
      limit = atGate ? dist - bodyClear(v) : dist - gap
      v.waitZone = z; v.waitFor = h; break
    }
    // intersection permission (D-12): a junction holds one vehicle. Take it — with any junction less
    // than a vehicle length + clearance after it, as one block — before reaching the stop point, or
    // stop clear of it. Never enter a junction while still waiting for a zone just beyond it.
    const target = cruise(S, v)
    const stopOff = bodyClear(v)
    const reach = horizon(v, target)
    // Permission it can't use yet goes back, in path order. Kept: a junction past its stop point
    // (committed), one in the same block as the previous kept one, or one still imminent while the
    // vehicle is not waiting for a zone. Junctions off the new path are released in the move phase.
    if (v.heldJ.size) {
      let prevKept = -Infinity
      for (let i = v.pi; i < v.nodes.length; i++) {
        const n = v.nodes[i]
        if (!v.heldJ.has(n)) continue
        const keep = accs[i] < stopOff || accs[i] - prevKept <= blockSpan(v) || (v.waitZone == null && accs[i] - stopOff <= reach)
        if (keep) prevKept = accs[i]; else releaseJunction(S, v, n)
      }
    }
    for (let i = v.pi; i < v.nodes.length; i++) {
      const n = v.nodes[i], dist = accs[i]
      if (dist - stopOff > reach || dist - stopOff > limit) break   // nothing further is needed this step
      if (!G.junction[n] || v.heldJ.has(n)) continue
      let k = i
      for (let j = i + 1; j < v.nodes.length && accs[j] - accs[k] <= blockSpan(v); j++) if (G.junction[v.nodes[j]]) k = j
      let holder: number | null = null
      for (let j = i; j <= k; j++) {
        const h = S.jlocks.get(v.nodes[j])
        if (h != null && h !== v.i) { holder = h; break }
      }
      if (holder != null || v.waitZone != null) {
        limit = Math.min(limit, dist - stopOff)
        v.waitFor ??= holder
        break
      }
      for (let j = i; j <= k; j++) if (G.junction[v.nodes[j]]) { S.jlocks.set(v.nodes[j], v.i); v.heldJ.add(v.nodes[j]) }
      i = k
    }
    stopAt = Math.min(stopAt, Math.max(0, limit))
    // speed: instant to cruise without motion data; accel / decel-to-stop when the JSON has them
    let spd = target
    if (v.prof.accel != null && v.prof.decel != null) {
      spd = Math.min(target, v.speed + v.prof.accel * DT, Math.sqrt(2 * v.prof.decel * Math.max(0, stopAt)))
    }
    v.want = Math.max(0, Math.min(spd * DT, limit))
    faceTravel(S, v)
  }
  // following: stop for a vehicle within the safety gap ahead. Opposite traffic passes on a
  // two-lane segment; on a single-lane segment it blocks (spec §6.5.5).
  const longest = Math.max(0, ...S.veh.map(u => u.prof.lengthFt))
  for (const v of S.veh) {
    if (!(v.want > 0)) continue
    let pts: ReturnType<typeof ahead> | null = null   // sampled once, to the longest look-ahead any vehicle needs
    for (const u of S.veh) {
      if (u === v) continue
      const look = (v.prof.lengthFt + u.prof.lengthFt) / 2 + P.safetyFt
      const rad = Math.max(v.prof.vehicle.calc.widthFt, u.prof.vehicle.calc.widthFt), rad2 = rad * rad
      if (Math.abs(u.x - v.x) > look + rad || Math.abs(u.y - v.y) > look + rad) continue
      if (u.atNode && G.zone[u.node]) continue          // parked/handling on a zone: zones handle it
      pts = pts ?? ahead(S, v, (v.prof.lengthFt + longest) / 2 + P.safetyFt)
      // a vehicle waiting for a zone v holds gives way to v (D-11). It blocks v only when it
      // is in v's lane ahead going the same way — the queue case the handover rule below serves.
      const yields = u.waitZone != null && v.held.has(u.waitZone)
      // judge direction at the sample nearest u — around a corner the first sample within reach can
      // look perpendicular to traffic that is really in the opposite lane
      let hit: (typeof pts)[number] | undefined, best = rad2
      for (const p of pts) {
        if (p[4] > look) break
        const d2 = (p[0] - u.x) ** 2 + (p[1] - u.y) ** 2
        if (d2 < best) { best = d2; hit = p }
      }
      if (hit && !(hit[3] || (yields ? Math.cos(u.th - hit[2]) > IN_LANE_COS : Math.cos(u.th - hit[2]) > SAME_WAY_COS))) hit = undefined
      if (hit) { v.blockedBy = u; v.headOn = hit[3] && Math.cos(u.th - hit[2]) <= SAME_WAY_COS; break }
    }
  }
  // Two-lane passing (D-12). Routes are centrelines, so two vehicles meeting on a two-lane route —
  // each with the other on its path ahead — are in opposite lanes: the lower index proceeds (the POC
  // pair rule). Never on a single-lane head-on, and never for crossing traffic, which junction
  // permission keeps apart; whatever else blocks is a real gridlock and is reported.
  for (const v of S.veh) {
    const u = v.blockedBy
    if (u && u.blockedBy === v && v.i < u.i && !v.headOn && !u.headOn) v.blockedBy = null
  }
  // handover: a holder queued behind a vehicle that waits for the holder's zone passes it forward
  for (const v of S.veh) {
    const u = v.blockedBy
    if (u && u.waitZone && v.held.has(u.waitZone) && !(v.atNode && G.zone[v.node] === u.waitZone)) {
      const z = u.waitZone
      v.held.delete(z); S.locks.set(z, u.i); u.held.add(z); u.waitZone = null; u.waitFor = null
    }
  }
  for (const v of S.veh) if (v.blockedBy) { v.want = 0; v.waitFor = v.blockedBy.i }

  // move
  for (const v of S.veh) {
    let m = v.want
    v.moved = m
    v.speed = m / DT
    while (m > 1e-9 && v.pi < v.nodes.length) {
      const e = v.edges[v.pi - 1], L = edgeLen(G, e)
      const rest = L - (v.atNode ? 0 : v.s)
      if (v.atNode) { v.atNode = false; v.s = 0 }
      if (m >= rest - 1e-9) { m -= rest; v.node = v.nodes[v.pi]; v.pi++; v.s = 0; v.atNode = true; const q = G.points[v.node]; v.x = q.x; v.y = q.y }
      else { v.s += m; m = 0; const q = poseOn(G, e, v.s); v.x = q.x; v.y = q.y }
    }
    if (v.moved > 0 && v.pi < v.nodes.length) faceTravel(S, v)
    if (v.moved > 0 && v.job) S.lastProgress = S.t
    if (MOVING.has(v.mode) && v.pi >= v.nodes.length && v.atNode) arrive(S, v)
    // release junction permission once the vehicle's body has cleared the junction
    if (v.heldJ.size) for (const n of v.heldJ) {
      if (MOVING.has(v.mode) && v.nodes.indexOf(n, v.atNode ? v.pi - 1 : v.pi) >= 0) continue
      if (!overJunction(S, v, n)) releaseJunction(S, v, n)
    }
    // release zones left behind
    for (const z of v.held) {   // deleting the current entry inside a Set loop is safe
      const node = G.zoneNode.get(z)!, br = G.zoneBranch.get(z)!, gate = G.zoneGate.get(z)!
      const onRoute = MOVING.has(v.mode) && v.nodes.indexOf(node, v.atNode ? v.pi - 1 : v.pi) >= 0
      const here = v.atNode && v.node === node
      const next = v.pi < v.nodes.length ? v.nodes[v.pi] : -1
      // O-11 (owner: exiting vehicle first): a zone at the end of a spur — one-segment stubs included —
      // is held until the vehicle's body is out of the spur and clear of the gate. (The POC exempted
      // one-segment stubs and released inside them, which froze the fleet at the gate.) Zones on an
      // aisle keep the POC distance rule.
      const spurZone = gate !== node
      const onSpur = spurZone && ((v.atNode && br.has(v.node)) || br.has(next) || (!v.atNode && br.has(v.node)))
      if (onRoute || here || onSpur) continue
      if (Math.hypot(G.points[gate].x - v.x, G.points[gate].y - v.y) < (spurZone ? bodyClear(v) : v.prof.lengthFt + 1)) continue
      v.held.delete(z); if (S.locks.get(z) === v.i) S.locks.delete(z)
    }
  }

  // handling, energy, time split
  for (const v of S.veh) {
    const b = v.prof.battery
    const busyKw = b ? b.drawKw : 0
    let kw = b ? b.idleKw : 0
    if (v.mode === 'pick' || v.mode === 'drop') {
      kw = busyKw
      S.lastProgress = S.t
      if (v.repo > 0) { const r = Math.min(v.repo, DT); v.repo -= r; v.tm.reposition += r; v.tl -= DT - r; v.tm.handle += DT - r }
      else { v.tm.handle += DT; v.tl -= DT }
      if (v.repo <= 0 && v.tl <= 0) {
        if (v.mode === 'pick') {
          v.loaded = true
          v.mode = 'toDrop'; setRoute(S, v, v.job!.F.to)
        } else {
          const o = v.job!, F = o.F
          F.done++; F.misSum += S.t - o.td
          S.orders.splice(S.orders.indexOf(o), 1)
          afterDrop(S, v)
        }
      }
    } else if (MOVING.has(v.mode)) {
      kw = busyKw
      // a trip to a charger is charging logistics; heading home is idle (still dispatchable)
      if (v.mode === 'toCharge') v.tm.charge += DT
      else if (v.mode === 'toHome') v.tm.idle += DT
      else if (v.moved > 0) v.tm.travel += DT
      else v.tm.wait += DT
    } else if (v.mode === 'charging') v.tm.charge += DT
    else v.tm.idle += DT
    if (b) {
      const atCharger = v.atNode && G.points[v.node].type === 'charger' && (v.mode === 'home' || v.mode === 'charging')
      const dSoc = ((atCharger ? b.chargerKw : 0) - kw) * DT * b.pctPerKwSec
      v.soc = Math.max(0, Math.min(b.maxSocPct, v.soc + dSoc))
      v.socMin = Math.min(v.socMin, v.soc)
      if (v.mode === 'charging' && v.soc >= b.chargeUntilPct - 1e-9) { v.mode = 'home'; v.mustCharge = false }
      if (v.mode === 'home' && v.mustCharge && atCharger) v.mode = 'charging'
      if (v.mode === 'home' && !v.mustCharge && needsCharge(v)) {
        if (atCharger) { v.mustCharge = true; v.mode = 'charging'; v.chargeTrips++ } else goCharge(S, v)
      }
    }
  }
  // gridlock: a wait-for cycle that persists, or a route blocked by a parked vehicle
  for (const v of S.veh) {
    let u = v.waitFor, k = 0, cyc = false
    while (u != null && k <= S.veh.length) { if (u === v.i) { cyc = true; break } u = S.veh[u].waitFor; k++ }
    v.cycT = cyc ? v.cycT + DT : 0
    const h = v.waitFor != null ? S.veh[v.waitFor] : null
    v.parkT = h && !MOVING.has(h.mode) && h.mode !== 'pick' && h.mode !== 'drop' ? v.parkT + DT : 0
    if (v.cycT > CYCLE_GRIDLOCK_S || v.parkT > PARKED_BLOCK_S) {
      const node = v.pi < v.nodes.length ? v.nodes[v.pi] : v.node
      const p = G.points[node]
      S.gridlock = {
        t: S.t, kind: v.cycT > CYCLE_GRIDLOCK_S ? 'cycle' : 'parked', nodeId: p.id, vehicle: v.id,
        blockedBy: v.waitFor != null ? S.veh[v.waitFor].id : null, where: p.name ?? nearestLabel(G, node),
      }
      break
    }
  }
  if (!S.gridlock && S.orders.length > 0 && t - S.lastProgress > STALL_S && S.veh.some(v => v.job)) {
    const v = S.veh.find(x => x.job)!
    const node = v.pi < v.nodes.length ? v.nodes[v.pi] : v.node
    const p = G.points[node]
    S.gridlock = { t, kind: 'stall', nodeId: p.id, vehicle: v.id, blockedBy: v.waitFor != null ? S.veh[v.waitFor].id : null, where: p.name ?? nearestLabel(G, node) }
  }
  if (Math.floor(t / 60) > Math.floor((t - DT) / 60)) {
    for (const [vid, ser] of S.series) ser.push([t, S.orders.filter(o => o.v == null && o.F.f.vehicleId === vid).length])
  }
}

/** Advance `seconds` of simulated time (stops early on gridlock). Chunk size never changes results. */
export function runFor(S: SimState, seconds: number): SimState {
  const end = S.t + seconds
  while (S.t < end - 1e-9 && !S.gridlock) step(S)
  return S
}

