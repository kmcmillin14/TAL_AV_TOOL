'use client'

// The layout canvas (spec v2 §5): an SVG in feet. Pan by dragging empty space (Select tool) or with
// the middle button; zoom with the wheel. Markers, labels and direction arrows are drawn in screen
// pixels so they stay legible at every zoom (acceptance 12); footprints, objects and B56.5 envelopes
// are drawn to true scale (§5.8). Tools are handled by the editor — the canvas reports where the
// pointer is and what is under it.

import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import Icon from '@/src/design-system/components/Icon'
import type { SegmentClearance } from '@/src/calc/sim/clearance'
import { segmentGeometry } from '@/src/calc/sim/geometry'
import { hitTest, objectCorners } from '@/src/calc/sim/layoutEdit'
import type { SimLayout, SimObject, SimPoint, SimSegment } from '@/src/calc/sim/types'
import type { ProjectFlow } from './useLayoutEditor'

export type XY = { x: number; y: number }
export type Handle = 'mid' | 'c1' | 'c2'
export type Hit = ReturnType<typeof hitTest> | { kind: 'handle'; id: string; which: Handle }
export type Selection =
  | { kind: 'point' | 'segment' | 'flow' | 'object'; id: string }
  | { kind: 'points'; ids: string[] }
  | null

export interface CanvasPointer {
  type: 'down' | 'move' | 'up'
  at: XY
  hit: Hit
  shift: boolean
}

interface Props {
  layout: SimLayout
  /** The layout a vehicle drives (corners rounded) — drawn under the routes as drawn. */
  driven: SimLayout
  flows: ProjectFlow[]
  image: { href: string; widthFt: number; heightFt: number } | null
  selection: Selection
  notConnected: Set<string>
  showFlows: boolean
  /** B56.5 results per route, when the overlay is on. */
  clearances: SegmentClearance[] | null
  /** Dragging empty space pans (Select tool, no Shift); otherwise a press on empty space goes to the tool. */
  panOnEmpty: boolean
  /** A line from here to the pointer (route or flow being drawn). */
  rubberFrom: XY | null
  /** A rectangle being dragged out (marquee or new object), ft. */
  box: { a: XY; b: XY; kind: 'marquee' | 'object' } | null
  /** Scale marks (two clicks on the drawing), ft. */
  marks: XY[]
  /** Points being dragged, shown at their new spots until the drop is committed. */
  offset: { ids: Set<string>; d: XY } | null
  onPointer: (e: CanvasPointer) => void
  onFlowClick: (id: string) => void
  /** Bump to fit the view to the layout and drawing. */
  fitKey: number
  /** Shown over an empty layout. */
  emptyPrompt?: string
}

const POINT_PX = 13, SEG_PX = 8, CHEVRON_PX = 90, HANDLE_PX = 6
const ROLE_ICON = { pick: 'pick', drop: 'drop', pickDrop: 'pickDrop' } as const

export default function LayoutCanvas(props: Props) {
  const { layout, driven, flows, image, selection, notConnected, showFlows, clearances, rubberFrom, marks, offset } = props
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
    for (const o of layout.objects ?? []) for (const c of objectCorners(o)) { xs.push(c.x); ys.push(c.y) }
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
  const hitAt = (at: XY, target: EventTarget): Hit => {
    const h = (target as Element).closest?.('[data-handle]')
    if (h) return { kind: 'handle', id: h.getAttribute('data-seg')!, which: h.getAttribute('data-handle') as Handle }
    return hitTest(layout, at, POINT_PX / view.ppf, SEG_PX / view.ppf)
  }

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const at = toFt(e), hit = hitAt(at, e.target)
    if (e.button === 1 || (e.button === 0 && !hit && props.panOnEmpty && !e.shiftKey)) {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (e.button === 0) props.onPointer({ type: 'down', at, hit: null, shift: false })   // a click on empty space clears the selection
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    props.onPointer({ type: 'down', at, hit, shift: e.shiftKey })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const at = toFt(e)
    if (rubberFrom) setCursor(at)           // only the rubber line follows the pointer
    if (pan.current) {
      const p = pan.current
      setView(v => ({ ...v, x: p.vx - (e.clientX - p.sx) / v.ppf, y: p.vy - (e.clientY - p.sy) / v.ppf }))
      return
    }
    props.onPointer({ type: 'move', at, hit: null, shift: e.shiftKey })   // moves need no hit-test (drags only)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (pan.current) { pan.current = null; return }
    props.onPointer({ type: 'up', at: toFt(e), hit: null, shift: e.shiftKey })
  }

  const shown = (p: SimPoint) => (offset?.ids.has(p.id) ? { ...p, x: p.x + offset.d.x, y: p.y + offset.d.y } : p)
  const pts = new Map(layout.points.map(p => [p.id, shown(p)]))
  const dpts = new Map(driven.points.map(p => [p.id, pts.get(p.id) ?? p]))
  const selected = (kind: 'point' | 'segment' | 'flow' | 'object', id: string) =>
    (selection?.kind === kind && selection.id === id) || (kind === 'point' && selection?.kind === 'points' && selection.ids.includes(id))
  const px = 1 / view.ppf                       // one screen pixel, in feet
  const grid = gridStep(view.ppf)
  const selSeg = selection?.kind === 'segment' ? layout.segments.find(s => s.id === selection.id) : undefined
  const rect = props.box && { x: Math.min(props.box.a.x, props.box.b.x), y: Math.min(props.box.a.y, props.box.b.y), w: Math.abs(props.box.b.x - props.box.a.x), h: Math.abs(props.box.b.y - props.box.a.y) }

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
          <pattern id="sim-hatch" width={8 * px} height={8 * px} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d={`M0 0V${8 * px}`} className="sim-hatch-line" vectorEffect="non-scaling-stroke" />
          </pattern>
          <marker id="sim-flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="sim-flow-head" />
          </marker>
        </defs>
        <rect x={view.x} y={view.y} width={size.w / view.ppf} height={size.h / view.ppf} fill="url(#sim-grid)" />
        {image && <image href={image.href} x={0} y={0} width={image.widthFt} height={image.heightFt} preserveAspectRatio="none" className="sim-drawing" />}

        {(layout.objects ?? []).map(o => <ObjectShape key={o.id} o={o} selected={selected('object', o.id)} />)}

        {clearances && <ClearanceOverlay layout={layout} results={clearances} px={px} />}

        {driven.segments.map(s => (
          <Segment key={s.id} s={s} a={dpts.get(s.a)} b={dpts.get(s.b)} px={px} selected={selected('segment', s.id.split('~')[0])} />
        ))}

        {showFlows && flows.map(f => {
          const a = f.fromPointId && pts.get(f.fromPointId), b = f.toPointId && pts.get(f.toPointId)
          if (!a || !b) return null
          return <FlowArrow key={f.id} id={f.id} a={a} b={b} label={`${f.thruPerHr || 0}/h`} px={px}
            selected={selected('flow', f.id)} onClick={props.onFlowClick} />
        })}

        {rubberFrom && cursor && (
          <line x1={rubberFrom.x} y1={rubberFrom.y} x2={cursor.x} y2={cursor.y} className="sim-rubber" vectorEffect="non-scaling-stroke" />
        )}

        {[...pts.values()].map(p => (
          <PointMarker key={p.id} p={p} px={px} selected={selected('point', p.id)} loose={notConnected.has(p.id)} />
        ))}

        {selSeg && <CurveHandles s={selSeg} a={pts.get(selSeg.a)} b={pts.get(selSeg.b)} px={px} />}

        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} className={props.box!.kind === 'object' ? 'sim-object-draft' : 'sim-marquee'} vectorEffect="non-scaling-stroke" />}

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
      <Legend clearances={!!clearances} />
      <span className="sim-zoom num">{grid >= 1 ? `grid ${grid} ft` : `grid ${grid * 12} in`}</span>
    </div>
  )
}

/** A grid step (ft) that lands 30–150 px apart on screen. */
function gridStep(ppf: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  return steps.find(s => s * ppf >= 30) ?? 1000
}

/** SVG path of a route's line or curve. */
function pathOf(a: XY, b: XY, s: SimSegment): string {
  if (!s.curve) return `M${a.x} ${a.y}L${b.x} ${b.y}`
  const g = segmentGeometry(a, b, s.curve), n = 48
  return Array.from({ length: n + 1 }, (_, i) => { const q = g.at((g.length * i) / n); return `${i ? 'L' : 'M'}${q.x} ${q.y}` }).join('')
}

const Segment = memo(function Segment({ s, a, b, px, selected }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; selected: boolean }) {
  if (!a || !b) return null
  const g = segmentGeometry(a, b, s.curve)
  const n = Math.max(1, Math.floor(g.length / (CHEVRON_PX * px)))
  const single = s.lane === 'single'
  const d = pathOf(a, b, s)
  return (
    <g className={`sim-seg${selected ? ' is-selected' : ''}${single ? ' is-single' : ''}`}>
      <path d={d} className="sim-seg-path" vectorEffect="non-scaling-stroke" />
      {s.dir === 'two' && <path d={d} className="sim-seg-centre" vectorEffect="non-scaling-stroke" />}
      {Array.from({ length: n }, (_, i) => {
        const c = g.at((g.length * (i + 0.5)) / n), ang = (Math.atan2(c.ty, c.tx) * 180) / Math.PI
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

/** Bend handle at the middle of the selected route; spline handles with their guide lines. */
function CurveHandles({ s, a, b, px }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number }) {
  if (!a || !b) return null
  const dot = (q: XY, which: Handle) => (
    <g key={which} transform={`translate(${q.x} ${q.y}) scale(${px})`} className="sim-handle" data-handle={which} data-seg={s.id}>
      <circle r={HANDLE_PX} />
    </g>
  )
  if (s.curve?.kind === 'bezier') {
    const { c1, c2 } = s.curve
    return (
      <g>
        <path d={`M${a.x} ${a.y}L${c1.x} ${c1.y}M${b.x} ${b.y}L${c2.x} ${c2.y}`} className="sim-handle-guide" vectorEffect="non-scaling-stroke" />
        {dot(c1, 'c1')}{dot(c2, 'c2')}
      </g>
    )
  }
  const g = segmentGeometry(a, b, s.curve), m = g.at(g.length / 2)
  return dot(m, 'mid')
}

const PointMarker = memo(function PointMarker({ p, px, selected, loose }: { p: SimPoint; px: number; selected: boolean; loose: boolean }) {
  const cls = `sim-pt sim-pt-${p.type}${p.role ? ` role-${p.role}` : ''}${selected ? ' is-selected' : ''}`
  if (p.type === 'junction') {
    return <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={cls}><circle r={selected ? 5 : 3.5} /></g>
  }
  const vehiclePoint = p.type === 'charger' || p.type === 'parking'
  const fp = p.footprintFt
  return (
    <>
      {fp && <rect x={p.x - fp.l / 2} y={p.y - fp.w / 2} width={fp.l} height={fp.w} className={`sim-footprint${p.role ? ` role-${p.role}` : ''}`} vectorEffect="non-scaling-stroke" />}
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
    </>
  )
})

function ObjectShape({ o, selected }: { o: SimObject; selected: boolean }) {
  const c = objectCorners(o)
  return <polygon points={c.map(q => `${q.x},${q.y}`).join(' ')} className={`sim-object${selected ? ' is-selected' : ''}`} vectorEffect="non-scaling-stroke" />
}

/** True-scale envelope and clearance band per route, and a callout at its tightest point (§5.9). */
function ClearanceOverlay({ layout, results, px }: { layout: SimLayout; results: SegmentClearance[]; px: number }) {
  const byId = new Map(layout.points.map(p => [p.id, p]))
  return (
    <g className="sim-clearance">
      {results.map(r => {
        const s = layout.segments.find(q => q.id === r.segId)
        const a = s && byId.get(s.a), b = s && byId.get(s.b)
        if (!s || !a || !b) return null
        const d = pathOf(a, b, s)
        const width = r.lanes === 2 ? r.envelopeFt * 2 : r.envelopeFt
        const mid = r.callout && { x: (r.callout.from.x + r.callout.to.x) / 2, y: (r.callout.from.y + r.callout.to.y) / 2 }
        return (
          <g key={r.segId} className={`sim-clr is-${r.status}`}>
            <path d={d} className="sim-clr-env" strokeWidth={width} />
            {r.callout && mid && (
              <>
                <line x1={r.callout.from.x} y1={r.callout.from.y} x2={r.callout.to.x} y2={r.callout.to.y} className="sim-clr-dim" vectorEffect="non-scaling-stroke" />
                <g transform={`translate(${mid.x} ${mid.y}) scale(${px})`}><text className="sim-clr-label" y={-4}>{r.tightestIn!.toFixed(1)} in</text></g>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

const FlowArrow = memo(function FlowArrow({ id, a, b, label, px, selected, onClick }: { id: string; a: XY; b: XY; label: string; px: number; selected: boolean; onClick: (id: string) => void }) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
  const bow = Math.min(len * 0.2, 60 * px)              // curve gently off the routes
  const cx = mx - dy / len * bow, cy = my + dx / len * bow
  const lx = (mx + cx) / 2, ly = (my + cy) / 2
  return (
    <g className={`sim-flow${selected ? ' is-selected' : ''}`} onPointerDown={e => { e.stopPropagation(); onClick(id) }}>
      <path d={`M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`} className="sim-flow-hit" vectorEffect="non-scaling-stroke" />
      <path d={`M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`} className="sim-flow-path" markerEnd="url(#sim-flow-head)" vectorEffect="non-scaling-stroke" />
      <g transform={`translate(${lx} ${ly}) scale(${px})`}><text className="sim-flow-label">{label}</text></g>
    </g>
  )
})

function Legend({ clearances }: { clearances: boolean }) {
  return (
    <div className="sim-legend" aria-label="Legend">
      <span><svg width="26" height="10"><path d="M2 5H24M10 2L14 5L10 8" /></svg>One-way</span>
      <span><svg width="26" height="12"><path d="M2 6H24" /><path d="M11 1L15 3L11 5M15 7L11 9L15 11" /></svg>Two-way</span>
      <span><svg width="26" height="12"><path d="M2 6H24M13 3V9" /></svg>Single-lane</span>
      <span><i className="sw pick" />Pick</span>
      <span><i className="sw drop" />Drop</span>
      {clearances && <><span><i className="sw clr-full" />Full speed</span><span><i className="sw clr-capped" />Below 1.2 m/s</span><span><i className="sw clr-violation" />Blocked</span></>}
    </div>
  )
}
