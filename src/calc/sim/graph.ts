// src/calc/sim/graph.ts — routing graph from the engineer-drawn layout. PURE.
// Ported from the proof of concept (buildGraph / tree / pathNodes), with curved segments,
// lane types and point ids instead of location names.

import { segmentGeometry, type SegmentGeometry } from './geometry'
import { withHighways } from './highways'
import type { SimLayout, SimPoint } from './types'

export interface Edge { to: number; seg: number; forward: boolean; length: number }

export interface Graph {
  n: number
  points: SimPoint[]
  idx: Map<string, number>
  adj: Edge[][]
  geo: SegmentGeometry[]
  /** Segment lane type, by segment index. */
  singleLane: boolean[]
  speedLimit: (number | undefined)[]
  /** Zone id per node (point id) for flow points, chargers and parking; null otherwise. */
  zone: (string | null)[]
  zoneNode: Map<string, number>
  /** Dead-end spur rule: a zone at the end of a spur owns the spur; vehicles wait at the gate. */
  zoneGate: Map<string, number>
  zoneBranch: Map<string, Set<number>>
  chargers: number[]
  parking: number[]
  /** Points that no segment touches ("Not connected"). */
  unconnected: string[]
  /** Junctions: points where 3 or more routes meet. A junction holds one vehicle at a time. */
  junction: boolean[]
  sp: Map<number, { dist: Float64Array; prev: Int32Array; prevEdge: (Edge | null)[] }>
}

const isZone = (p: SimPoint) => p.role != null || p.type === 'charger' || p.type === 'parking'

export function buildGraph(drawn: SimLayout): Graph {
  const L = withHighways(drawn)   // highways become routes here, for every consumer of the graph
  const idx = new Map<string, number>()
  L.points.forEach((p, i) => idx.set(p.id, i))
  const n = L.points.length
  const adj: Edge[][] = Array.from({ length: n }, () => [])
  const geo: SegmentGeometry[] = [], singleLane: boolean[] = [], speedLimit: (number | undefined)[] = []
  const degree = new Array(n).fill(0)
  L.segments.forEach((s, si) => {
    const a = idx.get(s.a), b = idx.get(s.b)
    const pa = a != null ? L.points[a] : null, pb = b != null ? L.points[b] : null
    geo.push(pa && pb ? segmentGeometry(pa, pb, s.curve) : segmentGeometry({ x: 0, y: 0 }, { x: 0, y: 0 }))
    singleLane.push(s.lane === 'single'); speedLimit.push(s.speedLimitFps)
    if (a == null || b == null || a === b) return
    const len = geo[si].length
    degree[a]++; degree[b]++
    if (s.dir !== 'ba') adj[a].push({ to: b, seg: si, forward: true, length: len })
    if (s.dir !== 'ab') adj[b].push({ to: a, seg: si, forward: false, length: len })
  })
  const zone = L.points.map(p => (isZone(p) ? p.id : null))
  const zoneNode = new Map<string, number>()
  zone.forEach((z, i) => { if (z) zoneNode.set(z, i) })
  const chargers = L.points.flatMap((p, i) => (p.type === 'charger' ? [i] : []))
  const parking = L.points.flatMap((p, i) => (p.type === 'parking' ? [i] : []))

  // undirected neighbours for the spur rule
  const und = Array.from({ length: n }, () => new Set<number>())
  for (let a = 0; a < n; a++) for (const e of adj[a]) { und[a].add(e.to); und[e.to].add(a) }
  const zoneGate = new Map<string, number>(), zoneBranch = new Map<string, Set<number>>()
  for (const [z, i] of zoneNode) {
    const branch = new Set([i]); let gate = i
    if (und[i].size === 1) {
      let prev = i, cur = [...und[i]][0]
      while (und[cur].size === 2 && !zone[cur]) {
        branch.add(cur)
        const nx = [...und[cur]].find(x => x !== prev)!
        prev = cur; cur = nx
      }
      gate = cur
    }
    zoneGate.set(z, gate); zoneBranch.set(z, branch)
  }
  const unconnected = L.points.filter((p, i) => degree[i] === 0 && p.type !== 'junction').map(p => p.id)
  const junction = und.map(s => s.size >= 3)
  return { n, points: L.points, idx, adj, geo, singleLane, speedLimit, zone, zoneNode, zoneGate, zoneBranch,
    chargers, parking, unconnected, junction, sp: new Map() }
}

/** Shortest-path tree from `src` (Dijkstra, binary heap), cached per source. */
export function tree(G: Graph, src: number) {
  const hit = G.sp.get(src); if (hit) return hit
  const dist = new Float64Array(G.n).fill(Infinity), prev = new Int32Array(G.n).fill(-1)
  const prevEdge: (Edge | null)[] = new Array(G.n).fill(null)
  const h: [number, number][] = [[0, src]]; dist[src] = 0
  const push = (e: [number, number]) => {
    h.push(e); let i = h.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p }
  }
  const pop = () => {
    const top = h[0], last = h.pop()!
    if (h.length) {
      h[0] = last; let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i
        if (l < h.length && h[l][0] < h[m][0]) m = l
        if (r < h.length && h[r][0] < h[m][0]) m = r
        if (m === i) break
        ;[h[m], h[i]] = [h[i], h[m]]; i = m
      }
    }
    return top
  }
  while (h.length) {
    const [d, u] = pop(); if (d > dist[u]) continue
    for (const e of G.adj[u]) {
      const nd = d + e.length
      if (nd < dist[e.to] - 1e-9) { dist[e.to] = nd; prev[e.to] = u; prevEdge[e.to] = e; push([nd, e.to]) }
    }
  }
  const t = { dist, prev, prevEdge }
  G.sp.set(src, t)
  return t
}

export const pathLen = (G: Graph, a: number, b: number) => tree(G, a).dist[b]

/** Nodes and the edges between them from a to b, or null when there is no route. */
export function route(G: Graph, a: number, b: number): { nodes: number[]; edges: Edge[] } | null {
  const t = tree(G, a)
  if (!isFinite(t.dist[b])) return null
  const nodes: number[] = [], edges: Edge[] = []
  for (let u = b; u !== -1; u = t.prev[u]) {
    nodes.push(u)
    if (u === a) break
    edges.push(t.prevEdge[u]!)
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() }
}
