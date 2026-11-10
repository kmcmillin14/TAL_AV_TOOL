'use client'

// The layout canvas (spec v2 §5): an SVG in feet. Pan by dragging empty space (Select tool) or with
// the middle button; zoom with the wheel. Markers, labels and direction arrows are drawn in screen
// pixels so they stay legible at every zoom (acceptance 12). Tools are handled by the editor —
// the canvas reports where the pointer is and what is under it.

import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { hitTest } from '@/src/calc/sim/layoutEdit'
import type { SimLayout, SimPoint, SimSegment } from '@/src/calc/sim/types'
import type { ProjectFlow } from './useLayoutEditor'

export type XY = { x: number; y: number }
export type Hit = ReturnType<typeof hitTest>
export type Selection = { kind: 'point' | 'segment' | 'flow'; id: string } | null

export interface CanvasPointer {
  type: 'down' | 'move' | 'up'
  at: XY
  hit: Hit
}

interface Props {
  layout: SimLayout
  flows: ProjectFlow[]
  image: { href: string; widthFt: number; heightFt: number } | null
  selection: Selection
  notConnected: Set<string>
  showFlows: boolean
  /** Dragging empty space pans (Select tool); otherwise a click on empty space goes to the tool. */
  panOnEmpty: boolean
  /** A line from here to the pointer (route being drawn, flow being drawn). */
  rubberFrom: XY | null
  /** Scale marks (two clicks on the drawing), ft. */
  marks: XY[]
  /** A point being dragged, shown at its new spot until the drop is committed. */
  dragging: { id: string; at: XY } | null
  onPointer: (e: CanvasPointer) => void
  onFlowClick: (id: string) => void
  /** Bump to fit the view to the layout and drawing. */
  fitKey: number
  /** Shown over an empty layout. */
  emptyPrompt?: string
}

const POINT_PX = 13, SEG_PX = 8, CHEVRON_PX = 90
const ROLE_ICON = { pick: 'pick', drop: 'drop', pickDrop: 'pickDrop' } as const

export default function LayoutCanvas(props: Props) {
  const { layout, flows, image, selection, notConnected, showFlows, rubberFrom, marks, dragging } = props
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const [view, setView] = useState({ x: -20, y: -20, ppf: 4 })      // top-left (ft) and pixels per foot
  const [cursor, setCursor] = useState<XY | null>(null)
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit to what is drawn (and the drawing) whenever asked.
  useEffect(() => {
    const xs = layout.points.map(p => p.x), ys = layout.points.map(p => p.y)
    if (image) { xs.push(0, image.widthFt); ys.push(0, image.heightFt) }
    if (!xs.length) { setView({ x: -20, y: -20, ppf: 4 }); return }
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const ppf = Math.min(size.w / Math.max(x1 - x0, 20), size.h / Math.max(y1 - y0, 20)) * 0.9
    setView({ x: (x0 + x1) / 2 - size.w / 2 / ppf, y: (y0 + y1) / 2 - size.h / 2 / ppf, ppf })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, image?.href])

  // Wheel zoom about the cursor (non-passive so the page does not scroll).
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView(v => {
        const ppf = Math.min(400, Math.max(0.05, v.ppf * Math.exp(-e.deltaY * 0.0015)))
        const fx = v.x + (e.clientX - r.left) / v.ppf, fy = v.y + (e.clientY - r.top) / v.ppf
        return { x: fx - (e.clientX - r.left) / ppf, y: fy - (e.clientY - r.top) / ppf, ppf }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toFt = (e: RPointerEvent): XY => {
    const r = box.current!.getBoundingClientRect()
    return { x: view.x + (e.clientX - r.left) / view.ppf, y: view.y + (e.clientY - r.top) / view.ppf }
  }
  const hitAt = (at: XY) => hitTest(layout, at, POINT_PX / view.ppf, SEG_PX / view.ppf)

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const at = toFt(e), hit = hitAt(at)
    if (e.button === 1 || (e.button === 0 && !hit && props.panOnEmpty)) {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (e.button === 0) props.onPointer({ type: 'down', at, hit: null })   // a click on empty space clears the selection
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    props.onPointer({ type: 'down', at, hit })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const at = toFt(e)
    if (rubberFrom) setCursor(at)           // only the rubber line follows the pointer
    if (pan.current) {
      const p = pan.current
      setView(v => ({ ...v, x: p.vx - (e.clientX - p.sx) / v.ppf, y: p.vy - (e.clientY - p.sy) / v.ppf }))
      return
    }
    props.onPointer({ type: 'move', at, hit: null })   // moves need no hit-test (drag and pan only)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (pan.current) { pan.current = null; return }
    const at = toFt(e)
    props.onPointer({ type: 'up', at, hit: hitAt(at) })
  }

  const pts = new Map(layout.points.map(p => [p.id, dragging?.id === p.id ? { ...p, ...dragging.at } : p]))
  const px = 1 / view.ppf                       // one screen pixel, in feet
  const grid = gridStep(view.ppf)

  return (
    <div
      ref={box}
      className="sim-stage"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => setCursor(null)}
    >
      <svg
        width="100%" height="100%"
        viewBox={`${view.x} ${view.y} ${size.w / view.ppf} ${size.h / view.ppf}`}
        aria-label="Layout drawing"
      >
        <defs>
          <pattern id="sim-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" className="sim-grid-line" vectorEffect="non-scaling-stroke" />
          </pattern>
          <marker id="sim-flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="sim-flow-head" />
          </marker>
        </defs>
        <rect x={view.x} y={view.y} width={size.w / view.ppf} height={size.h / view.ppf} fill="url(#sim-grid)" />
        {image && <image href={image.href} x={0} y={0} width={image.widthFt} height={image.heightFt} preserveAspectRatio="none" className="sim-drawing" />}

        {layout.segments.map(s => (
          <Segment key={s.id} s={s} a={pts.get(s.a)} b={pts.get(s.b)} px={px} selected={selection?.kind === 'segment' && selection.id === s.id} />
        ))}

        {showFlows && flows.map(f => {
          const a = f.fromPointId && pts.get(f.fromPointId), b = f.toPointId && pts.get(f.toPointId)
          if (!a || !b) return null
          return <FlowArrow key={f.id} a={a} b={b} label={`${f.thruPerHr || 0}/h`} px={px}
            selected={selection?.kind === 'flow' && selection.id === f.id} onClick={() => props.onFlowClick(f.id)} />
        })}

        {rubberFrom && cursor && (
          <line x1={rubberFrom.x} y1={rubberFrom.y} x2={cursor.x} y2={cursor.y} className="sim-rubber" vectorEffect="non-scaling-stroke" />
        )}

        {[...pts.values()].map(p => (
          <PointMarker key={p.id} p={p} px={px} selected={selection?.kind === 'point' && selection.id === p.id} loose={notConnected.has(p.id)} />
        ))}

        {marks.map((m, i) => (
          <g key={i} transform={`translate(${m.x} ${m.y}) scale(${px})`} className="sim-mark">
            <path d="M-8 0H8M0 -8V8" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {marks.length === 2 && (
          <line x1={marks[0].x} y1={marks[0].y} x2={marks[1].x} y2={marks[1].y} className="sim-mark-line" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {props.emptyPrompt && !layout.points.length && <div className="sim-empty-prompt">{props.emptyPrompt}</div>}
      <Legend />
      <span className="sim-zoom num">{grid >= 1 ? `grid ${grid} ft` : `grid ${grid * 12} in`}</span>
    </div>
  )
}

/** A grid step (ft) that lands 30–150 px apart on screen. */
function gridStep(ppf: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  return steps.find(s => s * ppf >= 30) ?? 1000
}

const Segment = memo(function Segment({ s, a, b, px, selected }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; selected: boolean }) {
  if (!a || !b) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  const n = Math.max(1, Math.floor(len / (CHEVRON_PX * px)))
  const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const single = s.lane === 'single'
  return (
    <g className={`sim-seg${selected ? ' is-selected' : ''}${single ? ' is-single' : ''}`}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sim-seg-path" vectorEffect="non-scaling-stroke" />
      {s.dir === 'two' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="sim-seg-centre" vectorEffect="non-scaling-stroke" />}
      {Array.from({ length: n }, (_, i) => {
        const c = at((i + 0.5) / n)
        return (
          <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${ang}) scale(${px})`} className="sim-chevron">
            {s.dir === 'ab' && <path d="M-4 -5L2 0L-4 5" />}
            {s.dir === 'ba' && <path d="M4 -5L-2 0L4 5" />}
            {s.dir === 'two' && <><path d="M2 -9L7 -6L2 -3" /><path d="M-2 3L-7 6L-2 9" /></>}
            {s.dir === 'two' && single && <path d="M0 -4V4" className="sim-no-pass" />}
          </g>
        )
      })}
    </g>
  )
})

const PointMarker = memo(function PointMarker({ p, px, selected, loose }: { p: SimPoint; px: number; selected: boolean; loose: boolean }) {
  const cls = `sim-pt sim-pt-${p.type}${p.role ? ` role-${p.role}` : ''}${selected ? ' is-selected' : ''}`
  if (p.type === 'junction') {
    return <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={cls}><circle r={selected ? 5 : 3.5} /></g>
  }
  const vehiclePoint = p.type === 'charger' || p.type === 'parking'
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={cls}>
      {vehiclePoint ? <circle r={13} className="sim-pt-body" /> : <rect x={-13} y={-13} width={26} height={26} rx={6} className="sim-pt-body" />}
      {p.role === 'pickDrop' && <path d="M-13 7V-7A6 6 0 0 1 -7 -13H7" className="sim-pt-split" />}
      <g transform="translate(-8 -8)"><Icon name={p.type} size={16} /></g>
      {p.role && (
        <g transform="translate(9 -19)" className="sim-pt-badge">
          <circle cx={5} cy={5} r={7} />
          <Icon name={ROLE_ICON[p.role]} size={10} />
        </g>
      )}
      {p.name && <text y={27} className="sim-pt-name">{p.name}</text>}
      {loose && <text y={39} className="sim-pt-loose">Not connected</text>}
    </g>
  )
})

const FlowArrow = memo(function FlowArrow({ a, b, label, px, selected, onClick }: { a: XY; b: XY; label: string; px: number; selected: boolean; onClick: () => void }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
  const bow = Math.min(len * 0.2, 60 * px)              // curve gently off the routes
  const cx = mx - dy / len * bow, cy = my + dx / len * bow
  const lx = (mx + cx) / 2, ly = (my + cy) / 2
  return (
    <g className={`sim-flow${selected ? ' is-selected' : ''}`} onPointerDown={e => { e.stopPropagation(); onClick() }}>
      <path d={`M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`} className="sim-flow-hit" vectorEffect="non-scaling-stroke" />
      <path d={`M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`} className="sim-flow-path" markerEnd="url(#sim-flow-head)" vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${lx} ${ly}) scale(${px})`}><text className="sim-flow-label">{label}</text></g>
    </g>
  )
})

function Legend() {
  return (
    <div className="sim-legend" aria-label="Legend">
      <span><svg width="26" height="10"><path d="M2 5H24M10 2L14 5L10 8" /></svg>One-way</span>
      <span><svg width="26" height="12"><path d="M2 6H24" /><path d="M11 1L15 3L11 5M15 7L11 9L15 11" /></svg>Two-way</span>
      <span><svg width="26" height="12"><path d="M2 6H24M13 3V9" /></svg>Single-lane</span>
      <span><i className="sw pick" />Pick</span>
      <span><i className="sw drop" />Drop</span>
    </div>
  )
}
