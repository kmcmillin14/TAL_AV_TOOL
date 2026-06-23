'use client'

import type { FlowDiagramSeries } from '@/src/calc/romCharts'
import { seriesColor } from '../palette'

interface Props { series: FlowDiagramSeries }

// Layout constants (SVG units; the svg scales to container width). Generous,
// even spacing + symmetric origin/destination columns for a clean, legible map.
const VIEW_W = 600
const ROW_H = 66
const GROUP_GAP = 28
const PAD_Y = 18
const ORIGIN_X = 8
const ORIGIN_W = 88
const ORIGIN_H = 46
const DEST_X = 254
const DEST_W = 338
const DEST_H = 50

/**
 * Node-link operation map rendered as one SVG: each origin node sits centered
 * against its destinations and fans out smooth bezier connectors (arrowheads +
 * throughput labels) to each destination card. Symmetric and deterministic — no
 * DOM measurement. Driven by FlowDiagramSeries (pure).
 */
export default function FlowDiagram({ series }: Props) {
  if (series.origins.length === 0) {
    return <div className="rv-empty">Add flows with origins and vehicles to map the operation.</div>
  }

  // Lay groups out top-to-bottom; each origin owns a vertical band sized to its edges.
  type Node = { x: number; y: number; w: number; h: number }
  type Link = { x1: number; y1: number; x2: number; y2: number; thru: number; color: string }
  const origins: Array<{ label: string; node: Node }> = []
  const dests: Array<{ title: string; sub: string; node: Node; color: string }> = []
  const links: Link[] = []

  let y = PAD_Y
  let colorIdx = 0
  for (const o of series.origins) {
    const n = Math.max(1, o.edges.length)
    const bandH = n * ROW_H
    const originCy = y + bandH / 2
    origins.push({ label: o.label, node: { x: ORIGIN_X, y: originCy - ORIGIN_H / 2, w: ORIGIN_W, h: ORIGIN_H } })

    o.edges.forEach((e, i) => {
      const color = seriesColor(colorIdx++)
      const destCy = y + i * ROW_H + ROW_H / 2
      dests.push({ title: e.destLabel, sub: `Qty ${e.qty} · ${e.vehicleName}`, node: { x: DEST_X, y: destCy - DEST_H / 2, w: DEST_W, h: DEST_H }, color })
      links.push({ x1: ORIGIN_X + ORIGIN_W, y1: originCy, x2: DEST_X, y2: destCy, thru: e.thruPerHr, color })
    })
    y += bandH + GROUP_GAP
  }
  const totalH = y - GROUP_GAP + PAD_Y

  const path = (l: Link) => {
    const midX = (l.x1 + l.x2) / 2
    return `M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2 - 8} ${l.y2}`
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${totalH}`} className="rv-fd" role="img" aria-label="Material flow map" preserveAspectRatio="xMinYMin meet">
      <defs>
        <marker id="rv-fd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="rv-fd-arrowhead" />
        </marker>
      </defs>

      {links.map((l, i) => {
        const mx = (l.x1 + l.x2) / 2
        const my = (l.y1 + l.y2) / 2
        const label = `${l.thru}/hr`
        const pw = label.length * 6.2 + 12
        return (
          <g key={`l${i}`}>
            <path d={path(l)} className="rv-fd-link" fill="none" stroke={l.color}
              strokeWidth={2 + Math.min(4, l.thru / 15)} strokeOpacity={0.5} markerEnd="url(#rv-fd-arrow)" />
            <rect x={mx - pw / 2} y={my - 19} width={pw} height={16} rx={8} className="rv-fd-pill" stroke={l.color} />
            <text x={mx} y={my - 7} className="rv-fd-thru" textAnchor="middle">{label}</text>
          </g>
        )
      })}

      {origins.map((o, i) => (
        <g key={`o${i}`}>
          <rect x={o.node.x} y={o.node.y} width={o.node.w} height={o.node.h} rx={12} className="rv-fd-origin" />
          <text x={o.node.x + o.node.w / 2} y={o.node.y + o.node.h / 2 + 4} className="rv-fd-otext" textAnchor="middle">{o.label}</text>
        </g>
      ))}

      {dests.map((d, i) => (
        <g key={`d${i}`}>
          <rect x={d.node.x} y={d.node.y} width={d.node.w} height={d.node.h} rx={10} className="rv-fd-dest" />
          <rect x={d.node.x} y={d.node.y} width={4} height={d.node.h} rx={2} fill={d.color} />
          <text x={d.node.x + 16} y={d.node.y + 20} className="rv-fd-dtitle">{d.title}</text>
          <text x={d.node.x + 16} y={d.node.y + 37} className="rv-fd-dsub">{d.sub}</text>
        </g>
      ))}
    </svg>
  )
}
