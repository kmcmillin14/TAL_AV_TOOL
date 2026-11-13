'use client'

// The layout canvas (spec v2 §5): an SVG in feet. Pan by dragging empty space (Select tool) or with
// the middle button; zoom with the wheel. Markers, labels and direction arrows are drawn in screen
// pixels so they stay legible at every zoom (acceptance 12); footprints, objects and B56.5 envelopes
// are drawn to true scale (§5.8). Tools are handled by the editor — the canvas reports where the
// pointer is and what is under it.

import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { laneWidthFt, type SegmentClearance } from '@/src/calc/sim/clearance'
import { segmentGeometry } from '@/src/calc/sim/geometry'
import { hitTest, objectCorners, type DrawSnap, type FlowTarget } from '@/src/calc/sim/layoutEdit'
import { fmtLength } from '@/src/lib/utils/units'
import type { SimHighway, SimLayout, SimObject, SimPoint, SimSegment } from '@/src/calc/sim/types'
import { highwayCorners, highwayEnds } from '@/src/calc/sim/highways'
import type { ProjectFlow } from './useLayoutEditor'

export type XY = { x: number; y: number }
export type Handle = 'mid' | 'c1' | 'c2'
export type Hit = ReturnType<typeof hitTest> | { kind: 'handle'; id: string; which: Handle } | { kind: 'dir'; id: string } | { kind: 'hwEnd'; id: string; end: 'a' | 'b' }
export type Selection =
  | { kind: 'point' | 'segment' | 'flow' | 'object' | 'highway'; id: string }
  | { kind: 'points'; ids: string[] }
  /** Several highways (lasso, Shift-click). */
  | { kind: 'highways'; ids: string[] }
  | null

export interface CanvasPointer {
  type: 'down' | 'move' | 'up'
  at: XY
  hit: Hit
  shift: boolean
  /** One real screen pixel, ft — for snapping distances that should feel the same at every zoom. */
  px: number
}

/**
 * A pointer position in the stage's own layout pixels. The app runs at `html { zoom: 0.8 }`
 * (globals.css): the bounding rect and clientX/Y are in zoomed screen pixels, while the SVG inside is
 * laid out in unzoomed ones. The ratio of the two widths converts between them (1 with no zoom) — so
 * a click lands exactly under the cursor at any page zoom.
 */
function localPx(el: HTMLElement, clientX: number, clientY: number): XY & { k: number } {
  const r = el.getBoundingClientRect()
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1
  return { x: (clientX - r.left) / k - el.clientLeft, y: (clientY - r.top) / k - el.clientTop, k }
}

/** Fit margins for the editor's floating controls: tool column, options bar and name pills, zoom control. */
const EDITOR_INSET = { top: 84, right: 24, bottom: 52, left: 72 }

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
  /** The lasso being drawn (Lasso tool), ft. */
  lasso?: XY[] | null
  /** Scale marks (two clicks on the drawing), ft. */
  marks?: XY[]
  /** Points being dragged, shown at their new spots until the drop is committed. */
  offset?: { ids: Set<string>; d: XY } | null
  onPointer?: (e: CanvasPointer) => void
  onFlowClick?: (id: string) => void
  /** Bump to fit the view to the layout and drawing. */
  fitKey?: number
  /** Shown over an empty layout. */
  emptyPrompt?: ReactNode
  /** Where the next drawing click lands (the editor's `snapDraw`): drawn as a marker — a ring on a
   *  point, a diamond on a route, guides to lined-up points — with the route preview from `rubberFrom`. */
  snap?: DrawSnap | null
  /** The pointer left the canvas. */
  onLeave?: () => void
  /** A tool that points at things (not Select): crosshair cursor. While `snap` is shown the system
   *  cursor is hidden and the crosshair is drawn at the landing spot instead. */
  aim?: boolean
  /** A length for the badges and the route preview, in the user's units. Default: feet. */
  fmtLen?: (ft: number) => string
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
  /** Points and routes with an overridden assumption: a small dot on the map. */
  overridden?: Set<string>
  /** Room kept clear of floating controls when fitting, px. Default: the editor's tool column and bar. */
  fitInset?: { top: number; right: number; bottom: number; left: number }
  /** The legend, only while it explains something on screen (direction tool, B56.5 overlay). */
  showLegend?: boolean
  /** Controls floated over the canvas (tool bar, palette, toast). */
  children?: ReactNode
  /** View toggles shown in the zoom control (Layout: Flows, B56.5) — nothing else floats over the drawing. */
  viewControls?: ReactNode
  /** Centre the view on this spot (ft) whenever `key` changes — the navigator, Tab. */
  centerOn?: { at: XY; key: number } | null
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
  /** Highway tool: the highway being dragged out. */
  draftHighway?: SimHighway | null
  /** Flow tool: the points a flow can link to from its start (lit) or not (dimmed, with why). */
  flowTargets?: Map<string, FlowTarget> | null
  /** Flow tool: the hovered target's path along the routes, and its length. */
  flowPreview?: { path: XY[]; distanceFt: number } | null
  /** Aisle width per route, ft (envelope + B56.5 clearances); routes without one use 10 ft / 6 ft. */
  laneWidths?: Record<string, number>
}

const NONE = new Set<string>()
const noop = () => {}

/** Hit radii, screen px — the editor's Flow-tool hover uses the same point radius. */
export const POINT_HIT_PX = 13
const POINT_PX = POINT_HIT_PX, SEG_PX = 8, HANDLE_PX = 6
const ROLE_ICON = { pick: 'pick', drop: 'drop', pickDrop: 'pickDrop' } as const

export default function LayoutCanvas(props: Props) {
  const {
    layout, driven = layout, flows = [], image = null, selection = null, notConnected = NONE, showFlows = false, clearances = null,
    rubberFrom = null, marks = [], offset = null, onPointer = noop, onFlowClick = noop, fitKey = 0, panOnEmpty = true,
  } = props
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const [measured, setMeasured] = useState(false)      // the first real size is known: fit then, not at 800×520
  const [fitTick, setFitTick] = useState(0)            // the Fit button in the zoom control
  const [view, setView] = useState({ x: -20, y: -20, ppf: 4 })      // top-left (ft) and pixels per foot
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
  }, [fitKey, fitTick, image?.href, measured])
  // Centre on a spot when asked (navigator, Tab), keeping the zoom.
  useEffect(() => {
    const c = props.centerOn
    if (c) setView(v => ({ ...v, x: c.at.x - size.w / 2 / v.ppf, y: c.at.y - size.h / 2 / v.ppf }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.centerOn?.key])
  /** Zoom about the middle of the canvas (the zoom control's − and +). */
  const zoomBy = (f: number) => setView(v => {
    const ppf = clampPpf(v.ppf * f)
    const cx = v.x + size.w / 2 / v.ppf, cy = v.y + size.h / 2 / v.ppf
    return { x: cx - size.w / 2 / ppf, y: cy - size.h / 2 / ppf, ppf }
  })
  const fmtLen = props.fmtLen ?? FEET

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
      const m = localPx(el, e.clientX, e.clientY)
      setView(v => {
        const ppf = clampPpf(v.ppf * Math.exp(-e.deltaY * 0.0015))
        const fx = v.x + m.x / v.ppf, fy = v.y + m.y / v.ppf
        return { x: fx - m.x / ppf, y: fy - m.y / ppf, ppf }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /** The pointer in feet, and one real screen pixel in feet (`px`) — reaches for hits and snaps are
   *  in screen pixels, so they feel the same at any canvas zoom and any page zoom. */
  const toFt = (e: RPointerEvent): XY & { px: number } => {
    const m = localPx(box.current!, e.clientX, e.clientY)
    return { x: view.x + m.x / view.ppf, y: view.y + m.y / view.ppf, px: 1 / (view.ppf * m.k) }
  }
  const hitAt = (at: XY, px: number, target: EventTarget): Hit => {
    const h = (target as Element).closest?.('[data-handle]')
    if (h) return { kind: 'handle', id: h.getAttribute('data-seg')!, which: h.getAttribute('data-handle') as Handle }
    const e = (target as Element).closest?.('[data-hw-end]')
    if (e) return { kind: 'hwEnd', id: e.getAttribute('data-hw')!, end: e.getAttribute('data-hw-end') as 'a' | 'b' }
    const d = (target as Element).closest?.('[data-dir]')
    if (d) return { kind: 'dir', id: d.getAttribute('data-dir')! }
    return hitTest(layout, at, POINT_PX * px, SEG_PX * px)
  }

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const { px, ...at } = toFt(e), hit = hitAt(at, px, e.target)
    if (props.panAlways || e.button === 1 || (e.button === 0 && !hit && panOnEmpty && !e.shiftKey)) {
      const m = localPx(e.currentTarget, e.clientX, e.clientY)
      pan.current = { sx: m.x, sy: m.y, vx: view.x, vy: view.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      if (e.button === 0 && !props.panAlways) onPointer({ type: 'down', at, hit: null, shift: false, px })   // a click on empty space clears the selection
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onPointer({ type: 'down', at, hit, shift: e.shiftKey, px })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const { px, ...at } = toFt(e)
    if (pan.current) {
      const p = pan.current, m = localPx(e.currentTarget, e.clientX, e.clientY)
      setView(v => ({ ...v, x: p.vx - (m.x - p.sx) / v.ppf, y: p.vy - (m.y - p.sy) / v.ppf }))
      return
    }
    onPointer({ type: 'move', at, hit: null, shift: e.shiftKey, px })   // moves need no hit-test (drags only)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (pan.current) { pan.current = null; return }
    const { px, ...at } = toFt(e)
    onPointer({ type: 'up', at, hit: null, shift: e.shiftKey, px })
  }

  const shown = (p: SimPoint) => (offset?.ids.has(p.id) ? { ...p, x: p.x + offset.d.x, y: p.y + offset.d.y } : p)
  const pts = new Map(layout.points.map(p => [p.id, shown(p)]))
  const dpts = new Map(driven.points.map(p => [p.id, pts.get(p.id) ?? p]))
  const selected = (kind: 'point' | 'segment' | 'flow' | 'object' | 'highway', id: string) =>
    (selection?.kind === kind && selection.id === id) || (kind === 'point' && selection?.kind === 'points' && selection.ids.includes(id))
    || (kind === 'highway' && selection?.kind === 'highways' && selection.ids.includes(id))
  const px = 1 / view.ppf                       // one screen pixel, in feet
  const lanes = props.laneWidths ?? {}
  // Where the override dots go — worked out when the layout or the overrides change, not per move.
  const ovDots = useMemo(() => {
    if (!props.overridden?.size) return []
    const byId = new Map(layout.points.map(q => [q.id, q])), segs = new Map(layout.segments.map(q => [q.id, q]))
    return [...props.overridden].flatMap(id => {
      const p = byId.get(id)
      if (p) return [{ id, at: { x: p.x, y: p.y }, point: true }]
      const s = segs.get(id), a = s && byId.get(s.a), b = s && byId.get(s.b)
      return s && a && b ? [{ id, at: segMid(s, a, b), point: false }] : []
    })
  }, [props.overridden, layout])
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
  for (const q of driven.segments) { degree.set(q.a, (degree.get(q.a) ?? 0) + 1); degree.set(q.b, (degree.get(q.b) ?? 0) + 1) }
  const grid = gridStep(view.ppf)
  const selSeg = selection?.kind === 'segment' ? layout.segments.find(s => s.id === selection.id) : undefined
  const selObj = selection?.kind === 'object' ? layout.objects?.find(o => o.id === selection.id) : undefined
  const rect = props.box && { x: Math.min(props.box.a.x, props.box.b.x), y: Math.min(props.box.a.y, props.box.b.y), w: Math.abs(props.box.b.x - props.box.a.x), h: Math.abs(props.box.b.y - props.box.a.y) }

  return (
    <div
      ref={box}
      tabIndex={-1}
      className={`sim-stage${props.panAlways ? ' is-pan' : props.snap ? ' is-snapping' : props.aim ? ' is-aim' : ''}`}
      onContextMenu={props.onContextMenu}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => props.onLeave?.()}
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
        {(layout.highways ?? []).map(h => <HighwayShape key={h.id} h={h} selected={selected('highway', h.id)} />)}
        {props.draftHighway && <HighwayShape h={props.draftHighway} draft />}

        {clearances && <ClearanceOverlay layout={driven} results={clearances} px={px} />}

        {driven.segments.map(s => <Lane key={s.id} s={s} a={dpts.get(s.a)} b={dpts.get(s.b)} px={px} widthFt={lanes[s.id]} />)}
        {driven.segments.map(s => (
          <Segment key={s.id} s={s} a={dpts.get(s.a)} b={dpts.get(s.b)} px={px} widthFt={lanes[s.id]} selected={selected('segment', s.id.split('~')[0]) || (!!s.highwayId && selected('highway', s.highwayId))} />
        ))}
        {/* The selected highway's end handles, above its lanes so a press reaches them. */}
        {/* End handles on a single selected highway (several are moved, not stretched). */}
        {selection?.kind === 'highway' && (layout.highways ?? []).filter(h => h.id === selection.id).map(h => <HighwayEnds key={h.id} h={h} px={px} />)}

        {showFlows && flows.map(f => {
          const a = f.fromPointId && pts.get(f.fromPointId), b = f.toPointId && pts.get(f.toPointId)
          if (!a || !b) return null
          return <FlowArrow key={f.id} id={f.id} a={a} b={b} label={`${f.thruPerHr || 0}/h`} px={px}
            selected={selected('flow', f.id)} onClick={onFlowClick} />
        })}

        {props.snap && <SnapMark snap={props.snap} from={rubberFrom} px={px} fmtLen={fmtLen} />}

        {props.flowPreview && props.flowPreview.path.length > 1 && (
          <g className="sim-flow-preview">
            <polyline points={props.flowPreview.path.map(q => `${q.x},${q.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
            <PreviewLabel at={props.flowPreview.path[Math.floor(props.flowPreview.path.length / 2)]} px={px} text={fmtLen(props.flowPreview.distanceFt)} />
          </g>
        )}
        {[...pts.values()].map(p => {
          const t = props.flowTargets?.get(p.id)
          return (
            <PointMarker key={p.id} p={p} px={px} selected={selected('point', p.id)} loose={notConnected.has(p.id)} cross={(degree.get(p.id) ?? 0) >= 3}
              mark={!t ? undefined : t.ok ? 'target' : 'dim'} reason={t && !t.ok ? t.reason : undefined}
              label={props.showLabels === false ? null : crowded.has(p.id) ? shortName(p.name ?? '') : p.name ?? null} />
          )
        })}

        {/* Overridden assumptions: a dot on the point, or at the middle of the route (acceptance 36). */}
        {ovDots.map(d => (
          <circle key={`ov-${d.id}`} cx={d.point ? d.at.x + 11 * px : d.at.x} cy={d.point ? d.at.y - 11 * px : d.at.y} r={4 * px} className="sim-ov-dot">
            <title>An assumption is overridden here</title>
          </circle>
        ))}

        {props.scene?.(px)}

        {selSeg && <CurveHandles s={selSeg} a={pts.get(selSeg.a)} b={pts.get(selSeg.b)} px={px} />}
        {selSeg && <RouteBadge s={selSeg} a={pts.get(selSeg.a)} b={pts.get(selSeg.b)} px={px} widthFt={lanes[selSeg.id]} fmtLen={fmtLen} />}
        {selObj && <SizeBadge o={selObj} px={px} fmtLen={fmtLen} />}

        {props.lasso && props.lasso.length > 1 && <polygon points={props.lasso.map(q => `${q.x},${q.y}`).join(' ')} className="sim-lasso" vectorEffect="non-scaling-stroke" />}
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
      <div className="sim-zoomctl" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        {props.viewControls}
        <span className="sim-zoom num">{grid >= 1 ? `grid ${grid} ft` : `grid ${grid * 12} in`}</span>
        <button type="button" onClick={() => setFitTick(n => n + 1)} title="Fit the layout to the window">Fit</button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <span className="num" aria-label="Zoom">{Math.round((view.ppf / 4) * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
      </div>
    </div>
  )
}

/** A short label for a crowded name: "Charger 3" → "C3", "Wrapper Infeed" → "WI", "Line 1 EOL" → "L1E". */
export function shortName(name: string): string {
  const m = name.match(/^(\S+).*?\s(\d+)$/)
  if (m) return m[1][0].toUpperCase() + m[2]
  return name.split(/\s+/).map(w => (/^\d+$/.test(w) ? w : w[0]?.toUpperCase() ?? '')).join('')
}

/** The snap target under the pointer, and the route preview to it. Sizes in screen pixels. */
function SnapMark({ snap, from, px, fmtLen }: { snap: DrawSnap; from: XY | null; px: number; fmtLen: (ft: number) => string }) {
  const { x, y } = snap.at
  const len = from ? Math.hypot(x - from.x, y - from.y) : 0
  return (
    <g className={`sim-snap is-${snap.kind}`}>
      {'guides' in snap && snap.guides.map((g, i) => <line key={i} x1={g.x} y1={g.y} x2={x} y2={y} className="sim-snap-guide" vectorEffect="non-scaling-stroke" />)}
      {from && <line x1={from.x} y1={from.y} x2={x} y2={y} className="sim-rubber" vectorEffect="non-scaling-stroke" />}
      {/* A station placed here joins the route by this spur. */}
      {'spur' in snap && snap.spur && (
        <>
          <line x1={x} y1={y} x2={snap.spur.at.x} y2={snap.spur.at.y} className="sim-rubber" vectorEffect="non-scaling-stroke" />
          <circle cx={snap.spur.at.x} cy={snap.spur.at.y} r={4 * px} className="sim-snap-dot" />
        </>
      )}
      <g transform={`translate(${x} ${y}) scale(${px})`}>
        {/* The crosshair is drawn where the click will land — the system cursor is hidden meanwhile. */}
        <path d="M-13 0H-4M4 0H13M0 -13V-4M0 4V13" className="sim-snap-cross" />
        {snap.kind === 'point' ? <circle r={12} className="sim-snap-ring" />
          : snap.kind === 'route' ? <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" className="sim-snap-ring" />
          : snap.kind === 'object' ? <rect x={-6} y={-6} width={12} height={12} className="sim-snap-ring" />
          : <circle r={2.5} className="sim-snap-dot" />}
        {from && len > 0 && <text x={14} y={-12} className="sim-rubber-len">{fmtLen(len)}</text>}
      </g>
    </g>
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

/** The aisle a route runs in, in true feet: envelope (vehicle or pallet) + B56.5 clearances when the
 *  route's vehicle is known, else 10 ft two-way / 6 ft one-way as in the proof of concept. */
const Lane = memo(function Lane({ s, a, b, px, widthFt }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; widthFt?: number }) {
  if (!a || !b) return null
  const w = widthFt ?? laneWidthFt(s)
  return <path d={pathOf(a, b, s)} className="sim-lane" strokeWidth={Math.max(w, 4 * px)} />
})

/** Floor tape down the lane: dashed for two-way, solid with arrowheads for one-way, solid with
 *  "no passing" ticks for a single-lane two-way route. Spaced in screen pixels (acceptance 12). */
const FEET = (ft: number) => fmtLength(ft, 'imperial', 1)
/** The canvas zoom range, pixels per foot. */
const clampPpf = (ppf: number) => Math.min(400, Math.max(0.05, ppf))
/** The middle of a route, along its line or curve. */
/** The middle of a route along its curve (badges, the navigator). */
export const segMid = (s: SimSegment, a: XY, b: XY): XY => { const g = segmentGeometry(a, b, s.curve), m = g.at(g.length / 2); return { x: m.x, y: m.y } }
/** Arrow spacing on a route, screen px: a street's lanes, a shared single lane, a one-way route. And
 *  at most this many per lane, so zooming in never builds thousands of arrows off screen. */
const ARROW_GAP_PX = { street: 90, shared: 56, oneWay: 34 }
const MAX_ARROWS = 32
/** The least width on screen for a two-lane aisle to show both travel paths, px. */
const STREET_PX = 18

/**
 * A route's floor marking. Two-way, two-lane: a street — dashed centre line and one travel path per
 * direction with its own arrows, traffic keeping right (as the vehicles drive it). Two-way,
 * single-lane: one path, arrows alternating both ways. One-way: one path, arrows one way.
 */
const Segment = memo(function Segment({ s, a, b, px, selected, widthFt }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; selected: boolean; widthFt?: number }) {
  if (!a || !b) return null
  const g = segmentGeometry(a, b, s.curve)
  const single = s.lane === 'single', twoLane = s.dir === 'two' && !single
  const w = widthFt ?? laneWidthFt(s)
  const street = twoLane && w / px >= STREET_PX
  const d = w / 4                                                    // each lane's centre, off the centre line
  /** An arrowhead `at` ft along, `side` lanes off the centre (+1 = right of a→b), pointing a→b or back. */
  const arrow = (key: string, at: number, side: number, back: boolean, small = false) => {
    const c = g.at(at), ang = (Math.atan2(c.ty, c.tx) * 180) / Math.PI + (back ? 180 : 0)
    return (
      <g key={key} transform={`translate(${c.x - c.ty * d * side} ${c.y + c.tx * d * side}) rotate(${ang}) scale(${px * (small ? 0.8 : 1)})`} className="sim-arrow">
        <path d="M6 0L-4 -5L-4 5Z" />
      </g>
    )
  }
  /** The route's line moved `off` ft to the right of a→b. */
  const offsetPath = (off: number) => {
    const m = g.curved ? Math.max(8, Math.ceil(g.length / 2)) : 1
    return Array.from({ length: m + 1 }, (_, i) => { const c = g.at((g.length * i) / m); return `${i ? 'L' : 'M'}${c.x - c.ty * off} ${c.y + c.tx * off}` }).join('')
  }
  const gap = twoLane ? ARROW_GAP_PX.street : single && s.dir === 'two' ? ARROW_GAP_PX.shared : ARROW_GAP_PX.oneWay
  const n = Math.min(MAX_ARROWS, Math.max(1, Math.floor(g.length / (gap * px))))
  return (
    <g className={`sim-seg${selected ? ' is-selected' : ''}${twoLane ? ' is-two' : ''}`}>
      <path d={pathOf(a, b, s)} className="sim-tape" vectorEffect="non-scaling-stroke" />
      {street && (
        <>
          <path d={offsetPath(d)} className="sim-lane-path" vectorEffect="non-scaling-stroke" />
          <path d={offsetPath(-d)} className="sim-lane-path" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: n }, (_, i) => [
            arrow(`f${i}`, (g.length * (i + 0.3)) / n, 1, false, true),
            arrow(`b${i}`, (g.length * (i + 0.7)) / n, -1, true, true),
          ])}
        </>
      )}
      {/* single-lane two-way: one path shared — arrows alternate; a lone arrow would read one-way */}
      {s.dir === 'two' && single && (n === 1
        ? [arrow('f', g.length * 0.35, 0, true), arrow('b', g.length * 0.65, 0, false)]
        : Array.from({ length: n }, (_, i) => arrow(`${i}`, (g.length * (i + 0.5)) / n, 0, i % 2 === 1)))}
      {s.dir !== 'two' && Array.from({ length: n }, (_, i) => arrow(`${i}`, (g.length * (i + 0.5)) / n, 0, s.dir === 'ba'))}
    </g>
  )
})

/** Beside the middle of the selected route: its direction (click to step two-way → one-way → other
 *  way) and its length. Sits off the aisle so it never covers the bend handle. */
function RouteBadge({ s, a, b, px, widthFt, fmtLen }: { s: SimSegment; a?: SimPoint; b?: SimPoint; px: number; widthFt?: number; fmtLen: (ft: number) => string }) {
  if (!a || !b) return null
  const g = segmentGeometry(a, b, s.curve), c = g.at(g.length / 2)
  // Always on the upper / left side of the route, so the text never hangs under the aisle.
  const side = c.tx > 0 || (c.tx === 0 && c.ty < 0) ? -1 : 1
  const off = (widthFt ?? laneWidthFt(s)) / 2 + 20 * px
  const x = c.x - c.ty * off * side, y = c.y + c.tx * off * side
  const ang = (Math.atan2(c.ty, c.tx) * 180) / Math.PI + (s.dir === 'ba' ? 180 : 0)
  const label = fmtLen(g.length), w = 34 + label.length * 6.6
  return (
    <g transform={`translate(${x} ${y}) scale(${px})`} className="sim-rbadge" data-dir={s.id} role="button" aria-label="Change direction">
      <title>{s.dir === 'two' ? 'Two-way — click for one-way' : 'One-way — click to change'}</title>
      <rect x={-w / 2} y={-13} width={w} height={26} rx={13} />
      <g transform={`translate(${-w / 2 + 15} 0) rotate(${ang})`} className="sim-rbadge-dir">
        {s.dir === 'two'
          ? <path d="M-7 -3H5M2 -6L6 -3L2 0M7 3H-5M-2 0L-6 3L-2 6" />
          : <path d="M-7 0H6M2 -4L7 0L2 4" />}
      </g>
      <text x={-w / 2 + 28} y={4}>{label}</text>
    </g>
  )
}

/** Under the selected object: its size, W × H. */
function SizeBadge({ o, px, fmtLen }: { o: SimObject; px: number; fmtLen: (ft: number) => string }) {
  const c = objectCorners(o), y = Math.max(...c.map(q => q.y)), x = (Math.min(...c.map(q => q.x)) + Math.max(...c.map(q => q.x))) / 2
  const label = `${fmtLen(o.w)} × ${fmtLen(o.h)}`, w = 16 + label.length * 6.6
  return (
    <g transform={`translate(${x} ${y}) scale(${px})`} className="sim-rbadge is-size">
      <rect x={-w / 2} y={8} width={w} height={24} rx={12} />
      <text x={0} y={24} textAnchor="middle">{label}</text>
    </g>
  )
}

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
  return dot(segMid(s, a, b), 'mid')
}

/** Point tile (proof-of-concept look): a rounded square tinted by its role — round for chargers and
 *  parking — with the approved type icon, its name in a dark pill above, and the role badge. Grows
 *  with zoom like a floor marking, never smaller than legible. Junctions are dots: amber where three
 *  or more routes meet. */
/** The flow preview's length, beside the middle of its path. */
function PreviewLabel({ at, px, text }: { at: XY; px: number; text: string }) {
  return <text x={at.x + 10 * px} y={at.y - 10 * px} fontSize={13 * px} className="sim-rubber-len">{text}</text>
}

/** `mark` (Flow tool): a point the flow can link to is lit, the rest dimmed — `reason` says why. */
const PointMarker = memo(function PointMarker({ p, px, selected, loose, cross, label, mark, reason }: {
  p: SimPoint; px: number; selected: boolean; loose: boolean; cross: boolean; label: string | null; mark?: 'target' | 'dim'; reason?: string
}) {
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
      {fp && <rect x={p.x - fp.l / 2} y={p.y - fp.w / 2} width={fp.l} height={fp.w} className={`sim-footprint ${tone}${mark ? ` is-${mark}` : ''}`} vectorEffect="non-scaling-stroke" />}
      <g transform={`translate(${p.x} ${p.y}) scale(${px})`} className={`sim-pt ${tone}${selected ? ' is-selected' : ''}${mark ? ` is-${mark}` : ''}`}>
        {mark === 'target' && <circle r={half + 7} className="sim-pt-halo" />}
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
        {(p.name || reason) && <title>{[p.name, reason].filter(Boolean).join(' — ')}</title>}
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

/** A highway: its rectangle (the aisle's real width). Its lanes are drawn as routes (derived). */
function HighwayShape({ h, selected, draft }: { h: SimHighway; selected?: boolean; draft?: boolean }) {
  return (
    <g className={`sim-highway${selected ? ' is-selected' : ''}${draft ? ' is-draft' : ''}`}>
      <polygon points={highwayCorners(h).map(q => `${q.x},${q.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
    </g>
  )
}

/** A selected highway's end handles: drag one to stretch or turn it. */
function HighwayEnds({ h, px }: { h: SimHighway; px: number }) {
  const { a, b } = highwayEnds(h)
  return <>{([['a', a], ['b', b]] as const).map(([end, q]) => (
    <g key={end} transform={`translate(${q.x} ${q.y}) scale(${px})`} className="sim-handle sim-hw-end" data-hw-end={end} data-hw={h.id}>
      <circle r={7} />
    </g>
  ))}</>
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
      <span><svg width="26" height="14"><path d="M2 7H24" className="lg-tape is-two" /><path d="M2 3H24M2 11H24" className="lg-path" /><path d="M16 3L11 0.8V5.2Z" className="lg-arrow" /><path d="M10 11L15 8.8V13.2Z" className="lg-arrow" /></svg>Two-way, two lanes</span>
      <span><svg width="26" height="10"><path d="M2 5H24" className="lg-tape" /><path d="M9 5L4 2.5V7.5Z" className="lg-arrow" /><path d="M17 5L22 2.5V7.5Z" className="lg-arrow" /></svg>Two-way, one lane</span>
      <span><i className="sw pick" />Pick</span>
      <span><i className="sw drop" />Drop</span>
      {clearances && <><span><i className="sw clr-full" />Full speed</span><span><i className="sw clr-capped" />Below 1.2 m/s</span><span><i className="sw clr-violation" />Blocked</span></>}
    </div>
  )
}
