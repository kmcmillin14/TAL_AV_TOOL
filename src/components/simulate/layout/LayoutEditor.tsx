'use client'

// Layout editor (spec v2 §5.1): Drawing & scale → Points (P) → Routes (R) → Flows (F), with
// Select (V) and Direction (D), undo/redo. Points first: a point can sit off every route and is
// listed "Not connected" until a route reaches it. Select also bends routes (drag the middle
// handle), moves and box-selects points (Shift-drag), copies and pastes (⌘C / ⌘V). The Points
// palette's Object draws walls and columns; "B56.5 clearances" shows the clearance path (§5.9).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { linkedFlows } from '@/src/calc/sim/readiness'
import { laneWidthFt } from '@/src/calc/sim/clearance'
import { clearanceRule, payloadFt, runInputs } from '@/src/calc/sim/runInputs'
import { roundCorners } from '@/src/calc/sim/corners'
import {
  addObject, addPoint, addSegment, convertPoint, copyPoints, flowRefusal, flowStartRefusal, FLOW_POINT_TYPES, linkFlow, movePoints,
  notConnected, placeOnSegment, pointsInBox, removeObject, removePoints, removeSegment, repeatPoint, rescaleLayout, setCurve,
  mergePoints, nextDirection, placeWithSpur, pointById, snapDraw, spurTarget, unlinked, splineHandles, type DrawSnap, splitSegment, updateObject, updatePoint, updateSegment, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimPointType, SimRole, SimSegment } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import Icon from '@/src/design-system/components/Icon'
import type { LoadedDrawing } from '@/src/lib/drawingImport'
import { newFlowId } from '@/src/lib/ids'
import { getDrawingData, type StoredProject } from '@/src/lib/storage'
import { fmtLength, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import DrawingCard from './DrawingCard'
import { ChecksCard, FlowsTable, PlaceCard, type Armed } from './SimCards'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import LayoutCanvas, { type CanvasPointer, type Handle, type Selection, type XY } from './LayoutCanvas'
import LayoutPanel, { Segmented } from './LayoutPanel'
import { useLayoutEditor, type EditorLayout, type ProjectFlow } from './useLayoutEditor'

type Tool = 'select' | 'hand' | 'points' | 'routes' | 'flows' | 'scale'
/** A press that moves further than this before release is a drag (Route tool: drag to draw), screen px. */
const DRAG_PX = 8
const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Click to select · drag to move · drag empty space to pan · Shift-drag to select several · a route’s badge (or D) changes its direction' },
  { id: 'hand', label: 'Hand', key: 'H', hint: 'Drag to move around · hold Space to pan in any tool' },
  { id: 'routes', label: 'Route', key: 'R', hint: 'Click or drag to draw a route · the + shows where it lands · start on a route to branch from it' },
  { id: 'points', label: 'Place', key: 'P', hint: 'Click to place · it joins the nearest route (dashed) · Shift places it unconnected' },
  { id: 'flows', label: 'Flow', key: 'F', hint: 'Click a Pick point, then a Drop point' },
  { id: 'scale', label: 'Scale', key: 'S', hint: 'Click both ends of a known dimension' },
]
/** Tool icons — the proof of concept's set, plus Flow. */
const TOOL_ICON: Record<Tool | 'undo' | 'redo', string> = {
  select: 'M5 3l14 8-6 2-2 6z', routes: 'M4 20V8h8v8h8V4',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5v-7a1.5 1.5 0 013 0V12M14 6.5a1.5 1.5 0 013 0V13M17 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-4.9-2.5L4.5 14a1.5 1.5 0 012.4-1.8L8 13.5',
  points: 'M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  flows: 'M4 18c6 0 9-12 16-12M15 3l5 3-5 3', scale: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
}
function ToolIcon({ name }: { name: keyof typeof TOOL_ICON }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={TOOL_ICON[name]} /></svg>
}
type Placeable = SimPointType | 'object'
const PALETTE: Placeable[] = [...FLOW_POINT_TYPES, ...VEHICLE_POINT_TYPES, 'object']
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

/** What a press-and-drag is doing until the pointer is released. */
type Drag =
  /** `snap`: one point dragged — where it lands (another point → they join on release). */
  | { kind: 'points'; ids: string[]; from: XY; at: XY; snap?: DrawSnap }
  | { kind: 'handle'; segId: string; which: Handle; at: XY }
  | { kind: 'object'; id: string; from: XY; at: XY }
  | { kind: 'box'; box: 'marquee' | 'object'; from: XY; at: XY }

interface Props {
  project: StoredProject
  vehicles: Vehicle[]
  vehicleById: Map<string, Vehicle>
  /** The run's vehicles (overrides applied) — for the lanes and clearances drawn; Sizing figures and
   *  measured distances keep the vehicle files (`vehicleById`). */
  simVehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  checks: ReadinessCheck[]
  unitSystem: UnitSystem
  emptyPrompt?: ReactNode
  /** Points and routes with an overridden assumption — marked with a dot on the map (acceptance 36). */
  overridden?: Set<string>
  /** Hands the page a way to change the layout through this editor (its undo history), so the
   *  Assumptions drawer's point and route edits are undo steps too and never overwritten. */
  registerLayoutWriter?: (write: ((update: (L: EditorLayout) => EditorLayout) => void) | null) => void
}

export default function LayoutEditor({ project, vehicles, vehicleById, simVehicleById, settings, fleet, checks, unitSystem, emptyPrompt, overridden, registerLayoutWriter }: Props) {
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
  const byId = useMemo(() => pointById(layout), [layout])
  const linked = useMemo(() => linkedFlows(flows), [flows])

  // The layout as driven: corners rounded to the largest turning radius among the flows' vehicles.
  // Corners drawn as the run drives them: the run's vehicles (overrides included). Sizing distances
  // are measured with the vehicle files (`radiusFor`), as the Fleet Engine reads them.
  const driven = useMemo(() => roundCorners(layout, Math.max(0, ...linked.map(f => (f.vehicleId && simVehicleById.get(f.vehicleId)?.calc.turningRadiusFt) || 0))), [layout, linked, simVehicleById])

  // B56.5 clearances (§5.9) — the same rule and payload a run uses (src/calc/sim/runInputs.ts).
  const rule = useMemo(() => clearanceRule(project.simSettings?.clearance), [project.simSettings?.clearance])
  // What a run would drive here: lane widths from the envelope (vehicle or pallet) and the clearances.
  const inputs = useMemo(
    () => runInputs(layout, flows, simVehicleById, rule, payloadFt(project.loads)?.width ?? 0),
    [layout, flows, simVehicleById, rule, project.loads],
  )
  const clearances = showClearance ? inputs.clearances : null
  /** Direction and lanes for the routes drawn next (Route tool options). One-way runs the way it is drawn. */
  const [routeKind, setRouteKind] = useState<Pick<SimSegment, 'dir' | 'lane'>>({ dir: 'two', lane: 'two' })
  // New routes snap half their aisle off an object, so the lane keeps its B56.5 clearance (rounded up
  // to 0.1 ft so the clearance check never lands a hair short).
  const snapOffsetFt = Math.ceil((laneWidthFt(routeKind, inputs.envelopeFt, rule) / 2) * 10) / 10

  const setLayout = (next: EditorLayout, merge?: string) => commit({ layout: next, flows }, merge)
  useEffect(() => {
    if (!registerLayoutWriter) return
    registerLayoutWriter(update => { const cur = latest(); commit({ layout: update(cur.layout), flows: cur.flows }) })
    return () => registerLayoutWriter(null)
  }, [registerLayoutWriter, latest, commit])
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

  /** Where a route click lands — the same `snapDraw` the canvas marks under the pointer. */
  const routeSnap = (at: XY, lock: boolean, px: number) =>
    snapDraw(layout, at, { px, from: chainFrom ? byId.get(chainFrom) : null, lock, offsetFt: snapOffsetFt })
  /** One route click: start, continue or join. A press-drag-release is two of these (drag to draw). */
  const routeClick = (at: XY, lock: boolean, px: number) => {
    const end = anchor(routeSnap(at, lock, px))
    if (chainFrom && chainFrom !== end.id) setLayout(addSegment(end.layout, chainFrom, end.id, routeKind).layout)
    else if (end.layout !== layout) setLayout(end.layout)
    setChainFrom(end.id)
    setHover(null)
  }
  /** Where the Route tool was pressed — a release more than a few pixels away draws to there. */
  const press = useRef<XY | null>(null)
  /** Where a placed point lands — and, on open floor, the route it joins by a spur (Shift: none). */
  const placeSnap = (at: XY, px: number, shift: boolean): DrawSnap => {
    const snap = snapDraw(layout, at, { px })
    return (snap.kind === 'free' || snap.kind === 'object') && !shift ? { ...snap, spur: spurTarget(layout, snap.at) } : snap
  }
  const [hover, setHover] = useState<DrawSnap | null>(null)
  /** A point id to draw from or to: the point it snapped to, a new junction on a route, or one on open floor. */
  const anchor = (snap: DrawSnap): { layout: EditorLayout; id: string } =>
    snap.kind === 'point' ? { layout, id: snap.id }
    : snap.kind === 'route' ? splitSegment(layout, snap.id, snap.at) ?? addPoint(layout, snap.at, 'junction')
    : addPoint(layout, snap.at, 'junction')

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
    if (d.kind === 'points' && d.snap?.kind === 'point') {
      // An end dropped on another point joins it; flows linked to the dropped point follow.
      // Refused (nothing changes) when a flow on the dropped point would no longer be a valid
      // Pick → Drop — e.g. a flow's pick dropped on its own drop, or on a charger.
      const [id] = d.ids, into = d.snap.id
      const re = (pid?: string) => (pid === id ? into : pid)
      const merged = mergePoints(movePoints(layout, d.ids, { x: dx, y: dy }), id, into)
      const touches = (f: ProjectFlow) => f.fromPointId === id || f.toPointId === id
      const moved = flows.map(f => (touches(f) ? { ...f, fromPointId: re(f.fromPointId), toPointId: re(f.toPointId) } : f))
      const why = flows.flatMap((f, i) => {
        const m = moved[i]
        return touches(f) && m.fromPointId && m.toPointId ? [flowRefusal(merged, m.fromPointId, m.toPointId)] : []
      }).find(Boolean)
      if (why) { say(`Not joined — ${why.toLowerCase()}`); return }
      commit({ layout: merged, flows: moved })
      setSelection({ kind: 'point', id: into })
    } else if (d.kind === 'points' && (dx || dy)) setLayout(movePoints(layout, d.ids, { x: dx, y: dy }))
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
    if (type === 'move') {
      if (drag?.kind === 'points' && drag.ids.length === 1) {
        // One point dragged: it snaps like a route end (points, objects, lined up) — never onto its own routes.
        const p0 = byId.get(drag.ids[0])!
        const snap = snapDraw(layout, { x: p0.x + at.x - drag.from.x, y: p0.y + at.y - drag.from.y }, { px, exclude: new Set(drag.ids), routes: false })
        setDrag({ ...drag, at: { x: drag.from.x + snap.at.x - p0.x, y: drag.from.y + snap.at.y - p0.y }, snap })
      } else if (drag) setDrag({ ...drag, at })
      else if (tool === 'routes' && !marks) setHover(routeSnap(at, shift, px))
      else if (tool === 'points' && placeType !== 'object' && !marks) setHover(placeSnap(at, px, shift))
      return
    }
    if (type === 'up') {
      if (drag) onRelease(drag)
      else if (tool === 'routes' && press.current && Math.hypot(at.x - press.current.x, at.y - press.current.y) > DRAG_PX * px) routeClick(at, shift, px)
      press.current = null
      setDrag(null)
      return
    }
    if (hit?.kind === 'dir') { stepDirection(hit.id); return }
    if (tool === 'select') { onSelectPress(at, hit, shift); return }
    if (tool === 'points') {
      if (placeType === 'object') { setDrag({ kind: 'box', box: 'object', from: at, at }); return }
      // The same snap as routes: onto a route within reach (it joins), an existing point selects it.
      const snap = placeSnap(at, px, shift)
      if (snap.kind === 'point') { setSelection({ kind: 'point', id: snap.id }); return }
      const role = FLOW_POINT_TYPES.includes(placeType) ? placeRole : undefined
      const placed = (snap.kind === 'route' && placeOnSegment(layout, snap.id, snap.at, placeType, role))
        || ('spur' in snap && snap.spur ? placeWithSpur(layout, snap.at, placeType, role, snap.spur) : addPoint(layout, snap.at, placeType, role))
      setHover(null)
      // Armed from "Place on routes": the point takes the Sizing name, so the flows link by it.
      setLayout(armed ? updatePoint(placed.layout, placed.id, { name: armed.name }) : placed.layout)
      setSelection({ kind: 'point', id: placed.id })
      setArmed(null)
    } else if (tool === 'routes') {
      press.current = at
      routeClick(at, shift, px)
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
    }
  }

  /** The route badge (or D): two-way → one-way → the other way. Lanes stay as set. */
  const stepDirection = (segId: string) => {
    const s = layout.segments.find(q => q.id === segId)
    if (s) setLayout(updateSegment(layout, s.id, { dir: nextDirection(s.dir) }), `dir:${s.id}`)
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
  /** Space held: pan in any tool (as in most drawing apps). */
  const [spaceHeld, setSpaceHeld] = useState(false)
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
    if (k === ' ') { e.preventDefault(); if (!e.repeat) setSpaceHeld(true); return }
    if (k === 'd' && selection?.kind === 'segment') { stepDirection(selection.id); return }
    const t = TOOLS.find(x => x.key.toLowerCase() === k)
    if (t) chooseTool(t.id)
    else if (e.key === 'Escape' || e.key === 'Enter') { if (chainFrom || marks) cancel(); else if (e.key === 'Escape') setSelection(null) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection() }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e)
    const release = (e: KeyboardEvent) => { if (e.key === ' ') setSpaceHeld(false) }
    const blur = () => setSpaceHeld(false)
    document.addEventListener('keydown', listener, true)
    document.addEventListener('keyup', release, true)
    window.addEventListener('blur', blur)
    return () => { document.removeEventListener('keydown', listener, true); document.removeEventListener('keyup', release, true); window.removeEventListener('blur', blur) }
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
    : tool === 'routes' && chainFrom ? 'Click where the + is to continue · it joins points and routes it touches · Shift keeps it straight · right-click or Enter to finish'
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
            panAlways={tool === 'hand' || spaceHeld}
            fmtLen={ft => fmtLength(ft, unitSystem, 1)}
            rubberFrom={chainFrom ? byId.get(chainFrom) ?? null : null}
            box={drag?.kind === 'box' ? { a: drag.from, b: drag.at, kind: drag.box } : null}
            marks={marks ?? []}
            offset={offset}
            onPointer={onPointer}
            onFlowClick={id => { if (tool === 'select' || tool === 'flows') setSelection({ kind: 'flow', id }) }}
            fitKey={fitKey}
            emptyPrompt={tool === 'select' ? emptyPrompt : undefined}
            aim={tool !== 'select' && tool !== 'hand'}
            onContextMenu={e => { if (chainFrom || marks) { e.preventDefault(); cancel() } }}
            snap={spaceHeld ? null : drag?.kind === 'points' ? drag.snap ?? null : (tool === 'routes' || (tool === 'points' && placeType !== 'object')) && !marks ? hover : null}
            onLeave={() => setHover(null)}
            showLegend={showClearance || selection?.kind === 'segment'}
            laneWidths={inputs.laneWidths}
            overridden={overridden}
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
