// Renders the material-flow network (locations as nodes, flows as arrows) to a
// PNG for the branded ROM deck (S24). Browser-only — uses an offscreen <canvas>;
// returns null in non-DOM contexts or when there are no flows, so the exporter
// falls back to the flow table. Pure w.r.t. app state: input is flow data only.
import type { Flow } from '@/src/calc/types'
import { newCanvas, roundRect, toPngBytes } from './canvas'

const W = 1600, H = 860            // 16:9-ish raster (scaled into the slide)
const RED = '#EB0A1E', INK = '#2B2B2B', GRAY = '#8A8A8E', LINE = '#C9CDD2'
const NODE_W = 200, NODE_H = 64, COL_GAP = 320, ROW_GAP = 110

/** Longest-path layering: rank(dest) = max(rank(origin)+1). Cycles are bounded
 *  by iterating at most |nodes| times (a back-edge just stops contributing). */
function rankNodes(nodes: string[], edges: Array<[string, string]>): Map<string, number> {
  const rank = new Map(nodes.map(n => [n, 0]))
  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const [a, b] of edges) {
      const next = (rank.get(a) ?? 0) + 1
      if (next > (rank.get(b) ?? 0) && a !== b) { rank.set(b, next); changed = true }
    }
    if (!changed) break
  }
  return rank
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.strokeStyle = LINE; ctx.fillStyle = LINE; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  const ang = Math.atan2(y2 - y1, x2 - x1), s = 11
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - s * Math.cos(ang - Math.PI / 7), y2 - s * Math.sin(ang - Math.PI / 7))
  ctx.lineTo(x2 - s * Math.cos(ang + Math.PI / 7), y2 - s * Math.sin(ang + Math.PI / 7))
  ctx.closePath(); ctx.fill()
}

/** PNG bytes for the flow diagram, or null when unavailable (no DOM / no flows). */
export function renderFlowDiagramPng(flows: Flow[], names: Record<string, string>): Uint8Array | null {
  const edges: Array<[string, string]> = flows
    .map(f => [f.origin?.trim() || '—', f.destination?.trim() || '—'] as [string, string])
  const nodes = [...new Set(edges.flat())]
  if (nodes.length === 0) return null

  const cv = newCanvas(W, H)
  if (!cv) return null
  const { canvas, ctx } = cv
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)

  // Position: x by rank (column), y stacked within the rank, vertically centered.
  const rank = rankNodes(nodes, edges)
  const byRank = new Map<number, string[]>()
  for (const n of nodes) {
    const r = rank.get(n) ?? 0
    ;(byRank.get(r) ?? byRank.set(r, []).get(r)!).push(n)
  }
  const pos = new Map<string, { x: number; y: number }>()
  const maxRank = Math.max(...rank.values())
  const leftPad = (W - (maxRank * COL_GAP + NODE_W)) / 2
  for (const [r, group] of byRank) {
    const colH = group.length * NODE_H + (group.length - 1) * (ROW_GAP - NODE_H)
    const top = (H - colH) / 2
    group.forEach((n, i) => pos.set(n, {
      x: leftPad + r * COL_GAP,
      y: top + i * ROW_GAP,
    }))
  }

  // Edges first (under the nodes), with throughput + vehicle labels.
  ctx.font = '20px sans-serif'; ctx.textBaseline = 'middle'
  flows.forEach(f => {
    const a = pos.get(f.origin?.trim() || '—'), b = pos.get(f.destination?.trim() || '—')
    if (!a || !b) return
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2
    arrow(ctx, x1, y1, x2, y2)
    const label = `${f.thruPerHr ?? 0}/hr` + (f.vehicleId ? ` · ${names[f.vehicleId] ?? f.vehicleId}` : '')
    ctx.fillStyle = GRAY; ctx.textAlign = 'center'
    ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 16)
  })

  // Nodes.
  for (const [name, p] of pos) {
    roundRect(ctx, p.x, p.y, NODE_W, NODE_H, 10)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.strokeStyle = RED; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.fillStyle = INK; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'
    const text = name.length > 18 ? `${name.slice(0, 17)}…` : name
    ctx.fillText(text, p.x + NODE_W / 2, p.y + NODE_H / 2)
  }

  return toPngBytes(canvas)
}
