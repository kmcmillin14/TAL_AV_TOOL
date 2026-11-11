'use client'

// The layout canvas (spec v2 §5): an SVG in feet. Pan by dragging empty space (Select tool) or with
// the middle button; zoom with the wheel. Markers, labels and direction arrows are drawn in screen
// pixels so they stay legible at every zoom (acceptance 12); footprints, objects and B56.5 envelopes
// are drawn to true scale (§5.8). Tools are handled by the editor — the canvas reports where the
// pointer is and what is under it.

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { laneWidthFt, type SegmentClearance } from '@/src/calc/sim/clearance'
import { segmentGeometry } from '@/src/calc/sim/geometry'
import { hitTest, objectCorners, snapToObjects } from '@/src/calc/sim/layoutEdit'
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
  /** One screen pixel, ft — for snapping distances that should feel the same at every zoom. */
  px: number
}

/** Snap distance for routes to objects, screen pixels. */
const SNAP_PX = 12
/** Fit margins for the editor's floating controls: tool column, options bar and name pills, hint. */
const EDITOR_INSET = { top: 84, right: 24, bottom: 64, left: 72 }

interface Props {
  layout: SimLayout
  /** The layout a vehicle drives (corners rounded) — drawn under the routes as drawn. Default: as drawn. */
  driven?: SimLayout
  flows?: ProjectFlow[]
  image?: { href: string; widthFt: number; heightFt: number } | null
  selection?: Selection
  notConnected?: Set<string>
  showFlows?: boolean
  /** B56.5 results per route, when the overlay is on. */
  clearances?: SegmentClearance[] | null
  /** Dragging empty space pans (Select tool, no Shift); otherwise a press on empty space goes to the tool. */
  panOnEmpty?: boolean
  /** A line from here to the pointer (route or flow being drawn). */
  rubberFrom?: XY | null
  /** A rectangle being dragged out (marquee or new object), ft. */
  box?: { a: XY; b: XY; kind: 'marquee' | 'object' } | null
  /** Scale marks (two clicks on the drawing), ft. */
  marks?: XY[]
  /** Points being dragged, shown at their new spots until the drop is committed. */
  offset?: { ids: Set<string>; d: XY } | null
  onPointer?: (e: CanvasPointer) => void
  onFlowClick?: (id: string) => void
  /** Bump to fit the view to the layout and drawing. */
  fitKey?: number
  /** Shown over an empty layout. */
  emptyPrompt?: string
  /** Route tool: the preview snaps square to the last point unless Shift is held. */
  snapSquare?: boolean
  /** Half the aisle a new route would be, ft — routes snap that far off objects (see `routeCorner`). */
  snapOffsetFt?: number
  /** Room kept clear of floating controls when fitting, px. Default: the editor's tool column and bar. */
  fitInset?: { top: number; right: number; bottom: number; left: number }
  /** The legend, only while it explains something on screen (direction tool, B56.5 overlay). */
  showLegend?: boolean
  /** Controls floated over the canvas (tool bar, palette, view buttons, hint). */
  children?: ReactNode
  /** A double-click finishes the route being drawn. */
  onDoubleClick?: () => void
  /** Run mode: drawn over the layout (vehicles, wait heat, gridlock ring), in feet; given the size
   *  of one screen pixel in feet so labels stay legible. */
  scene?: (px: number) => ReactNode
  /** Run mode: every drag pans; nothing is edited. */
  panAlways?: boolean
  /** Run mode: keep this spot in the middle of the view (a followed vehicle). */
  follow?: XY | null
  /** Point names on the map (Run mode can hide them). Default on. */
  showLabels?: boolean
  /** Aisle width per route, ft (envelope + B56.5 clearances); routes without one use 10 ft / 6 ft. */
  laneWidths?: Record<string, number>
}

const NONE = new Set<string>()
const noop = () => {}

const POINT_PX = 13, SEG_PX = 8, CHEVRON_PX = 90, HANDLE_PX = 6
const ROLE_ICON = { pick: 'pick', drop: 'drop', pickDrop: 'pickDrop' } as const

export default function LayoutCanvas(props: Props) {
  const {
    layout, driven = layout, flows = [], image = null, selection = null, notConnected = NONE, showFlows = false, clearances = null,
    rubberFrom = null, marks = [], offset = null, onPointer = noop, onFlowClick = noop, fitKey = 0, panOnEmpty = true,
  } = props
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const [measured, setMeasured] = useState(false)      // the first real size is known: fit then, not at 800×520
  const [view, setView] = useState({ x: -20, y: -20, ppf: 4 })      // top-left (ft) and pixels per foot
  const [cursor, setCursor] = useState<{ at: XY; shift: boolean } | null>(null)
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { setSize({ w: e.contentRect.width, h: e.contentRect.height }); setMeasured(true) })
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
    // Leave room for the floating controls: the tool column (left), the options bar and name pills
    // (top), the hint (bottom).
    const { top, right, bottom, left } = props.fitInset ?? EDITOR_INSET
    const ppf = Math.min((size.w - left - right) / Math.max(x1 - x0, 20), (size.h - top - bottom) / Math.max(y1 - y0, 20)) * 0.95
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    setView({ x: cx - (left + (size.w - left - right) / 2) / ppf, y: cy - (top + (size.h - top - bottom) / 2) / ppf, ppf })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, image?.href, measured])

  // Run mode: ease the view toward a followed vehicle.
  useEffect(() => {
    const f = props.follow
    if (!f) return
    setView(v => {
      const cx = v.x + size.w / 2 / v.ppf, cy = v.y + size.h / 2 / v.ppf
      return { ...v, x: v.x + (f.x - cx) * 0.15, y: v.y + (f.y - cy) * 0.15 }
    })
  }, [props.follow, size.w, size.h])

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
    if (props.panAlways || e.button === 1 || (e.button === 0 && !hit && panOnEmpty && !e.shiftKey)) {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (e.button === 0 && !props.panAlways) onPointer({ type: 'down', at, hit: null, shift: false, px: 1 / view.ppf })   // a click on empty space clears the selection
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onPointer({ type: 'down', at, hit, shift: e.shiftKey, px: 1 / view.ppf })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const at = toFt(e)
    if (rubberFrom) setCursor({ at, shift: e.shiftKey })   // only the route preview follows the pointer
    if (pan.current) {
      const p = pan.current
      setView(v => ({ ...v, x: p.vx - (e.clientX - p.sx) / v.ppf, y: p.vy - (e.clientY - p.sy) / v.ppf }))
      return
    }
    onPointer({ type: 'move', at, hit: null, shift: e.shiftKey, px: 1 / view.ppf })   // moves need no hit-test (drags only)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (pan.current) { pan.current = null; return }
    onPointer({ type: 'up', at: toFt(e), hit: null, shift: e.shiftKey, px: 1 / view.ppf })
  }

  const shown = (p: SimPoint) => (offset?.ids.has(p.id) ? { ...p, x: p.x + offset.d.x, y: p.y + offset.d.y } : p)
  const pts = new Map(layout.points.map(p => [p.id, shown(p)]))
  const dpts = new Map(driven.points.map(p => [p.id, pts.get(p.id) ?? p]))
  const selected = (kind: 'point' | 'segment' | 'flow' | 'object', id: string) =>
    (selection?.kind === kind && selection.id === id) || (kind === 'point' && selection?.kind === 'points' && selection.ids.includes(id))
  const px = 1 / view.ppf                       // one screen pixel, in feet
  const lanes = props.laneWidths ?? {}
  // Names collide when two pills would overlap on screen: those show a short form (C1, P2…). Worked
  // out per layout and zoom, not per frame (Run mode re-renders every frame).
  const crowded = useMemo(() => {
    const named = layout.points.filter(p => p.name && p.type !== 'junction')
    const out = new Set<string>()
    for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
      const a = named[i], b = named[j]
      const wPx = (a.name!.length + b.name!.length) * 3.3 + 16
      if (Math.abs(a.x - b.x) / px < wPx && Math.abs(a.y - b.y) / px < 22) { out.add(a.id); out.add(b.id) }
    }
    return out
  }, [layout.points, px])
  const degree = new Map<string, number>()
  for (const q of layout.segments) { degree.set(q.a, (degree.get(q.a) ?? 0) + 1); degree.set(q.b, (degree.get(q.b) ?? 0) + 1) }
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
      onDoubleClick={props.onDoubleClick}
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
          <pattern id="sim-grid-major" width={grid * 5} height={grid * 5} patternUnits="userSpaceOnUse">
            <path d={`M ${grid * 5} 0 L 0 0 0 ${grid * 5}`} fill="none" className="sim-grid-major" vectorEffect="non-scaling-stroke" />
          </pattern>
          <pattern id="sim-hatch" width={8 * px} height={8 * px} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d={`M0 0V${8 * px}`} className="sim-hatch-line" vectorEffect="non-scaling-stroke" />
          </pattern>
          <marker id="sim-flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="sim-flow-head" />
          </marker>
        </defs>
        <rect x={view.x} y={view.y} width={size.w / view.ppf} height={size.h / view.ppf} fill="url(#sim-grid)" />
        <rect x={view.x} y={view.y} width={size.w / view.ppf} height={size.h / view.ppf} fill="url(#sim-grid-major)" />
        {image && <image href={image.href} x={0} y={0} width={image.widthFt} height={image.heightFt} preserveAspectRatio="none" className="sim-drawing" />}

        {(layout.objects ?? []).map(o => <ObjectShape key={o.id} o={o} selected={selected('object', o.id)} />)}

        {clearances && <ClearanceOverlay layout={layout} results={clearances} px={px} />}

        {driven.segments.map(s => <Lane key={s.id} s={s} a={dpts.get(s.a)} b={dpts.get(s.b)} px={px} widthFt={lanes[s.id]} />)}
        {driven.segments.map(s => (
          <Segment key={s.id} s={s} a={dpts.get(s.a)} b={dpts.get(s.b)} px={px} selected={selected('segment', s.id.split('~')[0])} />
        ))}

        {showFlows && flows.map(f => {
          const a = f.fromPointId && pts.get(f.fromPointId), b = f.toPointId && pts.get(f.toPointId)
          if (!a || !b) return null
          return <FlowArrow key={f.id} id={f.id} a={a} b={b} label={`${f.thruPerHr || 0}/h`} px={px}
            selected={selected('flow', f.id)} onClick={onFlowClick} />
        })}

        {rubberFrom && cursor && (() => {
          // Where the click would land: an existing point, a route (joined), else routeCorner — as the editor does.
          const hit = props.snapSquare ? hitTest(layout, cursor.at, POINT_PX * px, SEG_PX * px) : null
          const end = !props.snapSquare ? cursor.at
            : hit?.kind === 'point' ? pts.get(hit.id) ?? cursor.at
            : hit?.kind === 'segment' ? { x: hit.x, y: hit.y }
            : routeCorner(layout, rubberFrom, cursor.at, cursor.shift, px, props.snapOffsetFt)
          const len = Math.hypot(end.x - rubberFrom.x, end.y - rubberFrom.y)
          return (
            <g>
              <line x1={rubberFrom.x} y1={rubberFrom.y} x2={end.x} y2={end.y} className="sim-rubber" vectorEffect="non-scaling-stroke" />
              <g transform={`translate(${end.x} ${end.y}) scale(${px})`} className="sim-rubber-end">
                <circle r={5} />
                <text x={10} y={-10} className="sim-rubber-len">{len.toFixed(1)} ft</text>
              </g>
            </g>
          )
        })()}

        {[...pts.values()].map(p => (
          <PointMarker key={p.id} p={p} px={px} selected={selected('point', p.id)} loose={notConnected.has(p.id)} cross={(degree.get(p.id) ?? 0) >= 3}
            label={props.showLabels === false ? null : crowded.has(p.id) ? shortName(p.name ?? '') : p.name ?? null} />
        ))}

        {props.scene?.(px)}

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
      {props.children}
      {props.showLegend && <Legend clearances={!!clearances} />}
      <span className="sim-zoom num">{grid >= 1 ? `grid ${grid} ft` : `grid ${grid * 12} in`}</span>
    </div>
  )
}

/** A short label for a crowded name: "Charger 3" → "C3", "Wrapper Infeed" → "WI", "Line 1 EOL" → "L1E". */
export function shortName(name: string): string {
  const m = name.match(/^(\S+).*?\s(\d+)$/)
  if (m) return m[1][0].toUpperCase() + m[2]
  return name.split(/\s+/).map(w => (/^\d+$/.test(w) ? w : w[0]?.toUpperCase() ?? '')).join('')
}

/** The point square to `from` — the route keeps to the aisle direction it is closest to. */
function squareTo(from: XY, to: XY): XY {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

/**
 * Where a route's next corner lands on open floor. Square to the last corner unless Shift; then onto a
 * wall, column or rack face within `SNAP_PX`, `offsetFt` out from it (exact), when that keeps the line
 * square; else whole feet, as in the proof of concept — only the free axis is rounded, so a square
 * line stays square from a corner that was not on whole feet.
 */
export function routeCorner(L: SimLayout, last: XY | null | undefined, at: XY, shift: boolean, px: number, offsetFt = 0): XY {
  const from = last && !shift ? last : null
  const q = from ? squareTo(from, at) : at
  const square = (p: XY) => !from || Math.abs(p.x - from.x) < 1e-6 || Math.abs(p.y - from.y) < 1e-6
  const snap = snapToObjects(L, q, SNAP_PX * px, offsetFt, square)
  if (snap.snapped) return snap.at
  const r = { x: Math.round(q.x), y: Math.round(q.y) }
  return from ? (q.y === from.y ? { ...r, y: from.y } : { ...r, x: from.x }) : r
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

/** The aisle a route runs in, in true feet: envelope (vehicle or pallet) + B56.5 clearances when the
 *  route's vehicle is known, else 10 ft two-way / 6 ft one-way as in the proof of concept. */
const Lane = memo(function Lane({ s, a, b, px, widthFt }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; widthFt?: number }) {
  if (!a || !b) return null
  const w = widthFt ?? laneWidthFt(s)
  return <path d={pathOf(a, b, s)} className="sim-lane" strokeWidth={Math.max(w, 4 * px)} />
})

/** Floor tape down the lane: dashed for two-way, solid with arrowheads for one-way, solid with
 *  "no passing" ticks for a single-lane two-way route. Spaced in screen pixels (acceptance 12). */
const Segment = memo(function Segment({ s, a, b, px, selected }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; selected: boolean }) {
  if (!a || !b) return null
  const g = segmentGeometry(a, b, s.curve)
  const single = s.lane === 'single'
  const n = Math.max(1, Math.floor(g.length / ((s.dir === 'two' ? CHEVRON_PX : 34) * px)))
  return (
    <g className={`sim-seg${selected ? ' is-selected' : ''}${s.dir === 'two' && !single ? ' is-two' : ''}`}>
      <path d={pathOf(a, b, s)} className="sim-tape" vectorEffect="non-scaling-stroke" />
      {(s.dir !== 'two' || single) && Array.from({ length: n }, (_, i) => {
        const c = g.at((g.length * (i + 0.5)) / n), ang = (Math.atan2(c.ty, c.tx) * 180) / Math.PI + (s.dir === 'ba' ? 180 : 0)
        return (
          <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${ang}) scale(${px})`} className="sim-arrow">
            {s.dir === 'two' ? <path d="M0 -5V5" className="sim-no-pass" /> : <path d="M6 0L-4 -5L-4 5Z" />}
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

/** Point tile (proof-of-concept look): a rounded square tinted by its role — round for chargers and
 *  parking — with the approved type icon, its name in a dark pill above, and the role badge. Grows
 *  with zoom like a floor marking, never smaller than legible. Junctions are dots: amber where three
 *  or more routes meet. */
const PointMarker = memo(function PointMarker({ p, px, selected, loose, cross, label }: { p: SimPoint; px: number; selected: boolean; loose: boolean; cross: boolean; label: string | null }) {
  if (p.type === 'junction') {
    return <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={`sim-pt-junction${cross ? ' is-cross' : ''}${selected ? ' is-selected' : ''}`}><circle r={selected ? 5 : cross ? 4 : 3} /></g>
  }
  const half = Math.max(9, 3.5 / px)                                  // screen px: 3.5 ft, at least 9 px
  const tone = p.role ? `role-${p.role}` : `kind-${p.type}`
  const vehiclePoint = p.type === 'charger' || p.type === 'parking'
  const fp = p.footprintFt
  const icon = Math.round(half * 1.15)
  return (
    <>
      {fp && <rect x={p.x - fp.l / 2} y={p.y - fp.w / 2} width={fp.l} height={fp.w} className={`sim-footprint ${tone}`} vectorEffect="non-scaling-stroke" />}
      <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={`sim-pt ${tone}${selected ? ' is-selected' : ''}`}>
        {vehiclePoint
          ? <circle r={half} className="sim-pt-body" />
          : <rect x={-half} y={-half} width={half * 2} height={half * 2} rx={Math.min(5, half / 2)} className="sim-pt-body" />}
        {p.role === 'pickDrop' && <path d={`M${-half} ${half * 0.4}V${-half + 5}A5 5 0 0 1 ${-half + 5} ${-half}H${half * 0.4}`} className="sim-pt-split" />}
        <g transform={`translate(${-icon / 2} ${-icon / 2})`} className="sim-pt-icon"><Icon name={p.type} size={icon} /></g>
        {p.role && (
          <g transform={`translate(${half - 4} ${-half - 6})`} className="sim-pt-badge">
            <circle cx={5} cy={5} r={7} />
            <Icon name={ROLE_ICON[p.role]} size={10} />
          </g>
        )}
        {label && <NamePill y={-half - 6} text={label} />}
        {p.name && <title>{p.name}</title>}
        {loose && <text y={half + 14} className="sim-pt-loose">Not connected</text>}
      </g>
    </>
  )
})

/** A name in a dark pill (proof-of-concept label), bottom edge at `y`. */
function NamePill({ y, text }: { y: number; text: string }) {
  const w = text.length * 6.6 + 12
  return (
    <g className="sim-pill">
      <rect x={-w / 2} y={y - 19} width={w} height={17} rx={4} />
      <text y={y - 6.5}>{text}</text>
    </g>
  )
}

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
      <span><svg width="26" height="10"><path d="M2 5H24" className="lg-tape" /><path d="M17 5L11 2V8Z" className="lg-arrow" /></svg>One-way</span>
      <span><svg width="26" height="10"><path d="M2 5H24" className="lg-tape is-two" /></svg>Two-way</span>
      <span><svg width="26" height="10"><path d="M2 5H24M13 1V9" className="lg-tape" /></svg>Single-lane</span>
      <span><i className="sw pick" />Pick</span>
      <span><i className="sw drop" />Drop</span>
      {clearances && <><span><i className="sw clr-full" />Full speed</span><span><i className="sw clr-capped" />Below 1.2 m/s</span><span><i className="sw clr-violation" />Blocked</span></>}
    </div>
  )
}
