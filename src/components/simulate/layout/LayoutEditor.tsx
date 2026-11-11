'use client'

// Layout editor (spec v2 §5.1): Drawing & scale → Points (P) → Routes (R) → Flows (F), with
// Select (V) and Direction (D), undo/redo. Points first: a point can sit off every route and is
// listed "Not connected" until a route reaches it. Select also bends routes (drag the middle
// handle), moves and box-selects points (Shift-drag), copies and pastes (⌘C / ⌘V). The Points
// palette's Object draws walls and columns; "B56.5 clearances" shows the clearance path (§5.9).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { linkedFlows } from '@/src/calc/sim/readiness'
import { laneWidthFt } from '@/src/calc/sim/clearance'
import { clearanceRule, payloadFt, runInputs } from '@/src/calc/sim/runInputs'
import { roundCorners } from '@/src/calc/sim/corners'
import {
  addObject, addPoint, addSegment, convertPoint, copyPoints, flowRefusal, flowStartRefusal, FLOW_POINT_TYPES, linkFlow, movePoints,
  notConnected, placeOnSegment, pointsInBox, removeObject, removePoints, removeSegment, repeatPoint, rescaleLayout, setCurve,
  splineHandles, splitSegment, updateObject, updatePoint, updateSegment, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimPointType, SimRole, SimSegment } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import Icon from '@/src/design-system/components/Icon'
import type { LoadedDrawing } from '@/src/lib/drawingImport'
import { newFlowId } from '@/src/lib/ids'
import { getDrawingData, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import DrawingCard from './DrawingCard'
import { ChecksCard, FlowsTable, PlaceCard, type Armed } from './SimCards'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import LayoutCanvas, { routeCorner, type CanvasPointer, type Handle, type Selection, type XY } from './LayoutCanvas'
import LayoutPanel, { Segmented } from './LayoutPanel'
import { useLayoutEditor, type EditorLayout, type ProjectFlow } from './useLayoutEditor'

type Tool = 'select' | 'points' | 'routes' | 'flows' | 'direction' | 'scale'
const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Click to select · drag to move · drag empty space to pan · Shift-drag to select several · Delete removes' },
  { id: 'routes', label: 'Route', key: 'R', hint: 'Click to start a route along an aisle · start on a route to branch from it' },
  { id: 'direction', label: 'One-way', key: 'D', hint: 'Click a route: two-way → one-way → other way → single-lane' },
  { id: 'points', label: 'Place', key: 'P', hint: 'Click to place · on a route, the point joins it' },
  { id: 'flows', label: 'Flow', key: 'F', hint: 'Click a Pick point, then a Drop point' },
  { id: 'scale', label: 'Scale', key: 'S', hint: 'Click both ends of a known dimension' },
]
/** Tool icons — the proof of concept's set, plus Flow. */
const TOOL_ICON: Record<Tool | 'undo' | 'redo', string> = {
  select: 'M5 3l14 8-6 2-2 6z', routes: 'M4 20V8h8v8h8V4', direction: 'M4 12h14M13 6l6 6-6 6',
  points: 'M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  flows: 'M4 18c6 0 9-12 16-12M15 3l5 3-5 3', scale: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
}
function ToolIcon({ name }: { name: keyof typeof TOOL_ICON }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TOOL_ICON[name]} /></svg>
}
type Placeable = SimPointType | 'object'
const PALETTE: Placeable[] = [...FLOW_POINT_TYPES, ...VEHICLE_POINT_TYPES, 'object']
/** Direction tool order: two-way → one-way A→B → one-way B→A → single-lane two-way → two-way. */
const DIRECTION_CYCLE: Pick<SimSegment, 'dir' | 'lane'>[] = [
  { dir: 'two', lane: 'two' }, { dir: 'ab', lane: 'two' }, { dir: 'ba', lane: 'two' }, { dir: 'two', lane: 'single' },
]
/** An unscaled drawing with nothing to inherit is shown at this size until its scale is set. */
const UNSCALED_FT_PER_PX = 0.05
/** Pasted points land this far from the originals, ft. */
const PASTE_OFFSET_FT = 5

type Background = NonNullable<EditorLayout['background']>
const ftPerPx = (bg?: Background) => (bg?.scale
  ? bg.scale.lengthFt / Math.max(1e-9, Math.hypot(bg.scale.b.x - bg.scale.a.x, bg.scale.b.y - bg.scale.a.y))
  : bg?.unscaledFtPerPx ?? UNSCALED_FT_PER_PX)

/** A field that takes typed text — shortcuts stay out of it. A ticked checkbox or a pressed button
 *  keeps focus but takes no text, so the tool keys still work there. */
const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && ((t instanceof HTMLInputElement && !NOT_TEXT.has(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

/** Clear a flow's point links: it keeps its values and goes back to a typed distance in Sizing. */
const unlinked = (f: ProjectFlow): ProjectFlow => ({ ...f, fromPointId: undefined, toPointId: undefined, distanceSource: undefined })

/** What a press-and-drag is doing until the pointer is released. */
type Drag =
  | { kind: 'points'; ids: string[]; from: XY; at: XY }
  | { kind: 'handle'; segId: string; which: Handle; at: XY }
  | { kind: 'object'; id: string; from: XY; at: XY }
  | { kind: 'box'; box: 'marquee' | 'object'; from: XY; at: XY }

interface Props {
  project: StoredProject
  vehicles: Vehicle[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  checks: ReadinessCheck[]
  unitSystem: UnitSystem
  emptyPrompt?: string
}

export default function LayoutEditor({ project, vehicles, vehicleById, settings, fleet, checks, unitSystem, emptyPrompt }: Props) {
  const radiusFor = useCallback((id?: string) => (id && vehicleById.get(id)?.calc.turningRadiusFt) || 0, [vehicleById])
  const editor = useLayoutEditor(project, radiusFor)
  const { doc, latest, commit, canUndo, canRedo } = editor
  const { layout, flows } = doc
  const [tool, setTool] = useState<Tool>('select')
  const [placeType, setPlaceType] = useState<Placeable>('stand')
  const [placeRole, setPlaceRole] = useState<SimRole>('pick')
  const [selection, setSelection] = useState<Selection>(null)
  const [chainFrom, setChainFrom] = useState<string | null>(null)       // route or flow being drawn
  const [marks, setMarks] = useState<XY[] | null>(null)                 // null = not setting the scale
  const [drag, setDrag] = useState<Drag | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showFlows, setShowFlows] = useState(true)
  const [showClearance, setShowClearance] = useState(false)
  const [fitKey, setFitKey] = useState(0)
  /** The tool hint shows for a few seconds after the tool changes, then fades (it stays while a
   *  route, flow, scale or armed placement is under way). */
  const [hintFresh, setHintFresh] = useState(true)
  useEffect(() => { setHintFresh(true); const t = window.setTimeout(() => setHintFresh(false), 4000); return () => window.clearTimeout(t) }, [tool])
  /** Place tool armed from "Place on routes": the next point gets this name, type and role. */
  const [armed, setArmed] = useState<Armed | null>(null)
  const clipboard = useRef<string[]>([])

  const bg = layout.background
  const image = getDrawingData(project.id)
  const scale = ftPerPx(bg)
  const loose = useMemo(() => new Set(notConnected(layout).map(p => p.id)), [layout])
  const byId = useMemo(() => new Map(layout.points.map(p => [p.id, p])), [layout])
  const linked = useMemo(() => linkedFlows(flows), [flows])

  // The layout as driven: corners rounded to the largest turning radius among the flows' vehicles.
  const driven = useMemo(() => roundCorners(layout, Math.max(0, ...linked.map(f => radiusFor(f.vehicleId)))), [layout, linked, radiusFor])

  // B56.5 clearances (§5.9) — the same rule and payload a run uses (src/calc/sim/runInputs.ts).
  const rule = useMemo(() => clearanceRule(project.simSettings?.clearance), [project.simSettings?.clearance])
  // What a run would drive here: lane widths from the envelope (vehicle or pallet) and the clearances.
  const inputs = useMemo(
    () => runInputs(layout, flows, vehicleById, rule, payloadFt(project.loads)?.width ?? 0),
    [layout, flows, vehicleById, rule, project.loads],
  )
  const clearances = showClearance ? inputs.clearances : null
  /** Direction and lanes for the routes drawn next (Route tool options). One-way runs the way it is drawn. */
  const [routeKind, setRouteKind] = useState<Pick<SimSegment, 'dir' | 'lane'>>({ dir: 'two', lane: 'two' })
  // New routes snap half their aisle off an object, so the lane keeps its B56.5 clearance (rounded up
  // to 0.1 ft so the clearance check never lands a hair short).
  const snapOffsetFt = Math.ceil((laneWidthFt(routeKind, inputs.envelopeFt, rule) / 2) * 10) / 10

  const setLayout = (next: EditorLayout, merge?: string) => commit({ layout: next, flows }, merge)
  const setFlows = (next: ProjectFlow[], merge?: string) => commit({ layout, flows: next }, merge)
  const say = (m: string) => { setMessage(m); window.setTimeout(() => setMessage(c => (c === m ? null : c)), 3500) }
  /** Stop whatever is half-drawn: a route, a flow, the scale marks. */
  const cancel = () => { setChainFrom(null); setMarks(null); setArmed(null) }
  const chooseTool = (t: Tool) => {
    if (t === 'scale') { if (bg) { setChainFrom(null); setMarks([]) } return }
    setTool(t); cancel()
  }
  /** Undo/redo can remove what a half-drawn route or a selection points at: drop both. */
  const undo = () => { cancel(); setSelection(null); editor.undo() }
  const redo = () => { cancel(); setSelection(null); editor.redo() }
  const selectedPoints = selection?.kind === 'points' ? selection.ids : selection?.kind === 'point' ? [selection.id] : []

  /** A point id to draw from or to: the point under the pointer, a new junction on a route, or one on empty floor. */
  const anchor = (at: XY, hit: CanvasPointer['hit'], shift: boolean, px: number): { layout: EditorLayout; id: string } => {
    if (hit?.kind === 'point') return { layout, id: hit.id }
    if (hit?.kind === 'segment') return splitSegment(layout, hit.id, at) ?? addPoint(layout, at, 'junction')
    return addPoint(layout, routeCorner(layout, chainFrom ? byId.get(chainFrom) : undefined, at, shift, px, snapOffsetFt), 'junction')
  }

  const onSelectPress = (at: XY, hit: CanvasPointer['hit'], shift: boolean) => {
    if (hit?.kind === 'handle') { setDrag({ kind: 'handle', segId: hit.id, which: hit.which, at }); return }
    if (hit?.kind === 'point') {
      const ids = shift
        ? (selectedPoints.includes(hit.id) ? selectedPoints.filter(i => i !== hit.id) : [...selectedPoints, hit.id])
        : selectedPoints.includes(hit.id) ? selectedPoints : [hit.id]
      setSelection(ids.length > 1 ? { kind: 'points', ids } : ids.length ? { kind: 'point', id: ids[0] } : null)
      if (ids.includes(hit.id)) setDrag({ kind: 'points', ids, from: at, at })
      return
    }
    if (hit?.kind === 'object') { setSelection({ kind: 'object', id: hit.id }); setDrag({ kind: 'object', id: hit.id, from: at, at }); return }
    if (hit?.kind === 'segment') { setSelection({ kind: 'segment', id: hit.id }); return }
    if (shift) { setDrag({ kind: 'box', box: 'marquee', from: at, at }); return }
    setSelection(null)
  }

  const onRelease = (d: Drag) => {
    const dx = d.at.x - (d.kind === 'handle' ? d.at.x : d.from.x), dy = d.at.y - (d.kind === 'handle' ? d.at.y : d.from.y)
    if (d.kind === 'points' && (dx || dy)) setLayout(movePoints(layout, d.ids, { x: dx, y: dy }))
    else if (d.kind === 'object' && (dx || dy)) {
      const o = layout.objects?.find(q => q.id === d.id)
      if (o) setLayout(updateObject(layout, o.id, { x: o.x + dx, y: o.y + dy }))
    } else if (d.kind === 'handle') {
      const s = layout.segments.find(q => q.id === d.segId)
      if (s) setLayout(setCurve(layout, s.id, d.which === 'mid' ? { kind: 'arc', mid: d.at }
        : s.curve?.kind === 'bezier' ? { ...s.curve, [d.which]: d.at } : s.curve))
    } else if (d.kind === 'box' && d.box === 'marquee') {
      const ids = [...new Set([...selectedPoints, ...pointsInBox(layout, d.from, d.at)])]
      setSelection(ids.length > 1 ? { kind: 'points', ids } : ids.length ? { kind: 'point', id: ids[0] } : null)
    } else if (d.kind === 'box' && d.box === 'object') {
      const made = addObject(layout, d.from, d.at)
      if (made.id) { setLayout(made.layout); setSelection({ kind: 'object', id: made.id }) }
    }
  }

  const onPointer = ({ type, at, hit, shift, px }: CanvasPointer) => {
    if (marks) {
      if (type === 'down' && marks.length < 2) setMarks([...marks, at])
      return
    }
    if (type === 'move') { if (drag) setDrag({ ...drag, at }); return }
    if (type === 'up') { if (drag) onRelease(drag); setDrag(null); return }
    if (tool === 'select') { onSelectPress(at, hit, shift); return }
    if (tool === 'points') {
      if (hit?.kind === 'point') { setSelection({ kind: 'point', id: hit.id }); return }
      if (placeType === 'object') { setDrag({ kind: 'box', box: 'object', from: at, at }); return }
      const role = FLOW_POINT_TYPES.includes(placeType) ? placeRole : undefined
      const placed = (hit?.kind === 'segment' && placeOnSegment(layout, hit.id, at, placeType, role)) || addPoint(layout, at, placeType, role)
      // Armed from "Place on routes": the point takes the Sizing name, so the flows link by it.
      setLayout(armed ? updatePoint(placed.layout, placed.id, { name: armed.name }) : placed.layout)
      setSelection({ kind: 'point', id: placed.id })
      setArmed(null)
    } else if (tool === 'routes') {
      const end = anchor(at, hit, shift, px)
      if (chainFrom && chainFrom !== end.id) setLayout(addSegment(end.layout, chainFrom, end.id, routeKind).layout)
      else if (end.layout !== layout) setLayout(end.layout)
      setChainFrom(end.id)
    } else if (tool === 'flows') {
      if (hit?.kind !== 'point') { setChainFrom(null); return }
      const why = chainFrom ? flowRefusal(layout, chainFrom, hit.id) : flowStartRefusal(layout, hit.id)
      if (why) { say(why); return }
      if (!chainFrom) { setChainFrom(hit.id); return }
      const blank: ProjectFlow = { id: newFlowId(), origin: '', destination: '', distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0 }
      const flow = linkFlow(layout, blank, chainFrom, hit.id)
      setFlows([...flows, flow])
      setSelection({ kind: 'flow', id: flow.id })
      setChainFrom(null)
    } else if (tool === 'direction' && hit?.kind === 'segment') {
      const s = layout.segments.find(q => q.id === hit.id)!
      const i = DIRECTION_CYCLE.findIndex(c => c.dir === s.dir && c.lane === (s.lane ?? 'two'))
      setLayout(updateSegment(layout, s.id, DIRECTION_CYCLE[(i + 1) % DIRECTION_CYCLE.length]))
      setSelection({ kind: 'segment', id: s.id })
    }
  }

  const deleteSelection = () => {
    if (!selection) return
    if (selection.kind === 'point' || selection.kind === 'points') {
      const gone = new Set(selectedPoints), hit = (f: ProjectFlow) => gone.has(f.fromPointId ?? '') || gone.has(f.toPointId ?? '')
      commit({ layout: removePoints(layout, selectedPoints), flows: flows.map(f => (hit(f) ? unlinked(f) : f)) })
    } else if (selection.kind === 'segment') {
      setLayout(removeSegment(layout, selection.id))
    } else if (selection.kind === 'object') {
      setLayout(removeObject(layout, selection.id))
    } else {
      setFlows(flows.map(f => (f.id === selection.id ? unlinked(f) : f)))
    }
    setSelection(null)
  }

  const paste = () => {
    const ids = clipboard.current.filter(id => byId.has(id))
    if (!ids.length) return
    const made = copyPoints(layout, ids, { x: PASTE_OFFSET_FT, y: PASTE_OFFSET_FT })
    setLayout(made.layout)
    setSelection(made.ids.length > 1 ? { kind: 'points', ids: made.ids } : { kind: 'point', id: made.ids[0] })
  }

  // Keyboard: tools, Esc, Delete, copy/paste, undo/redo — captured before the header's app-level ⌘Z,
  // which steps aside (PersistentHeader checks defaultPrevented). Bound once; calls the latest handler.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  onKey.current = (e: KeyboardEvent) => {
    // Only keys aimed at the editor (or nowhere in particular) — never a field, dialog or the tour.
    const target = e.target as HTMLElement | null
    if (isTyping(target) || (target && target !== document.body && !target.closest('.sim-editor'))) return
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase()
    if (mod && (k === 'z' || k === 'y')) {
      const isRedo = e.shiftKey || k === 'y'
      if (isRedo ? !canRedo : !canUndo) return              // nothing here: the header's app undo may take it
      e.preventDefault(); if (isRedo) redo(); else undo(); return
    }
    if (mod && k === 'c' && selectedPoints.length) { e.preventDefault(); clipboard.current = selectedPoints; return }
    if (mod && k === 'v' && clipboard.current.length) { e.preventDefault(); paste(); return }
    if (mod || e.altKey) return
    const t = TOOLS.find(x => x.key.toLowerCase() === k)
    if (t) chooseTool(t.id)
    else if (e.key === 'Escape' || e.key === 'Enter') { if (chainFrom || marks) cancel(); else if (e.key === 'Escape') setSelection(null) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection() }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e)
    document.addEventListener('keydown', listener, true)
    return () => document.removeEventListener('keydown', listener, true)
  }, [])

  const onLoaded = (d: LoadedDrawing) => {
    // The file took a while to read: build on what is stored now, not on the render that asked.
    const cur = latest(), old = cur.layout.background
    const same = old && old.fingerprint === d.fingerprint && (old.page ?? 1) === (d.page ?? 1)
    const background: Background = {
      kind: d.kind, fileName: d.fileName, page: d.page, fingerprint: d.fingerprint, widthPx: d.widthPx, heightPx: d.heightPx, data: d.data,
      ...(same && old?.scale
        ? { scale: old.scale }
        : {
            // Another file: show it at about the old drawing's size, and — when routes are already
            // drawn (in true feet) — do not resize them when its scale is set.
            ...(old ? { unscaledFtPerPx: ftPerPx(old) } : {}),
            ...(cur.layout.points.length ? { layoutPredates: true } : {}),
          }),
    }
    commit({ layout: { ...cur.layout, background }, flows: cur.flows })
    setFitKey(k => k + 1)
  }
  const applyScale = (lengthFt: number) => {
    if (!bg || !marks || marks.length < 2) return
    const toPx = (p: XY) => ({ x: p.x / scale, y: p.y / scale })
    const { unscaledFtPerPx: _u, layoutPredates, ...rest } = bg
    const next = { ...rest, scale: { a: toPx(marks[0]), b: toPx(marks[1]), lengthFt } }
    // What was drawn over the drawing is rescaled with it, so it stays where it was drawn — unless
    // it was there first (already in true feet) and this is the drawing's first scale.
    const k = layoutPredates && !bg.scale ? 1 : ftPerPx(next) / scale
    setLayout({ ...rescaleLayout(layout, k), background: next })
    setMarks(null); setFitKey(k2 => k2 + 1)
  }

  const hint = marks
    ? (marks.length < 2 ? (marks.length ? 'Click the end of the dimension' : 'Click the start of a known dimension') : 'Enter the real length in the Drawing card')
    : tool === 'routes' && chainFrom ? 'Click to continue · snaps to routes and objects · Shift = any angle · Enter or double-click to finish'
    : tool === 'points' && armed ? `Click on a route to place “${armed.name}”`
    : tool === 'points' && placeType === 'object' ? 'Drag out a wall, column or rack face'
    : TOOLS.find(t => t.id === tool)!.hint
  const imageFt = bg && image ? { href: image, widthFt: (bg.widthPx ?? 0) * scale, heightFt: (bg.heightPx ?? 0) * scale } : null
  // What the canvas shows mid-drag: moved points/objects, a bent handle, a box being dragged out.
  const shownLayout = drag?.kind === 'handle'
    ? setCurve(layout, drag.segId, drag.which === 'mid' ? { kind: 'arc', mid: drag.at }
      : (() => { const s = layout.segments.find(q => q.id === drag.segId); return s?.curve?.kind === 'bezier' ? { ...s.curve, [drag.which]: drag.at } : s?.curve })())
    : drag?.kind === 'object'
      ? updateObject(layout, drag.id, (() => { const o = layout.objects?.find(q => q.id === drag.id)!; return { x: o.x + drag.at.x - drag.from.x, y: o.y + drag.at.y - drag.from.y } })())
      : layout
  const offset = drag?.kind === 'points' ? { ids: new Set(drag.ids), d: { x: drag.at.x - drag.from.x, y: drag.at.y - drag.from.y } } : null

  return (
    <div className="sim-editor">
      <div className="sim-work">
        <div className="sim-canvas-wrap">
          <LayoutCanvas
            layout={shownLayout}
            driven={drag ? shownLayout : driven}
            flows={flows}
            image={imageFt}
            selection={selection}
            notConnected={loose}
            showFlows={showFlows}
            clearances={clearances}
            panOnEmpty={tool === 'select' && !marks}
            rubberFrom={chainFrom ? byId.get(chainFrom) ?? null : null}
            box={drag?.kind === 'box' ? { a: drag.from, b: drag.at, kind: drag.box } : null}
            marks={marks ?? []}
            offset={offset}
            onPointer={onPointer}
            onFlowClick={id => { if (tool === 'select' || tool === 'flows') setSelection({ kind: 'flow', id }) }}
            fitKey={fitKey}
            emptyPrompt={emptyPrompt}
            snapSquare={tool === 'routes'}
            snapOffsetFt={snapOffsetFt}
            showLegend={tool === 'direction' || showClearance}
            laneWidths={inputs.laneWidths}
            onDoubleClick={() => { if (tool === 'routes') cancel() }}
          >
            {/* Floating tool bar (proof-of-concept look): tools, then undo/redo. */}
            <div className="sim-tools" role="toolbar" aria-label="Layout tools" onPointerDown={e => e.stopPropagation()}>
              {TOOLS.map(t => {
                const off = t.id === 'scale' && !bg
                return (
                  <button key={t.id} type="button" className={`sim-tool${(t.id === 'scale' ? !!marks : tool === t.id && !marks) ? ' on' : ''}`} aria-pressed={tool === t.id}
                    disabled={off} title={off ? 'Load a drawing first — the blank grid is already in feet' : `${t.label} (${t.key})`} aria-label={t.label} onClick={() => chooseTool(t.id)}>
                    <ToolIcon name={t.id} />
                  </button>
                )
              })}
              <div className="sim-tool-sep" />
              <button type="button" className="sim-tool" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)" aria-label="Undo"><ToolIcon name="undo" /></button>
              <button type="button" className="sim-tool" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo"><ToolIcon name="redo" /></button>
            </div>
            {tool === 'points' && !marks && (
              <div className="sim-palette" aria-label="Point type" onPointerDown={e => e.stopPropagation()}>
                {PALETTE.map(t => (
                  <button key={t} type="button" className={`sim-palette-btn${placeType === t ? ' on' : ''}`} aria-pressed={placeType === t} onClick={() => setPlaceType(t)}>
                    {t === 'object' ? <span className="sim-object-swatch" aria-hidden /> : <Icon name={t as Exclude<SimPointType, 'junction'>} size={15} />}
                    <span>{t === 'object' ? 'Object' : POINT_LABEL[t]}</span>
                  </button>
                ))}
                {placeType !== 'object' && FLOW_POINT_TYPES.includes(placeType) && <Segmented options={ROLE_OPTIONS} value={placeRole} onChange={setPlaceRole} />}
              </div>
            )}
            {tool === 'routes' && !marks && (
              <div className="sim-palette" aria-label="New routes" onPointerDown={e => e.stopPropagation()}>
                <Segmented options={[{ id: 'two', label: 'Bidirectional' }, { id: 'ab', label: 'One-way' }]} value={routeKind.dir === 'two' ? 'two' : 'ab'}
                  onChange={dir => setRouteKind(k => ({ ...k, dir }))} />
                {routeKind.dir === 'two' && (
                  <Segmented options={[{ id: 'two', label: 'Two lanes' }, { id: 'single', label: 'Single lane' }]} value={routeKind.lane ?? 'two'}
                    onChange={lane => setRouteKind(k => ({ ...k, lane }))} />
                )}
              </div>
            )}
            <div className="sim-viewctl" onPointerDown={e => e.stopPropagation()}>
              <button type="button" className={`btn btn-sm${showFlows ? ' on' : ''}`} aria-pressed={showFlows} onClick={() => setShowFlows(v => !v)}>Flows</button>
              <button type="button" className={`btn btn-sm${showClearance ? ' on' : ''}`} aria-pressed={showClearance} onClick={() => setShowClearance(v => !v)}>B56.5</button>
              <button type="button" className="btn btn-sm" onClick={() => setFitKey(k => k + 1)}>Fit</button>
            </div>
            <p className={`sim-hint${hintFresh || marks || chainFrom || armed ? '' : ' is-faded'}`} aria-live="polite">{hint}</p>
            {message && <p className="sim-toast" role="status">{message}</p>}
          </LayoutCanvas>
        </div>
        <div className="sim-side">
          <DrawingCard
            background={bg}
            hasImage={!!image}
            unitSystem={unitSystem}
            marks={marks?.length ?? 0}
            scaling={!!marks}
            onLoaded={onLoaded}
            onStartScale={() => { setChainFrom(null); setMarks([]) }}
            onApplyScale={applyScale}
            onCancelScale={cancel}
            onRemove={() => { const { background: _b, ...rest } = layout; setLayout(rest) }}
            extentsFt={bg?.scale && bg.widthPx && bg.heightPx ? { w: bg.widthPx * scale, h: bg.heightPx * scale } : null}
          />
          <PlaceCard
            layout={layout}
            flows={flows}
            armed={armed}
            onArm={a => { setTool('points'); setChainFrom(null); setMarks(null); setPlaceType(a.type); setPlaceRole(a.role); setArmed(a) }}
            onArmHome={t => { setTool('points'); setChainFrom(null); setMarks(null); setPlaceType(t); setArmed(null) }}
          />
          <LayoutPanel
            layout={layout}
            flows={flows}
            vehicles={vehicles}
            selection={selection}
            unitSystem={unitSystem}
            clearances={clearances}
            rule={rule}
            onPoint={(id, patch) => setLayout(updatePoint(layout, id, patch), `point:${id}:${Object.keys(patch).join()}`)}
            onConvert={(id, type) => setLayout(convertPoint(layout, id, type, FLOW_POINT_TYPES.includes(type) ? placeRole : undefined))}
            onPoints={(ids, patch) => setLayout(ids.reduce((L, id) => updatePoint(L, id, patch), layout), `points:${Object.keys(patch).join()}`)}
            onSegment={(id, patch) => setLayout(updateSegment(layout, id, patch))}
            onCurve={(id, kind) => setLayout(setCurve(layout, id, kind === 'spline' ? splineHandles(layout, id) ?? undefined : undefined))}
            onObject={(id, patch) => setLayout(updateObject(layout, id, patch), `object:${id}:${Object.keys(patch).join()}`)}
            onRepeat={(id, count, stepFt, dir) => {
              const made = repeatPoint(layout, id, count, stepFt, dir)
              setLayout(made.layout)
              setSelection({ kind: 'points', ids: made.ids })
            }}
            onCopy={() => { clipboard.current = selectedPoints; paste() }}
            onFlow={(id, patch) => setFlows(flows.map(f => (f.id === id ? { ...f, ...patch } : f)), `flow:${id}:${Object.keys(patch).join()}`)}
            onUnlink={flowId => setFlows(flows.map(f => (f.id === flowId ? unlinked(f) : f)))}
            onDelete={deleteSelection}
          />
          <ChecksCard checks={checks} />
        </div>
      </div>
      <FlowsTable
        layout={layout}
        flows={flows}
        vehicleById={vehicleById}
        settings={settings}
        fleet={fleet}
        unitSystem={unitSystem}
        radiusFor={radiusFor}
        onFlows={setFlows}
        onSelect={id => { setTool('select'); setSelection({ kind: 'flow', id }) }}
      />
    </div>
  )
}
