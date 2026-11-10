/* TAL Fleet Simulation — proof-of-concept engine (pure: no DOM, no storage).
   Units: feet, seconds, kW, % SOC. Mirrors docs/superpowers/specs/2026-11-09-fleet-simulation-design.md §8. */

// ---- Vehicle data: copied verbatim from src/content/vehicles/cb18.json (calc + transferMethods) ----
const VEH = {
  id: 'cb18', name: 'CB18 AGF', manufacturer: 'Bastian Solutions', source: 'src/content/vehicles/cb18.json',
  widthFt: 4.19, lengthFt: 6.13, heightFt: 6.91, maxLiftHeightFt: 14.67, maxWeightLbs: 4000,
  speedLoadedFps: 9.84, speedUnloadedFps: 9.84, liftSpeedFps: 0.65,
  transfer: { method: 'Lift', loadTimeSec: 5, unloadTimeSec: 5 },
  voltageV: 48, ratedAh: 564, usableCapacityPct: 80, avgPowerDrawKw: 1.3, idlePowerDrawW: 150,
  chargerPowerKw: 2.9, minSocPct: 20, maxSocPct: 100,
}
// Drawn footprint: sprite is width × (width × aspect); forks included. Visual + spacing only.
const SPRITE_ASPECT = 420 / 181
const VIS_LEN = VEH.widthFt * SPRITE_ASPECT

// ---- Fleet Engine (same formulas as src/calc/flowMetrics.ts + src/calc/fleet.ts) ----
const ROUTE_LAYOUT_FACTORS = { low: 0.3, medium: 0.5, high: 0.7 }
const TARGET_UTILIZATION = 0.9

function engineCycle(f, distFt) {
  const fac = ROUTE_LAYOUT_FACTORS[f.tier] ?? 0.5
  const travel = distFt / (VEH.speedLoadedFps * fac) + distFt / (VEH.speedUnloadedFps * fac)
  const lift = f.liftFt > 0 ? f.liftFt / VEH.liftSpeedFps : 0
  return travel + VEH.transfer.loadTimeSec + VEH.transfer.unloadTimeSec + lift
}
function chargingAvailability(staffedHr) {
  const usableKwh = VEH.voltageV * VEH.ratedAh / 1000 * VEH.usableCapacityPct / 100
  const R = usableKwh / VEH.avgPowerDrawKw, Ch = usableKwh / VEH.chargerPowerKw
  const d = VEH.chargerPowerKw / (VEH.chargerPowerKw + VEH.avgPowerDrawKw)
  const z = Math.min(1, Math.max(0, 24 - staffedHr) / Ch)
  const free = z * R
  const worked = Math.min(staffedHr, free + Math.max(0, staffedHr - free) * d)
  return { A: Math.min(1, worked / staffedHr), dutyRatio: d, usableKwh }
}
function engineFleet(flows, staffedHr) {
  let raw = 0
  const perFlow = flows.map(f => {
    const cyc = f.typedFt > 0 ? engineCycle(f, f.typedFt) : null
    const r = cyc != null ? (f.thru || 0) * cyc / 3600 : 0
    raw += r
    return { cycle: cyc, raw: r }
  })
  const { A } = chargingAvailability(staffedHr)
  const base = Math.ceil(raw - 1e-9)
  const sold = raw > 0 ? Math.max(base, Math.ceil(raw / (A * TARGET_UTILIZATION) - 1e-9)) : 0
  return { raw, base, sold, A, perFlow }
}

// ---- Graph from the engineer-drawn layout ----
const norm = s => String(s || '').trim().toLowerCase()

function buildGraph(L) {
  const idx = new Map()
  L.points.forEach((p, i) => idx.set(p.id, i))
  const n = L.points.length
  const pts = L.points.map(p => [p.x, p.y])
  const adj = Array.from({ length: n }, () => [])
  for (const s of L.segments) {
    const a = idx.get(s.a), b = idx.get(s.b)
    if (a == null || b == null) continue
    const len = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1])
    if (s.dir !== 'ba') adj[a].push([b, len])
    if (s.dir !== 'ab') adj[b].push([a, len])
  }
  // one item (location position / charger / parking) per point; each item is a zone
  const zone = new Array(n).fill(null), kind = new Array(n).fill(null), label = new Array(n).fill(null)
  const locNodes = new Map()            // normalized name -> [node]
  const chargers = [], parking = []
  for (const l of L.locations) { const i = idx.get(l.pointId); if (i == null) continue
    zone[i] = 'L:' + l.id; kind[i] = l.type; label[i] = l.name
    const k = norm(l.name); if (!locNodes.has(k)) locNodes.set(k, []); locNodes.get(k).push(i) }
  L.chargers.forEach((c, j) => { const i = idx.get(c.pointId); if (i == null) return
    zone[i] = 'C:' + c.id; kind[i] = 'charger'; label[i] = 'Charger ' + (j + 1); chargers.push(i) })
  L.parking.forEach((c, j) => { const i = idx.get(c.pointId); if (i == null) return
    zone[i] = 'P:' + c.id; kind[i] = 'parking'; label[i] = 'Park ' + (j + 1); parking.push(i) })
  const zoneNode = new Map(); zone.forEach((z, i) => { if (z) zoneNode.set(z, i) })
  // Dead-end spurs: a zone at the end of a spur owns the whole spur. Vehicles wait at the
  // junction (the gate), not inside the spur — one vehicle in a dead-end spur at a time.
  const und = Array.from({ length: n }, () => new Set())
  for (let a = 0; a < n; a++) for (const [b] of adj[a]) { und[a].add(b); und[b].add(a) }
  const zoneGate = new Map(), zoneBranch = new Map()
  for (const [z, i] of zoneNode) {
    const branch = new Set([i]); let gate = i
    if (und[i].size === 1) {
      let prev = i, cur = [...und[i]][0]
      while (und[cur].size === 2 && !zone[cur]) { branch.add(cur); const nx = [...und[cur]].find(x => x !== prev); prev = cur; cur = nx }
      gate = cur
    }
    zoneGate.set(z, gate); zoneBranch.set(z, branch)
  }
  return { n, pts, adj, idx, zone, zoneNode, zoneGate, zoneBranch, kind, label, locNodes, chargers, parking, sp: new Map() }
}

// Dijkstra with a binary heap; one full tree per source, cached.
function tree(G, src) {
  if (G.sp.has(src)) return G.sp.get(src)
  const dist = new Float64Array(G.n).fill(Infinity), prev = new Int32Array(G.n).fill(-1)
  const h = [[0, src]]; dist[src] = 0
  const push = e => { h.push(e); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p } }
  const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i
      if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r
      if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m } } return top }
  while (h.length) { const [d, u] = pop(); if (d > dist[u]) continue
    for (const [w, len] of G.adj[u]) { const nd = d + len; if (nd < dist[w] - 1e-9) { dist[w] = nd; prev[w] = u; push([nd, w]) } } }
  const t = { dist, prev }; G.sp.set(src, t); return t
}
const pathLen = (G, a, b) => tree(G, a).dist[b]
function pathNodes(G, a, b) {
  const t = tree(G, a); if (!isFinite(t.dist[b])) return null
  const p = []; for (let u = b; u !== -1; u = t.prev[u]) { p.push(u); if (u === a) break }
  return p.reverse()
}
function measureFlow(G, f) {
  const A = G.locNodes.get(norm(f.from)) || [], B = G.locNodes.get(norm(f.to)) || []
  if (!A.length || !B.length) return { status: 'unplaced', ft: null }
  let best = Infinity, bestA = -1, bestB = -1
  for (const a of A) for (const b of B) { const d = pathLen(G, a, b); if (d < best) { best = d; bestA = a; bestB = b } }
  if (!isFinite(best)) return { status: 'noroute', ft: null }
  return { status: 'ok', ft: best, a: bestA, b: bestB }
}

// ---- Simulation ----
const DT = 0.25
const MOVING = new Set(['toPick', 'toDrop', 'toHome', 'toCharge'])
const STOPGAP = VIS_LEN + 2          // centre-to-centre gap kept behind a held zone
const CYCLE_GRIDLOCK_S = 30, PARKED_BLOCK_S = 120

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

/** settings: { fleet, pacePct, safetyFt, demandPct, arrivals, chargeAtPct, resumePct, seed } */
function createSim(layout, flows, settings) {
  const G = buildGraph(layout)
  const P = settings
  const r = rng(P.seed)
  const packKwh = VEH.voltageV * VEH.ratedAh / 1000
  const S = { G, P, t: 0, rng: r, orders: [], veh: [], locks: new Map(), packKwh,
    flows: [], excluded: [], hourly: [], series: [], heat: new Float64Array(G.n),
    zoneStats: new Map(), chargeTrips: 0, noHomeT: 0, gridlock: null }
  for (const f of flows) {
    const m = measureFlow(G, f)
    if (m.status !== 'ok' || !(f.thru > 0)) { S.excluded.push({ f, why: m.status !== 'ok' ? m.status : 'nothru' }); continue }
    const rate = f.thru * P.demandPct / 100
    const liftSec = f.liftFt > 0 ? f.liftFt / VEH.liftSpeedFps : 0
    const iv = 3600 / rate
    S.flows.push({ f, from: G.locNodes.get(norm(f.from)), to: G.locNodes.get(norm(f.to)), rate, iv,
      next: iv * (0.05 + 0.95 * r()), pickSec: VEH.transfer.loadTimeSec + liftSec / 2,
      dropSec: VEH.transfer.unloadTimeSec + liftSec / 2, measuredFt: m.ft,
      gen: 0, done: 0, misSum: 0, waitSum: 0, dispatched: 0 })
  }
  const homes = [...G.chargers, ...G.parking]
  for (let k = 0; k < P.fleet && k < homes.length; k++) {
    const node = homes[k], [x, y] = G.pts[node], z = G.zone[node]
    S.locks.set(z, k)
    S.veh.push({ id: k, x, y, h: -Math.PI / 2, node, atNode: true, path: [node], pi: 1, mode: 'home',
      job: null, loaded: false, soc: VEH.maxSocPct, held: new Set([z]), tl: 0, want: 0,
      waitFor: null, waitZone: null, cycT: 0, parkT: 0, mustCharge: false,
      tm: { travel: 0, handle: 0, wait: 0, charge: 0, idle: 0 } })
  }
  S.homesShort = Math.max(0, P.fleet - homes.length)
  return S
}

const needsCharge = (S, v) => v.soc < S.P.chargeAtPct
const zoneOf = (S, node) => S.G.zone[node]
const zstat = (S, z) => { let s = S.zoneStats.get(z); if (!s) { s = { occT: 0, waitT: 0, visits: 0, maxQ: 0 }; S.zoneStats.set(z, s) } return s }

function startNode(v) { return v.atNode ? v.node : v.path[v.pi] }
function distToStart(S, v) { if (v.atNode) return 0; const [x, y] = S.G.pts[v.path[v.pi]]; return Math.hypot(x - v.x, y - v.y) }

function setRoute(S, v, dst) {
  const s = startNode(v), p = pathNodes(S.G, s, dst)
  if (!p) return false
  v.path = p; v.pi = v.atNode ? 1 : 0; v.dst = dst
  if (v.pi >= v.path.length) arrive(S, v)
  return true
}

function nearestFree(S, v, nodes) {
  let best = -1, bd = Infinity; const s = startNode(v), d0 = distToStart(S, v)
  for (const n of nodes) { const z = zoneOf(S, n), h = S.locks.get(z)
    if (h != null && h !== v.id) continue
    const d = d0 + pathLen(S.G, s, n); if (d < bd) { bd = d; best = n } }
  return best
}
function reserve(S, v, node) { const z = zoneOf(S, node); S.locks.set(z, v.id); v.held.add(z) }

function goHome(S, v) {
  // "charges whenever it is not working": a free charger first, else parking
  let n = nearestFree(S, v, S.G.chargers); if (n < 0) n = nearestFree(S, v, S.G.parking)
  if (n < 0) { v.mode = 'free'; return false }
  reserve(S, v, n); v.mode = 'toHome'; setRoute(S, v, n); return true
}
function goCharge(S, v) {
  v.mustCharge = true
  const n = nearestFree(S, v, S.G.chargers)
  if (n < 0) { if (v.mode !== 'home') goHome(S, v); else v.mode = 'home'; return }
  reserve(S, v, n); v.mode = 'toCharge'; setRoute(S, v, n)
}

function dispatch(S) {
  for (const o of S.orders) {
    if (o.v != null) continue
    const F = o.F
    let best = null, bd = Infinity, bn = -1
    for (const v of S.veh) {
      if (!(v.mode === 'home' || v.mode === 'toHome' || v.mode === 'free')) continue
      if (v.mustCharge || needsCharge(S, v)) continue
      const s = startNode(v), d0 = distToStart(S, v)
      for (const n of F.from) { const d = d0 + pathLen(S.G, s, n); if (d < bd) { bd = d; best = v; bn = n } }
    }
    if (!best || !isFinite(bd)) break
    o.v = best.id; o.td = S.t; F.waitSum += S.t - o.t0; F.dispatched++
    best.job = o; best.mode = 'toPick'; setRoute(S, best, bn)
  }
}

function arrive(S, v) {
  const z = zoneOf(S, v.node)
  if (z) zstat(S, z).visits++
  if (v.mode === 'toPick') { v.mode = 'pick'; v.tl = v.job.F.pickSec }
  else if (v.mode === 'toDrop') { v.mode = 'drop'; v.tl = v.job.F.dropSec }
  else if (v.mode === 'toHome') { v.mode = 'home'; v.h = v.h }
  else if (v.mode === 'toCharge') { v.mode = 'charging'; S.chargeTrips++ }
}

function afterDrop(S, v) {
  v.job = null; v.loaded = false; v.mode = 'free'
  if (needsCharge(S, v)) { goCharge(S, v); return }
  dispatch(S)
  if (v.mode === 'free') goHome(S, v)
}

// points along v's path ahead, from its position, up to `look` ft
function ahead(S, v, look) {
  const out = []; let px = v.x, py = v.y, left = look, i = v.pi
  while (left > 0 && i < v.path.length) {
    const [tx, ty] = S.G.pts[v.path[i]], d = Math.hypot(tx - px, ty - py)
    const use = Math.min(d, left), dir = Math.atan2(ty - py, tx - px)
    for (let s = 1; s <= use; s += 1) out.push([px + (tx - px) * s / (d || 1), py + (ty - py) * s / (d || 1), dir])
    left -= d; px = tx; py = ty; i++
  }
  return out
}

function step(S) {
  if (S.gridlock) return
  const P = S.P, G = S.G
  S.t += DT; const t = S.t
  // arrivals
  for (const F of S.flows) while (F.next <= t) {
    S.orders.push({ F, t0: F.next, v: null }); F.gen++
    F.next += P.arrivals === 'random' ? -Math.log(1 - S.rng()) * F.iv : F.iv
  }
  dispatch(S)
  for (const v of S.veh) if (v.mode === 'free') goHome(S, v)
  for (const v of S.veh) if (v.mustCharge && v.mode === 'home' && G.kind[v.node] !== 'charger') goCharge(S, v)

  // plan: zone reservations limit how far each vehicle may go
  const pace = P.pacePct / 100
  // nearest vehicle to a free zone claims it first: plan in order of distance to the next unheld zone
  const order = S.veh.map(v => [v, nextZoneDist(S, v)]).sort((a, b) => a[1] - b[1] || a[0].id - b[0].id).map(e => e[0])
  for (const v of order) {
    v.want = 0; v.waitFor = null; v.waitZone = null; v.blockedBy = null
    if (!MOVING.has(v.mode) || v.pi >= v.path.length) continue
    const spd = (v.loaded ? VEH.speedLoadedFps : VEH.speedUnloadedFps) * pace
    const accs = pathAccs(S, v); let limit = Infinity
    for (let i = v.pi; i < v.path.length; i++) {
      const z = G.zone[v.path[i]]
      if (!z || v.held.has(z)) continue
      const { dist, atGate } = claimPoint(S, v, accs, i, z)
      if (dist > STOPGAP + P.safetyFt + 12) break
      const h = S.locks.get(z)
      if (h == null) { S.locks.set(z, v.id); v.held.add(z); continue }
      limit = atGate ? dist - (VIS_LEN / 2 + 2) : dist - STOPGAP; v.waitZone = z; v.waitFor = h; break
    }
    v.want = Math.max(0, Math.min(spd * DT, limit))
    // face the next node before the following check (a vehicle leaving a dead-end faces out)
    const [nx, ny] = G.pts[v.path[v.pi]]
    if (Math.hypot(nx - v.x, ny - v.y) > 1e-6) v.h = Math.atan2(ny - v.y, nx - v.x)
  }
  // following: stop for a same-direction vehicle within the safety gap ahead
  const look = VIS_LEN + P.safetyFt, rad = VEH.widthFt
  for (const v of S.veh) {
    if (!(v.want > 0)) continue
    let pts = null
    for (const u of S.veh) {
      if (u === v || Math.abs(u.x - v.x) > look + rad || Math.abs(u.y - v.y) > look + rad) continue
      pts = pts || ahead(S, v, look)
      if (u.atNode && G.zone[u.node]) continue                 // parked/handling on a zone: zones handle it
      // blocked only by a vehicle that is NOT heading against v's own path at that spot
      // (two-way segments are passing lanes); judged per sample so turns are handled
      if (pts.some(p => Math.hypot(p[0] - u.x, p[1] - u.y) < rad && Math.cos(u.h - p[2]) > -0.3)) { v.blockedBy = u; break }
    }
  }
  for (const v of S.veh) { const u = v.blockedBy; if (u && u.blockedBy === v && v.id < u.id) v.blockedBy = null }
  // a holder queued behind a vehicle that waits for the holder's zone hands the zone forward
  // (the one physically in front goes first — merge order at a junction)
  for (const v of S.veh) {
    const u = v.blockedBy
    if (u && u.waitZone && v.held.has(u.waitZone) && !(v.atNode && G.zone[v.node] === u.waitZone)) {
      const z = u.waitZone; v.held.delete(z); S.locks.set(z, u.id); u.held.add(z); u.waitZone = null; u.waitFor = null
    }
  }
  for (const v of S.veh) if (v.blockedBy) { v.want = 0; v.waitFor = v.blockedBy.id }

  // move
  for (const v of S.veh) {
    let m = v.want; v.moved = m
    while (m > 1e-9 && v.pi < v.path.length) {
      const n = v.path[v.pi], [tx, ty] = G.pts[n], d = Math.hypot(tx - v.x, ty - v.y)
      if (d > 1e-6) v.h = Math.atan2(ty - v.y, tx - v.x)
      v.atNode = false
      if (m >= d) { v.x = tx; v.y = ty; m -= d; v.node = n; v.pi++; v.atNode = true }
      else { v.x += (tx - v.x) / d * m; v.y += (ty - v.y) / d * m; m = 0 }
    }
    if (MOVING.has(v.mode) && v.pi >= v.path.length && v.atNode) arrive(S, v)
    // release zones left behind
    for (const z of [...v.held]) {
      const node = G.zoneNode.get(z), br = G.zoneBranch.get(z), gate = G.zoneGate.get(z)
      const onRoute = MOVING.has(v.mode) && v.path.slice(v.atNode ? v.pi - 1 : v.pi).includes(node)
      const here = v.atNode && v.node === node
      const next = v.pi < v.path.length ? v.path[v.pi] : -1
      const onSpur = br.size > 1 && ((v.atNode && br.has(v.node)) || br.has(next) || (!v.atNode && br.has(v.node)))
      if (onRoute || here || onSpur) continue
      if (Math.hypot(G.pts[gate][0] - v.x, G.pts[gate][1] - v.y) < VIS_LEN + 1) continue
      v.held.delete(z); if (S.locks.get(z) === v.id) S.locks.delete(z)
    }
  }

  // handling, energy, time split
  const pk = S.packKwh
  for (const v of S.veh) {
    let kw = VEH.idlePowerDrawW / 1000
    if (v.mode === 'pick' || v.mode === 'drop') {
      v.tm.handle += DT; kw = VEH.avgPowerDrawKw; v.tl -= DT
      zstat(S, G.zone[v.node]).occT += DT
      if (v.tl <= 0) {
        if (v.mode === 'pick') {
          v.loaded = true; const F = v.job.F
          let bn = -1, bd = Infinity
          for (const n of F.to) { const h = S.locks.get(G.zone[n]); const d = pathLen(G, v.node, n) + (h != null ? 60 : 0); if (d < bd) { bd = d; bn = n } }
          v.mode = 'toDrop'; setRoute(S, v, bn)
        } else {
          const o = v.job, F = o.F
          F.done++; F.misSum += S.t - o.td
          const hr = Math.floor(S.t / 3600); S.hourly[hr] = (S.hourly[hr] || 0) + 1
          S.orders.splice(S.orders.indexOf(o), 1)
          afterDrop(S, v)
        }
      }
    } else if (MOVING.has(v.mode)) {
      kw = VEH.avgPowerDrawKw
      if (v.moved > 0) v.tm.travel += DT
      else { v.tm.wait += DT; if (v.pi < v.path.length) S.heat[v.path[v.pi]] += DT
        if (v.waitZone) zstat(S, v.waitZone).waitT += DT }
    } else if (v.mode === 'charging') v.tm.charge += DT
    else { v.tm.idle += DT; if (v.mode === 'free') S.noHomeT += DT }
    const atCharger = v.atNode && G.kind[v.node] === 'charger' && (v.mode === 'home' || v.mode === 'charging')
    let dSoc = -kw * DT / 3600 / pk * 100
    if (atCharger) dSoc += VEH.chargerPowerKw * DT / 3600 / pk * 100
    v.soc = Math.max(0, Math.min(VEH.maxSocPct, v.soc + dSoc))
    if (v.mode === 'charging' && v.soc >= Math.min(P.resumePct, VEH.maxSocPct) - 1e-9) { v.mode = 'home'; v.mustCharge = false }
    if (v.mode === 'home' && v.mustCharge && atCharger) v.mode = 'charging'
    if (v.mode === 'home' && !v.mustCharge && needsCharge(S, v)) { if (atCharger) { v.mustCharge = true; v.mode = 'charging'; S.chargeTrips++ } else goCharge(S, v) }
  }
  // queue length per zone
  const q = new Map(); for (const v of S.veh) if (v.waitZone) q.set(v.waitZone, (q.get(v.waitZone) || 0) + 1)
  for (const [z, c] of q) { const s = zstat(S, z); if (c > s.maxQ) s.maxQ = c }

  // gridlock: a wait-for cycle that persists, or a route blocked by a parked vehicle
  const byId = S.veh
  for (const v of S.veh) {
    let u = v.waitFor, k = 0, cyc = false
    while (u != null && k <= S.veh.length) { if (u === v.id) { cyc = true; break } u = byId[u].waitFor; k++ }
    v.cycT = cyc ? v.cycT + DT : 0
    const h = v.waitFor != null ? byId[v.waitFor] : null
    v.parkT = h && !MOVING.has(h.mode) && h.mode !== 'pick' && h.mode !== 'drop' ? v.parkT + DT : 0
    if (v.cycT > CYCLE_GRIDLOCK_S || v.parkT > PARKED_BLOCK_S) {
      const node = v.pi < v.path.length ? v.path[v.pi] : v.node
      S.gridlock = { t: S.t, kind: v.cycT > CYCLE_GRIDLOCK_S ? 'cycle' : 'parked', node, veh: v.id, by: v.waitFor,
        where: G.label[node] || nearestLabel(G, node) }
      break
    }
  }
  if (Math.floor(t / 60) > Math.floor((t - DT) / 60)) S.series.push([t, S.orders.filter(o => o.v == null).length])
}

// cumulative distance from v's position to each remaining path node (index-aligned with v.path)
function pathAccs(S, v) {
  const G = S.G, a = new Array(v.path.length).fill(0)
  let acc = Math.hypot(G.pts[v.path[v.pi]][0] - v.x, G.pts[v.path[v.pi]][1] - v.y)
  for (let i = v.pi; i < v.path.length; i++) {
    if (i > v.pi) acc += Math.hypot(G.pts[v.path[i]][0] - G.pts[v.path[i - 1]][0], G.pts[v.path[i]][1] - G.pts[v.path[i - 1]][1])
    a[i] = acc
  }
  return a
}
// where v must hold zone z (path index i): at the spur's gate if the gate is still ahead
function claimPoint(S, v, accs, i, z) {
  const gate = S.G.zoneGate.get(z)
  if (gate !== S.G.zoneNode.get(z)) for (let j = i; j >= v.pi; j--) if (v.path[j] === gate) return { dist: accs[j], atGate: true }
  return { dist: accs[i], atGate: false }
}
function nextZoneDist(S, v) {
  if (!MOVING.has(v.mode) || v.pi >= v.path.length) return Infinity
  const accs = pathAccs(S, v)
  for (let i = v.pi; i < v.path.length; i++) {
    const z = S.G.zone[v.path[i]]; if (z && !v.held.has(z)) return claimPoint(S, v, accs, i, z).dist
  }
  return Infinity
}

function nearestLabel(G, node) {
  let best = null, bd = Infinity
  for (let i = 0; i < G.n; i++) if (G.label[i]) { const d = Math.hypot(G.pts[i][0] - G.pts[node][0], G.pts[i][1] - G.pts[node][1]); if (d < bd) { bd = d; best = G.label[i] } }
  return best ? 'near ' + best : 'on a route'
}

function runFor(S, seconds) { const end = S.t + seconds; while (S.t < end - 1e-9 && !S.gridlock) step(S); return S }

// ---- Results & verdict (spec §7.3) ----
const VERDICT = { WARMUP_S: 1800, MIN_DELIVERED: 0.98, BUSY_TIGHT: 0.85, BACKLOG_SHORT_PER_H: 1 }

function results(S) {
  const hrs = S.t / 3600
  const target = S.flows.reduce((a, F) => a + F.rate, 0)
  const gen = S.flows.reduce((a, F) => a + F.gen, 0), done = S.flows.reduce((a, F) => a + F.done, 0)
  const disp = S.flows.reduce((a, F) => a + F.dispatched, 0), waitSum = S.flows.reduce((a, F) => a + F.waitSum, 0)
  const tm = { travel: 0, handle: 0, wait: 0, charge: 0, idle: 0 }
  for (const v of S.veh) for (const k in tm) tm[k] += v.tm[k]
  const tot = Object.values(tm).reduce((a, b) => a + b, 0) || 1
  const busy = (tm.travel + tm.handle + tm.wait) / tot
  const waitingNow = S.orders.filter(o => o.v == null).length
  const ser = S.series, lastIdx = ser.length - 1
  const backlogTrend = ser.length > 60 ? (ser[lastIdx][1] - ser[lastIdx - 60][1]) : 0
  const delivered = gen > 0 ? (done + S.orders.filter(o => o.v != null).length) / gen : 1
  const socs = S.veh.map(v => v.soc)
  let verdict
  if (S.gridlock) verdict = 'gridlock'
  else if (S.t < VERDICT.WARMUP_S) verdict = 'warming'
  else if (delivered < VERDICT.MIN_DELIVERED || backlogTrend >= VERDICT.BACKLOG_SHORT_PER_H) verdict = 'short'
  else if (busy > VERDICT.BUSY_TIGHT || backlogTrend > 0) verdict = 'tight'
  else verdict = 'meets'
  return { hrs, target, perHr: hrs > 0 ? done / hrs : 0, done, gen, delivered, avgWait: disp ? waitSum / disp : 0,
    busy, tm, tot, waitingNow, inProgress: S.orders.filter(o => o.v != null).length, backlogTrend,
    socAvg: socs.reduce((a, b) => a + b, 0) / (socs.length || 1), socMin: Math.min(...socs, 100),
    chargeTrips: S.chargeTrips, verdict, gridlock: S.gridlock, noHomeT: S.noHomeT,
    flows: S.flows.map(F => ({ f: F.f, measuredFt: F.measuredFt, perHr: hrs > 0 ? F.done / hrs : 0,
      mission: F.done ? F.misSum / F.done : null, wait: F.dispatched ? F.waitSum / F.dispatched : null })) }
}

if (typeof module !== 'undefined') module.exports = { VEH, VIS_LEN, SPRITE_ASPECT, ROUTE_LAYOUT_FACTORS, engineCycle, engineFleet, chargingAvailability, buildGraph, pathLen, pathNodes, measureFlow, createSim, step, runFor, results, norm, DT }
