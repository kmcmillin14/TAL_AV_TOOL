'use client'

// Layout editor (spec v2 §5.1; path editor, owner 2026-11-16): a full-height canvas with the tool hint
// under it, and one side panel whose content is the stage strip's stage (2026-11-18): Setup (drawing,
// payloads), Layout (selection first, or the navigator), Connect (validation, flows) and Chargers. On
// Layout, Sizing's unplaced stations wait in a tray on the map, dragged (or clicked) onto it; flows show
// for the selection, or all with the Flows button. Tool bar: Path (P) · Endpoint (E) · Lasso (L) · Undo ·
// Redo. Off the bar, on their keys: Hand (H, or Space), Route (R), Flow (F), Scale (S, or Setup's drawing
// card); V is Lasso. A selected path gets a bar (direction, lanes, length, delete) and lane grips; D steps
// direction; arrows nudge; Tab steps through stations; ⌘C / ⌘V copy points. The Endpoint palette's Object
// draws walls and columns; "B56.5" shows the clearance path (§5.9).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { linkedFlows } from '@/src/calc/sim/readiness'
import { pathPoints } from '@/src/calc/sim/engine'
import { buildGraph } from '@/src/calc/sim/graph'
import { highwayConnections, highwayCorners, highwayEnds, highwayFromEnds, highwaysTouching, withHighways } from '@/src/calc/sim/highways'
import { suggestedWidthFt, type SegmentClearance } from '@/src/calc/sim/clearance'
import { clearanceRule, runInputs, simInputsKey } from '@/src/calc/sim/runInputs'
import { roundCorners } from '@/src/calc/sim/corners'
import {
  addObject, addPoint, addSegment, convertPoint, copyPoints, flowRefusal, flowStartRefusal, flowTargets, hitTest, FLOW_POINT_TYPES, linkFlow, movePoints,
  notConnected, placeOnSegment, removeObject, removePoints, removeSegment, repeatPoint, rescaleLayout, setCurve,
  mergePoints, nextDirection, placeWithSpur, addHighway, highwayEndsAt, highwayLanes, laneKind, moveHighwayEnds, removeHighways, updateHighways, pointsInLoop, pointById, snapDraw, spurTarget, unlinked, splineHandles, type DrawSnap, splitSegment, updateObject, updatePoint, updateSegment, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import { fixAction, type checkStatus, type ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimHighway, SimLayout, SimPoint, SimPointType, SimRack, SimRole, SimSegment } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import Icon from '@/src/design-system/components/Icon'
import type { LoadedDrawing } from '@/src/lib/drawingImport'
import { newFlowId } from '@/src/lib/ids'
import { useByValue } from '@/src/lib/useByValue'
import { getDrawingData, patchSimSettings, type StoredProject } from '@/src/lib/storage'
import { fmtLength, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import DrawingCard from './DrawingCard'
import { ChargersCard, drawingStatus, FlowsList, placeProgress, StationTray, ValidationList, type Armed } from './SimCards'
import SetupCard, { payloadsKey } from './SetupCard'
import type { Stage } from '../ui/Guide'
import { Section } from '../inspector/InspectorParts'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import LayoutCanvas, { POINT_HIT_PX, rackLabel, type CanvasPointer, type Handle, type Selection, type XY } from './LayoutCanvas'
import LayoutPanel, { Segmented } from './LayoutPanel'
import PathBar from './PathBar'
import RackBar from './RackBar'
import { flipRack, rackFromBox, rackGeometry, rackLengthFor, stretchRack } from '@/src/calc/sim/racks'
import { useLayoutEditor, type EditorLayout, type ProjectFlow } from './useLayoutEditor'

/** The stages this editor's side panel shows (the rest are the run and the overview). */
export type EditorStage = Extract<Stage, 'layout' | 'points' | 'routes' | 'flows' | 'chargers'>

type Tool = 'lasso' | 'hand' | 'points' | 'routes' | 'highway' | 'flows' | 'scale'
/** A press that moves further than this before release is a drag (Route tool: drag to draw), screen px. */
const DRAG_PX = 8
/** Every tool, once (owner, 2026-11-16: the bar is "Paths, endpoints, lasso, undo, redo"; the rest
 *  stay on their keys — spec "Kept, off the bar"). The first key is the one shown. */
const TOOL_DEFS: Record<Tool, { keys: string[]; hint: string; bar?: { label: string; icon: string } }> = {
  highway: { keys: ['p', 'w'], hint: 'Drag to draw a path · click a path to edit it · Enter to select', bar: { label: 'Path', icon: 'M3 6h18M3 18h18M8 12h8M14 10l2 2-2 2M10 10l-2 2 2 2' } },
  points: { keys: ['e'], hint: 'Click beside a path to add an endpoint · Shift places it unconnected · Enter to select', bar: { label: 'Endpoint', icon: 'M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' } },
  lasso: { keys: ['l', 'v'], hint: 'Click to select · draw a loop for several · drag a path end to turn it', bar: { label: 'Lasso', icon: 'M8 17.5C4.5 16.5 3 14 3 11.5 3 7 7 4 12 4s9 3 9 7.5-4 7.5-9 7.5c-1.5 0-3-.2-4-.5M8 17.5c-1 1-1 3 1 3.5' } },
  hand: { keys: ['h'], hint: 'Drag to move around · hold Space to pan in any tool' },
  routes: { keys: ['r'], hint: 'Click or drag to draw a route · the + shows where it lands · start on a route to branch from it' },
  flows: { keys: ['f'], hint: 'Click a Pick (or a Drop) — the points it can link to light up' },
  scale: { keys: ['s'], hint: 'Click both ends of a known dimension' },
}
const BAR = (Object.entries(TOOL_DEFS) as [Tool, (typeof TOOL_DEFS)[Tool]][]).flatMap(([id, t]) => (t.bar ? [{ id, key: t.keys[0].toUpperCase(), ...t.bar }] : []))
const KEYS = Object.fromEntries((Object.entries(TOOL_DEFS) as [Tool, (typeof TOOL_DEFS)[Tool]][]).flatMap(([id, t]) => t.keys.map(k => [k, id]))) as Record<string, Tool>
const UNDO_ICON = 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', REDO_ICON = 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3'
function ToolIcon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
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
  /** Endpoint tool's Object: a wall, column or rack face being dragged out. */
  | { kind: 'box'; from: XY; at: XY }
  /** Endpoint tool's Rack: a rack being dragged out; a selected rack's end dragged longer or shorter. */
  | { kind: 'rackDraw'; from: XY; at: XY }
  | { kind: 'rackEnd'; id: string; end: 'a' | 'b'; at: XY }
  /** Highway tool: dragging one out from end to end (each end snapped). */
  | { kind: 'hwDraw'; from: XY; at: XY; snap: DrawSnap; hit: CanvasPointer['hit'] }
  /** A highway moved whole, or one of its ends dragged (stretch / turn). */
  /** `ids`: every highway moved together (the one pressed, or the whole multi-selection). */
  | { kind: 'highway'; id: string; ids: string[]; from: XY; at: XY }
  /** Lasso tool: the loop drawn so far; `add` (Shift) adds to the selection. */
  | { kind: 'lasso'; pts: XY[]; add: boolean }
  /** `linked`: other highways' ends at the same spot (a corner) — they move with it. */
  /** `pivot`: the other end, which it turns about; `rest`: what it snaps to (the layout without the
   *  moving highways) — both worked out once, at the press. */
  | { kind: 'hwEnd'; id: string; end: 'a' | 'b'; at: XY; snap?: DrawSnap; linked: { id: string; end: 'a' | 'b' }[]; pivot: XY; rest: SimLayout }
  /** A lane grip: two lanes once dragged further than `twoAt` from the centre line (`c`, normal `n`). */
  | { kind: 'hwGrip'; id: string; lanes: 1 | 2; c: XY; n: XY; twoAt: number }

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
  /** Layout › Drawing's "or start from an example" (an empty layout only). */
  examples?: ReactNode
  /** Points and routes with an overridden assumption — marked with a dot on the map (acceptance 36). */
  overridden?: Set<string>
  /** Hands the page a way to change the layout through this editor (its undo history), so the
   *  Assumptions drawer's point and route edits are undo steps too and never overwritten. */
  registerLayoutWriter?: (write: ((update: (L: EditorLayout) => EditorLayout) => void) | null) => void
  /** The stage — the side panel's content; owned by the page (its strip and validation status open it). */
  stage: EditorStage
  onStage: (s: Stage) => void
  /** The validation status (tone and counts), worked out once by the page. */
  status: ReturnType<typeof checkStatus>
  /** Shown at the top of the side panel (the sample banner). */
  banner?: ReactNode
  /** Simulation vehicles: the flows as the run drives them — lanes, corners and B56.5 follow.
   *  Sizing's flows (and new flows drawn here) keep their own vehicle. */
  runAs?: <F extends { id: string; vehicleId?: string }>(flows: F[]) => { flows: F[] }
  /** Each vehicle type's payload, ft, by vehicle id. */
  payloads?: Record<string, { length: number; width: number }>
  /** The simulation's vehicle types (the flow inspector's Vehicle list) and a flow's choice among them. */
  vehicleTypes?: Vehicle[]
  onFlowVehicle?: (flowId: string, vehicleId: string) => void
  /** The guide: the steps at the top of the side panel, and its one Next at the foot. */
  guide: { list: ReactNode; next: ReactNode }
  /** The Vehicles step's content (the shell owns the vehicle types and counts). */
  vehiclesStep: ReactNode
  /** Chargers to place (`suggestedChargers`), and the vehicles the run places (each needs a home). */
  suggestedChargers: number
  vehiclesPlaced: number
}
const PATH_KIND = { dir: 'two', lane: 'single' } as const
/** A rack face this close to a path's centre line stands beside it (its endpoint in the aisle), ft. */
const RACK_BESIDE_FT = 12
const NO_LOADS: NonNullable<StoredProject['loads']> = []
const NO_PAYLOADS: Record<string, { length: number; width: number }> = {}
/** Arrow keys move the selection this far, ft (Shift: ×10). */
const NUDGE_FT = 1

export default function LayoutEditor({ project, vehicles, vehicleById, simVehicleById, settings, fleet, checks, unitSystem, emptyPrompt, examples, overridden, registerLayoutWriter, stage, onStage, status, banner, runAs, payloads = NO_PAYLOADS, vehicleTypes = [], onFlowVehicle, suggestedChargers, vehiclesPlaced, guide, vehiclesStep }: Props) {
  /** Step 1 loads — a rack's pallet. */
  const loads = useByValue(project.loads ?? NO_LOADS)
  /** A new rack's pallet, already confirmed upstream (owner, 2026-11-17): the simulation vehicles' first
   *  payload when it has a size, else the first Step 1 load with one; none → the rack asks. */
  const defaultPallet = useMemo((): SimRack['pallet'] => {
    const sized = (id: string) => loads.some(l => l.id === id && l.lengthIn && l.widthIn && l.heightIn)
    const pay = project.simSettings?.vehicles?.[0]?.payload
    if (pay && 'loadId' in pay && sized(pay.loadId)) return { loadId: pay.loadId }
    if (pay && !('loadId' in pay) && pay.heightIn) return { lengthIn: pay.lengthIn, widthIn: pay.widthIn, heightIn: pay.heightIn }
    const first = loads.find(l => sized(l.id))
    return first ? { loadId: first.id } : undefined
  }, [loads, project.simSettings?.vehicles])
  const radiusFor = useCallback((id?: string) => (id && vehicleById.get(id)?.calc.turningRadiusFt) || 0, [vehicleById])
  const editor = useLayoutEditor(project, radiusFor)
  const { doc, latest, commit, canUndo, canRedo } = editor
  const { layout, flows } = doc
  const [tool, setTool] = useState<Tool>('lasso')
  const [placeType, setPlaceType] = useState<Placeable>('stand')
  const [placeRole, setPlaceRole] = useState<SimRole>('pick')
  const [selection, setSelection] = useState<Selection>(null)
  const [chainFrom, setChainFrom] = useState<string | null>(null)       // route or flow being drawn
  const [marks, setMarks] = useState<XY[] | null>(null)                 // null = not setting the scale
  const [drag, setDrag] = useState<Drag | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /** All flows on the map (the Flows button), or — by default — only the selection's (owner plan, 2026-11-21). */
  const [showFlows, setShowFlows] = useState(false)
  const [showClearance, setShowClearance] = useState(false)
  const [fitKey, setFitKey] = useState(0)
  /** The side panel's tab. */
  /** Centre the view here (navigator, Tab); the key re-centres on the same spot. */
  const [center, setCenter] = useState<{ at: XY; key: number } | null>(null)
  const focusOn = (sel: NonNullable<Selection>, at: XY) => { setSelection(sel); setCenter(c => ({ at, key: (c?.key ?? 0) + 1 })) }
  /** Place tool armed from the station tray: the next point gets this name, type and role. */
  const [armed, setArmed] = useState<Armed | null>(null)
  /** The armed station was pressed in the tray and is being dragged: releasing over the map places it. */
  const fromTray = useRef(false)
  const clipboard = useRef<string[]>([])

  const bg = layout.background
  const image = getDrawingData(project.id)
  const scale = ftPerPx(bg)
  const byId = useMemo(() => pointById(layout), [layout])
  const linked = useMemo(() => linkedFlows(flows), [flows])
  // Flow tool: from the clicked start, every point it can link to (lit) or not (dimmed, with why).
  // One routing graph while a start is armed (targets and path previews share it); only the flows'
  // links matter here, so typing a rate does not recompute them.
  const graph = useMemo(() => (tool === 'flows' && chainFrom ? buildGraph(layout) : null), [tool, chainFrom, layout])
  const links = useByValue(useMemo(() => flows.map(f => ({ fromPointId: f.fromPointId, toPointId: f.toPointId })), [flows]))
  const targets = useMemo(() => (graph && chainFrom ? flowTargets(layout, chainFrom, links, graph) : null), [graph, chainFrom, layout, links])
  const targetMarks = useMemo(() => (targets ? new Map(targets.targets.map(t => [t.id, t])) : null), [targets])
  /** The lit target under the pointer (for this start): its path along the routes is previewed. */
  const [hoverOn, setHoverOn] = useState<{ start: string; id: string } | null>(null)
  const preview = useMemo(() => {
    const t = hoverOn && hoverOn.start === chainFrom ? targetMarks?.get(hoverOn.id) : undefined
    return t?.ok && graph ? { path: pathPoints(layout, t.pick, t.drop, graph) ?? [], distanceFt: t.distanceFt ?? 0 } : null
  }, [hoverOn, chainFrom, targetMarks, layout, graph])
  /** A flow just linked here: the inspector opens it with Moves per hour focused. */
  const [justAdded, setJustAdded] = useState<string | null>(null)
  // The flows as the simulation drives them (simulation vehicles) — lanes, corners and B56.5 follow.
  const simFlows = useMemo(() => (runAs ? runAs(flows).flows : flows), [flows, runAs])
  /** Each flow's simulation vehicle (the flow inspector). */
  const simVehicleOf = useMemo(() => new Map(simFlows.map(f => [f.id, f.vehicleId])), [simFlows])
  const simLinked = useMemo(() => (simFlows === flows ? linked : linkedFlows(simFlows)), [simFlows, flows, linked])

  // The layout as driven: corners rounded to the largest turning radius among the flows' vehicles.
  // Corners drawn as the run drives them: the run's vehicles (overrides included). Sizing distances
  // are measured with the vehicle files (`radiusFor`), as the Fleet Engine reads them.
  // The layout with its highways as routes (derived): what snaps, spurs and the drawn lanes use.
  const net = useMemo(() => withHighways<SimLayout>(layout), [layout])
  const loose = useMemo(() => new Set(notConnected(net).map(p => p.id)), [net])
  const driven = useMemo(() => roundCorners(net, Math.max(0, ...simLinked.map(f => (f.vehicleId && simVehicleById.get(f.vehicleId)?.calc.turningRadiusFt) || 0))), [net, simLinked, simVehicleById])

  // B56.5 clearances (§5.9) — the same rule and payload a run uses (src/calc/sim/runInputs.ts).
  const rule = useMemo(() => clearanceRule(project.simSettings?.clearance), [project.simSettings?.clearance])
  // What a run would drive here: lane widths from the envelope (vehicle or pallet) and the clearances.
  const inputs = useMemo(
    () => runInputs(layout, simFlows, simVehicleById, rule, payloads, loads),
    [layout, simFlows, simVehicleById, rule, payloads, loads],
  )
  const clearances = showClearance ? inputs.clearances : null
  /** Direction and lanes for the routes drawn next (Route tool options). One-way runs the way it is drawn. */
  const [routeKind, setRouteKind] = useState<Pick<SimSegment, 'dir' | 'lane'>>({ dir: 'two', lane: 'two' })
  // New routes and highways are drawn at the suggested B56.5 width, and snap half of it off an object,
  // so the lane keeps its clearance.
  const newWidthFt = suggestedWidthFt(routeKind, inputs.envelopeFt, rule), snapOffsetFt = newWidthFt / 2
  /** A new path is one lane, two-way (owner: "one lane, expand to two"), at the suggested width. */
  const pathWidthFt = suggestedWidthFt(PATH_KIND, inputs.envelopeFt, rule)
  /** Each highway's worst B56.5 status, from the same clearances a run uses (its derived routes). */
  const highwayStatus = useMemo(() => {
    const of = new Map(net.segments.flatMap(s => (s.highwayId ? [[s.id, s.highwayId] as const] : [])))
    const rank = { clear: 0, full: 0, capped: 1, violation: 2 }
    const out = new Map<string, SegmentClearance['status']>()
    for (const c of inputs.clearances) {
      const h = of.get(c.segId), was = h && out.get(h)
      if (h && (!was || rank[c.status] > rank[was])) out.set(h, c.status)
    }
    return out
  }, [net, inputs.clearances])

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
    if (t === 'scale') { if (bg) { setChainFrom(null); setMarks([]); onStage('layout') } return }
    setTool(t); cancel(); setDrag(null)
  }
  /** Undo/redo can remove what a half-drawn route or a selection points at: drop both. */
  const undo = () => { cancel(); setSelection(null); editor.undo() }
  const redo = () => { cancel(); setSelection(null); editor.redo() }
  const selectedPoints = selection?.kind === 'points' ? selection.ids : selection?.kind === 'point' ? [selection.id] : []
  const selectedHighways = selection?.kind === 'highways' ? selection.ids : selection?.kind === 'highway' ? [selection.id] : []
  const highwaySelection = (ids: string[]): Selection => (ids.length > 1 ? { kind: 'highways', ids } : ids.length ? { kind: 'highway', id: ids[0] } : null)
  const pointSelection = (ids: string[]): Selection => (ids.length > 1 ? { kind: 'points', ids } : ids.length ? { kind: 'point', id: ids[0] } : null)
  /** A lasso loop: the highways it touches; with none, the points inside. `add` keeps
   *  what was selected (of the same kind). */
  const selectLoop = (loop: XY[], add: boolean) => {
    const hw = highwaysTouching(layout, loop)
    if (hw.length) { setSelection(highwaySelection([...new Set([...(add ? selectedHighways : []), ...hw])])); return }
    const pts = pointsInLoop(layout, loop)
    if (pts.length) setSelection(pointSelection([...new Set([...(add ? selectedPoints : []), ...pts])]))
    else if (!add) setSelection(null)                 // Shift over empty floor keeps the selection
  }

  /** Where a route click lands — the same `snapDraw` the canvas marks under the pointer. */
  const routeSnap = (at: XY, lock: boolean, px: number) =>
    snapDraw(net, at, { px, from: chainFrom ? byId.get(chainFrom) : null, lock, offsetFt: snapOffsetFt })
  /** Where a highway end lands — the same snaps as a route end; off an object by half its width. */
  const hwSnap = (at: XY, lock: boolean, px: number, from: XY | null) =>
    snapDraw(net, at, { px, from, lock, offsetFt: pathWidthFt / 2, diag: true })
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
    const snap = snapDraw(net, at, { px })
    return (snap.kind === 'free' || snap.kind === 'object') && !shift ? { ...snap, spur: spurTarget(net, snap.at) } : snap
  }
  const [hover, setHover] = useState<DrawSnap | null>(null)
  /** A point id to draw from or to: the point it snapped to, a new junction on a route, or one on open floor. */
  const anchor = (snap: DrawSnap): { layout: EditorLayout; id: string } =>
    // A highway's derived end or crossing is not stored: a junction there joins it.
    snap.kind === 'point' ? (byId.has(snap.id) ? { layout, id: snap.id } : addPoint(layout, snap.at, 'junction'))
    : snap.kind === 'route' ? splitSegment(layout, snap.id, snap.at) ?? addPoint(layout, snap.at, 'junction')
    : addPoint(layout, snap.at, 'junction')

  const onSelectPress = (at: XY, hit: CanvasPointer['hit'], shift: boolean) => {
    if (hit?.kind === 'handle') { setDrag({ kind: 'handle', segId: hit.id, which: hit.which, at }); return }
    if (hit?.kind === 'point') {
      const ids = shift
        ? (selectedPoints.includes(hit.id) ? selectedPoints.filter(i => i !== hit.id) : [...selectedPoints, hit.id])
        : selectedPoints.includes(hit.id) ? selectedPoints : [hit.id]
      setSelection(pointSelection(ids))
      if (ids.includes(hit.id)) setDrag({ kind: 'points', ids, from: at, at })
      return
    }
    if (hit?.kind === 'object') { setSelection({ kind: 'object', id: hit.id }); setDrag({ kind: 'object', id: hit.id, from: at, at }); return }
    if (hit?.kind === 'hwEnd') {
      const h = layout.highways?.find(q => q.id === hit.id)
      if (!h) return
      setSelection({ kind: 'highway', id: hit.id })
      const e = highwayEnds(h), end = e[hit.end], linked = highwayEndsAt(layout, end, hit.id)
      const moving = new Set([hit.id, ...linked.map(l => l.id)])
      const rest = withHighways<SimLayout>({ ...layout, highways: layout.highways?.filter(q => !moving.has(q.id)) })
      setDrag({ kind: 'hwEnd', id: hit.id, end: hit.end, at: end, linked, pivot: e[hit.end === 'a' ? 'b' : 'a'], rest })
      return
    }
    if (hit?.kind === 'highway') {
      // Shift-click adds or removes it; a press on one of several selected moves them all.
      if (shift) { setSelection(highwaySelection(selectedHighways.includes(hit.id) ? selectedHighways.filter(i => i !== hit.id) : [...selectedHighways, hit.id])); return }
      const ids = selectedHighways.includes(hit.id) ? selectedHighways : [hit.id]
      setSelection(highwaySelection(ids))
      setDrag({ kind: 'highway', id: hit.id, ids, from: at, at })
      return
    }
    if (hit?.kind === 'segment') { setSelection({ kind: 'segment', id: hit.id }); return }
    // Empty floor: a loop selects several (a plain click clears the selection).
    setDrag({ kind: 'lasso', pts: [at], add: shift })
  }
  /** A click (no drag) on something drawn while drawing: select it and go back to Lasso. */
  const selectDrawn = (hit: CanvasPointer['hit']): boolean => {
    const sel: Selection = hit?.kind === 'point' || hit?.kind === 'highway' || hit?.kind === 'object' || hit?.kind === 'segment' ? { kind: hit.kind, id: hit.id } : null
    if (!sel) return false
    setSelection(sel); setTool('lasso'); setHover(null)
    return true
  }
  /** A highway patch that changes its lane count brings the suggested width for the new count (the
   *  selection bar, the grip and the inspector alike); the width typed in the inspector stays. */
  const withLaneWidth = (h: SimHighway, patch: Partial<SimHighway>): Partial<SimHighway> => {
    const k = { dir: patch.dir ?? h.dir, lane: 'lane' in patch ? patch.lane : h.lane }
    return highwayLanes(k) !== highwayLanes(h) && patch.widthFt == null ? { ...patch, widthFt: suggestedWidthFt(k, inputs.envelopeFt, rule) } : patch
  }
  /** Lanes for a highway: the direction that fits (2 lanes is two-way), and the width with it. */
  const lanePatch = (h: SimHighway, lanes: 1 | 2) => withLaneWidth(h, laneKind(h, lanes))
  const setLanes = (ids: string[], lanes: 1 | 2) => setLayout(updateHighways(layout, ids, h => lanePatch(h, lanes)))
  /** Direction only: the stored lanes and the width stay, so stepping round comes back as it was
   *  (one-way drives one lane whatever is stored). */
  const setDirection = (ids: string[], dir: (h: SimHighway) => SimHighway['dir']) => setLayout(updateHighways(layout, ids, h => ({ dir: dir(h) })), `dir:${ids.join()}`)

  const onRelease = (d: Drag) => {
    if (d.kind === 'lasso') { selectLoop(d.pts, d.add); return }
    if (d.kind === 'hwGrip') {
      const h = layout.highways?.find(q => q.id === d.id)
      if (h && highwayLanes(h) !== d.lanes) setLanes([d.id], d.lanes)
      return
    }
    const from = d.kind === 'handle' || d.kind === 'hwEnd' || d.kind === 'rackEnd' ? d.at : d.from
    const dx = d.at.x - from.x, dy = d.at.y - from.y
    // (A highway's derived end or crossing is not stored: the point just lands there and joins it.)
    if (d.kind === 'points' && d.snap?.kind === 'point' && byId.has(d.snap.id)) {
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
    } else if (d.kind === 'rackDraw') {
      // Joins the nearest path from the middle of its served face, like any endpoint.
      const made = draftRackFrom(d)
      if (made) {
        // In the aisle: on a path's centre line (a highway joins it by itself; a drawn route is split).
        const spur = made.join ? null : spurTarget(net, made)
        const placed = made.join ? (byIdSeg(made.join.id) && placeOnSegment(layout, made.join.id, made.join.at, 'rack', placeRole)) || addPoint(layout, made.join.at, 'rack', placeRole)
          : spur ? placeWithSpur(layout, made, 'rack', placeRole, spur) : addPoint(layout, made, 'rack', placeRole)
        setLayout(updatePoint(placed.layout, placed.id, { rack: made.rack, name: `Rack ${layout.points.filter(q => q.rack).length + 1}` }))
        setSelection({ kind: 'point', id: placed.id }); setTool('lasso')
      }
    } else if (d.kind === 'rackEnd') {
      setLayout(stretchedRack(d))
    } else if (d.kind === 'box') {
      const made = addObject(layout, d.from, d.at)
      if (made.id) { setLayout(made.layout); setSelection({ kind: 'object', id: made.id }) }
    } else if (d.kind === 'hwDraw') {
      const made = addHighway(layout, d.from, d.at, pathWidthFt, PATH_KIND)
      if (made.id) { setLayout(made.layout); setSelection({ kind: 'highway', id: made.id }) }
      else selectDrawn(d.hit)
    } else if (d.kind === 'highway' || d.kind === 'hwEnd') {
      if ((d.kind === 'hwEnd' && d.snap) || dx || dy) setLayout(draggedHighway(d))   // a plain click only selects
    }
  }

  // Each step sets up the map (owner, 2026-11-22): Routes opens with the Path tool, the others with Lasso.
  const lastStage = useRef(stage)
  useEffect(() => {
    if (lastStage.current === stage) return
    lastStage.current = stage
    if (stage === 'routes') chooseTool('highway')
    else if (tool === 'highway') chooseTool('lasso')
    // Only a change of step re-arms the tool; the user's own choice within a step stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  /** Place the armed point type at `at` — the same snap as routes: onto a route within reach (it joins).
   *  An existing point there is selected instead (and the tool goes back to Lasso). Armed from the station
   *  tray, the point takes the Sizing name, so the flows link by it. */
  const placeAt = (at: XY, px: number, shift: boolean) => {
    if (placeType === 'object') return   // objects are dragged out as boxes
    const snap = placeSnap(at, px, shift)
    if (snap.kind === 'point' && byId.has(snap.id)) { selectDrawn({ kind: 'point', id: snap.id }); return }
    const role = FLOW_POINT_TYPES.includes(placeType) ? placeRole : undefined
    const placed = (snap.kind === 'route' && placeOnSegment(layout, snap.id, snap.at, placeType, role))
      || ('spur' in snap && snap.spur ? placeWithSpur(layout, snap.at, placeType, role, snap.spur) : addPoint(layout, snap.at, placeType, role))
    setHover(null)
    setLayout(armed ? updatePoint(placed.layout, placed.id, { name: armed.name }) : placed.layout)
    setSelection({ kind: 'point', id: placed.id })
    setArmed(null)
  }

  const onPointer = ({ type, at, hit, shift, toggle, px }: CanvasPointer) => {
    if (marks) {
      if (type === 'down' && marks.length < 2) setMarks([...marks, at])
      return
    }
    if (type === 'move') {
      if (drag?.kind === 'points' && drag.ids.length === 1) {
        // One point dragged: it snaps like a route end (points, objects, lined up) — never onto its own routes.
        const p0 = byId.get(drag.ids[0])!
        const snap = snapDraw(net, { x: p0.x + at.x - drag.from.x, y: p0.y + at.y - drag.from.y }, { px, exclude: new Set(drag.ids), routes: false })
        setDrag({ ...drag, at: { x: drag.from.x + snap.at.x - p0.x, y: drag.from.y + snap.at.y - p0.y }, snap })
      } else if (drag?.kind === 'hwDraw') {
        const snap = hwSnap(at, shift, px, drag.from)
        setDrag({ ...drag, at: snap.at, snap })
      } else if (drag?.kind === 'hwEnd') {
        // An end turns about the other in 45° steps (Shift: any angle) and snaps like a path end. Never
        // onto itself or the ends moving with it: it snaps against the layout without them.
        const snap = snapDraw(drag.rest, at, { px, from: drag.pivot, lock: shift, offsetFt: pathWidthFt / 2, diag: true })
        setDrag({ ...drag, at: snap.at, snap })
      } else if (drag?.kind === 'hwGrip') {
        const lanes = Math.abs((at.x - drag.c.x) * drag.n.x + (at.y - drag.c.y) * drag.n.y) > drag.twoAt ? 2 : 1
        if (lanes !== drag.lanes) setDrag({ ...drag, lanes })
      } else if (drag?.kind === 'lasso') {
        const last = drag.pts[drag.pts.length - 1]
        if (Math.hypot(at.x - last.x, at.y - last.y) > 4 * px) setDrag({ ...drag, pts: [...drag.pts, at] })
      } else if (drag) setDrag({ ...drag, at })
      else if (tool === 'highway') setHover(hwSnap(at, shift, px, null))
      else if (tool === 'routes' && !marks) setHover(routeSnap(at, shift, px))
      else if (tool === 'points' && placeType !== 'object' && placeType !== 'rack' && !marks) setHover(placeSnap(at, px, shift))
      else if (targetMarks) {
        // Hovering a lit point (the canvas's own point radius, so a preview means a click lands)
        // previews its path along the routes.
        const hit = hitTest(layout, at, POINT_HIT_PX * px, 0)
        const id = hit?.kind === 'point' && targetMarks.get(hit.id)?.ok ? hit.id : null
        if (id !== (hoverOn?.id ?? null)) setHoverOn(id && chainFrom ? { start: chainFrom, id } : null)
      }
      return
    }
    if (type === 'up') {
      // A station chip dragged from the tray and released over the map: placed where it lands.
      if (fromTray.current && tool === 'points' && armed) { fromTray.current = false; placeAt(at, px, shift); return }
      if (drag) onRelease(drag)
      else if (tool === 'routes' && press.current && Math.hypot(at.x - press.current.x, at.y - press.current.y) > DRAG_PX * px) routeClick(at, shift, px)
      press.current = null
      setDrag(null)
      return
    }
    // A near-miss end: one click joins it to the nearest aisle's centre line.
    if (hit?.kind === 'hwJoin') {
      const join = highwayConnections(layout).loose.find(x => x.id === hit.id && x.end === hit.end)?.join
      if (join) { setLayout(moveHighwayEnds(layout, [join], join.to)); setSelection({ kind: 'highway', id: join.id }) }
      return
    }
    if (hit?.kind === 'rackEnd') { setDrag({ kind: 'rackEnd', id: hit.id, end: hit.end, at }); return }
    if (hit?.kind === 'hwGrip') {
      // Out past halfway between the one- and two-lane widths: two lanes.
      const h = layout.highways?.find(q => q.id === hit.id)
      const w = (n: 1 | 2) => (h ? suggestedWidthFt(laneKind(h, n), inputs.envelopeFt, rule) : 0)
      const r = ((h?.angleDeg ?? 0) * Math.PI) / 180
      if (h) setDrag({ kind: 'hwGrip', id: h.id, lanes: highwayLanes(h), c: { x: h.x, y: h.y }, n: { x: -Math.sin(r), y: Math.cos(r) }, twoAt: (w(1) + w(2)) / 4 })
      return
    }
    if (hit?.kind === 'dir') { stepDirection(hit.id); return }
    if (tool === 'lasso') { onSelectPress(at, hit, shift || !!toggle); return }
    if (tool === 'points') {
      if (placeType === 'object') { setDrag({ kind: 'box', from: at, at }); return }
      if (placeType === 'rack') { if (hit?.kind === 'point' && byId.has(hit.id)) { selectDrawn(hit); return } setDrag({ kind: 'rackDraw', from: at, at }); return }
      placeAt(at, px, shift)
    } else if (tool === 'highway') {
      const snap = hwSnap(at, shift, px, null)
      setDrag({ kind: 'hwDraw', from: snap.at, at: snap.at, snap, hit })
      setHover(null)
    } else if (tool === 'routes') {
      press.current = at
      routeClick(at, shift, px)
    } else if (tool === 'flows') {
      if (hit?.kind !== 'point' || hit.id === chainFrom) { setChainFrom(null); return }
      if (!targetMarks) {
        const why = flowStartRefusal(layout, hit.id)
        if (why) say(why); else setChainFrom(hit.id)
        return
      }
      const t = targetMarks.get(hit.id)
      if (!t?.ok) { say(t?.reason ?? 'Not a material flow end.'); return }
      // Always Pick → Drop, whichever end was clicked first. Shift-click keeps the start (one Pick,
      // several Drops) and the focus on the canvas; a plain click ends here and opens Moves per hour.
      addFlow(t.pick, t.drop, !shift)
      if (!shift) setChainFrom(null)
    }
  }

  /** The route badge (or D): two-way → one-way → the other way. Lanes stay as set. */
  const stepDirection = (id: string) => {
    const r = layout.segments.find(q => q.id === id)
    if (r) setLayout(updateSegment(layout, id, { dir: nextDirection(r.dir) }), `dir:${id}`)
  }
  /** D: every highway given steps its direction together. */
  const stepHighways = (ids: string[]) => setDirection(ids, h => nextDirection(h.dir))
  /** The layout as a highway drag would leave it: the highway moved whole, or one end at the pointer. */
  const draggedHighway = (d: Extract<Drag, { kind: 'highway' | 'hwEnd' }>): EditorLayout =>
    d.kind === 'highway' ? updateHighways(layout, d.ids, q => ({ x: q.x + d.at.x - d.from.x, y: q.y + d.at.y - d.from.y }))
      : moveHighwayEnds(layout, [{ id: d.id, end: d.end }, ...d.linked], d.at)

  /** Link a new flow Pick → Drop and open it with Moves per hour to fill in. It has no vehicle in Sizing;
   *  the simulation runs it as the preloaded one (runAs). */
  const addFlow = (from: string, to: string, focusRate = true) => {
    const blank: ProjectFlow = { id: newFlowId(), origin: '', destination: '', distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0 }
    const flow = linkFlow(layout, blank, from, to)
    setFlows([...flows, flow])
    setSelection({ kind: 'flow', id: flow.id })
    setJustAdded(focusRate ? flow.id : null)
    onStage('points')
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
    } else if (selection.kind === 'highway' || selection.kind === 'highways') {
      setLayout(removeHighways(layout, selectedHighways))
    } else {
      setFlows(flows.map(f => (f.id === selection.id ? unlinked(f) : f)))
    }
    setSelection(null)
  }

  /** Move the selected points or object by an arrow key — one undo step per run of nudges. */
  const nudge = ([dx, dy]: [number, number], times: number) => {
    const d = { x: dx * NUDGE_FT * times, y: dy * NUDGE_FT * times }
    if (selectedPoints.length) { setLayout(movePoints(layout, selectedPoints, d), `nudge:${selectedPoints.join()}`); return true }
    const o = selection?.kind === 'object' ? layout.objects?.find(q => q.id === selection.id) : undefined
    if (o) { setLayout(updateObject(layout, o.id, { x: o.x + d.x, y: o.y + d.y }), `nudge:${o.id}`); return true }
    if (selectedHighways.length) { setLayout(updateHighways(layout, selectedHighways, h => ({ x: h.x + d.x, y: h.y + d.y })), `nudge:${selectedHighways.join()}`); return true }
    return false
  }

  /** Validation: a check's fix button picks the tool that fixes it. */
  const onFix = (c: ReadinessCheck) => {
    const a = fixAction(c)
    if (!a) return
    if ('stage' in a) { onStage(a.stage); if ('arm' in a) armType(a.arm); return }
    chooseTool(a.tool)                      // cancels any chain — so the route's start is set after it
    if (a.startFrom && byId.has(a.startFrom)) { locate({ kind: 'point', id: a.startFrom }); setChainFrom(a.startFrom) }
  }
  /** Validation: select what a check is about and centre on it (a flow: halfway between its ends). */
  const locate = (t: NonNullable<ReadinessCheck['target']>) => {
    if (t.kind === 'point') { const p = byId.get(t.id); if (p) focusOn({ kind: 'point', id: p.id }, p); return }
    const f = flows.find(q => q.id === t.id), a = byId.get(f?.fromPointId ?? ''), b = byId.get(f?.toPointId ?? '')
    if (f && a && b) focusOn({ kind: 'flow', id: f.id }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }
  /** Arm the Place tool with a Sizing name (its type and role), or with a bare type (a charger, parking, a new stand). */
  const arm = (a: Armed) => { setTool('points'); setChainFrom(null); setMarks(null); setPlaceType(a.type); setPlaceRole(a.role); setArmed(a) }
  const armType = (t: SimPointType) => { setTool('points'); setChainFrom(null); setMarks(null); setPlaceType(t); setArmed(null) }
  const place = useMemo(() => placeProgress(layout, flows), [layout, flows])

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
    // Space pans — unless a control has focus, where Space presses it.
    if (k === ' ' && !target?.closest('button, input, select, summary, [role="radio"], [role="button"]')) { e.preventDefault(); if (!e.repeat) setSpaceHeld(true); return }
    if (k === 'd' && selection?.kind === 'segment') { stepDirection(selection.id); return }
    if (k === 'd' && selectedHighways.length) { stepHighways(selectedHighways); return }
    const arrow = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, [number, number]>)[k]
    if (arrow && !target?.closest('button, summary, [role="radio"]')) { if (nudge(arrow, e.shiftKey ? 10 : 1)) e.preventDefault(); return }
    // Tab steps through the stations — only once the canvas has focus (a click on it), so Tab from
    // the page still moves through its controls.
    if (e.key === 'Tab' && target?.classList.contains('sim-stage')) {
      const stations = layout.points.filter(p => p.type !== 'junction')
      if (!stations.length) return
      e.preventDefault()
      const at = stations.findIndex(p => p.id === (selection?.kind === 'point' ? selection.id : ''))
      const len = stations.length
      const next = stations[at < 0 ? (e.shiftKey ? len - 1 : 0) : (at + (e.shiftKey ? len - 1 : 1)) % len]
      focusOn({ kind: 'point', id: next.id }, next)
      return
    }
    const t = KEYS[k]
    if (t) chooseTool(t)
    else if (e.key === 'Escape' && drag?.kind === 'lasso') setDrag(null)   // abandon the loop being drawn
    // Enter: finish what is half-drawn, else back to Lasso keeping the selection; Esc also clears it.
    else if (e.key === 'Escape' || e.key === 'Enter') {
      if (chainFrom || marks) cancel()
      else { chooseTool('lasso'); setHover(null); if (e.key === 'Escape') setSelection(null) }
    }
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
    : tool === 'flows' && chainFrom ? `Click a lit ${targets?.end ?? 'point'} to link · Shift-click to link several · Esc or a click on the start to stop`
    : tool === 'routes' && chainFrom ? 'Click where the + is to continue · it joins points and routes it touches · Shift keeps it straight · right-click or Enter to finish'
    : tool === 'points' && armed ? `Click on a route to place “${armed.name}”`
    : tool === 'points' && placeType === 'object' ? 'Drag out a wall, column or rack face'
    : tool === 'points' && placeType === 'rack' ? 'Drag out the rack · its long side nearest a path is served · Enter to select'
    : TOOL_DEFS[tool].hint
  const imageFt = bg && image ? { href: image, widthFt: (bg.widthPx ?? 0) * scale, heightFt: (bg.heightPx ?? 0) * scale, opacity: bg.opacity } : null
  // What the canvas shows mid-drag: moved points/objects, a bent handle, a box being dragged out.
  const shownLayout = drag?.kind === 'handle'
    ? setCurve(layout, drag.segId, drag.which === 'mid' ? { kind: 'arc', mid: drag.at }
      : (() => { const s = layout.segments.find(q => q.id === drag.segId); return s?.curve?.kind === 'bezier' ? { ...s.curve, [drag.which]: drag.at } : s?.curve })())
    : drag?.kind === 'object'
      ? updateObject(layout, drag.id, (() => { const o = layout.objects?.find(q => q.id === drag.id)!; return { x: o.x + drag.at.x - drag.from.x, y: o.y + drag.at.y - drag.from.y } })())
      : drag?.kind === 'highway' || drag?.kind === 'hwEnd'
        ? draggedHighway(drag)
        : drag?.kind === 'rackEnd'
          ? stretchedRack(drag)
        : drag?.kind === 'hwGrip'
          ? updateHighways(layout, [drag.id], h => lanePatch(h, drag.lanes))
          : layout
  /** The highway being dragged out (Highway tool). */
  const draftHighway = drag?.kind === 'hwDraw' && Math.hypot(drag.at.x - drag.from.x, drag.at.y - drag.from.y) > 0.5
    ? highwayFromEnds(drag.from, drag.at, pathWidthFt, { id: 'draft', ...PATH_KIND }) : null
  const offset = drag?.kind === 'points' ? { ids: new Set(drag.ids), d: { x: drag.at.x - drag.from.x, y: drag.at.y - drag.from.y } } : null

  // The selection bar (owner, 2026-11-16): above the selected path(s) — direction, lanes, length, delete.
  const selHw = drag ? [] : (layout.highways ?? []).filter(h => selectedHighways.includes(h.id))
  /** A stored route (not a highway's derived one). */
  const byIdSeg = (id: string) => layout.segments.some(q => q.id === id)
  /** A rack dragged out from `from` to `at`: its long side nearest a path is served (null when too small). */
  function draftRackFrom(d: { from: XY; at: XY }): (SimPoint & { rack: SimRack; join?: { id: string; at: XY } }) | null {
    const near = (f: [XY, XY]) => { const m = { x: (f[0].x + f[1].x) / 2, y: (f[0].y + f[1].y) / 2 }, t = spurTarget(net, m); return t ? Math.hypot(t.at.x - m.x, t.at.y - m.y) : Infinity }
    const made = rackFromBox(d.from, d.at, near, { levels: 3, perBay: 2, face: 'short', pallet: defaultPallet })
    if (!made) return null
    // Beside a path (within an aisle's reach): the endpoint stands in it, where the vehicle stops, and
    // the face is set off by the gap — no spur. Further away it joins by a spur from its face.
    const t = spurTarget(net, made.at), gap = t ? Math.hypot(t.at.x - made.at.x, t.at.y - made.at.y) : Infinity
    return gap <= RACK_BESIDE_FT
      ? { id: 'draft', ...t!.at, type: 'rack', name: 'New rack', rack: { ...made.rack, offsetFt: gap }, join: t! }
      : { id: 'draft', ...made.at, type: 'rack', name: 'New rack', rack: made.rack }
  }
  /** The layout with a rack end dragged to `d.at` (never shorter than one bay). */
  function stretchedRack(d: { id: string; end: 'a' | 'b'; at: XY }): EditorLayout {
    const p = byId.get(d.id), g = p && rackGeometry(p, loads)
    return p ? { ...layout, points: layout.points.map(q => (q.id === d.id ? stretchRack(q, d.end, d.at, Math.max(2, (g?.bayIn ?? 0) / 12)) : q)) } : layout
  }
  const draftRack = drag?.kind === 'rackDraw' ? draftRackFrom(drag) : null
  const measure = drag?.kind === 'rackDraw' && draftRack ? { at: drag.at, text: rackLabel(draftRack, loads) }
    : drag?.kind === 'rackEnd' ? (() => { const q = shownLayout.points.find(x => x.id === drag.id); return q ? { at: drag.at, text: rackLabel(q, loads) } : null })() : null
  // The rack bar: above a selected rack — its pallet, face, sizes, total and what is wrong.
  const selRack = !drag && selection?.kind === 'point' ? layout.points.find(q => q.id === selection.id && q.rack) : undefined
  const selRackGeo = selRack ? rackGeometry(selRack, loads) : null
  // The last run's day at each charger — only while the layout and flows still match that run (its key).
  const lastRun = project.simSettings?.lastRun
  const chargerRun = useMemo(() => {
    if (!lastRun?.chargers) return null
    return lastRun.key === simInputsKey(project, new Map(vehicles.map(v => [v.id, v]))) ? lastRun.chargers : null
  }, [lastRun, project, vehicles])
  // The lowest reach among the vehicles that work it (its flows), else the simulation's vehicles.
  const selRackReach = selRack ? (() => {
    const users = simFlows.filter(f => f.fromPointId === selRack.id || f.toPointId === selRack.id).map(f => f.vehicleId && simVehicleById.get(f.vehicleId))
    const pool = (users.length ? users : vehicleTypes).filter((v): v is Vehicle => !!v && v.calc.maxLiftHeightFt != null)
    const low = pool.reduce<Vehicle | null>((m, v) => (!m || v.calc.maxLiftHeightFt! < m.calc.maxLiftHeightFt! ? v : m), null)
    return low ? { name: low.name, ft: low.calc.maxLiftHeightFt! } : null
  })() : null
  const rackBar = selRack && selRackGeo ? (() => {
    const setRack = (patch: Partial<SimRack>) => setLayout(updatePoint(layout, selRack.id, { rack: { ...selRack.rack!, ...patch } }), `rack:${selRack.id}:${Object.keys(patch).join()}`)
    return {
      at: { x: (Math.min(...selRackGeo.corners.map(c => c.x)) + Math.max(...selRackGeo.corners.map(c => c.x))) / 2, y: Math.min(...selRackGeo.corners.map(c => c.y)) },
      node: <RackBar p={selRack} g={selRackGeo} loads={loads} reach={selRackReach}
        onRack={setRack} onFlip={() => setLayout(updatePoint(layout, selRack.id, flipRack(selRack)))}
        onTotal={total => { const len = rackLengthFor(selRack, loads, total); if (len) setLayout(updatePoint(layout, selRack.id, stretchRack(selRack, 'b', (() => { const r = selRack.rack!, a = (r.angleDeg * Math.PI) / 180; return { x: selRack.x - Math.cos(a) * r.lengthFt / 2 + Math.cos(a) * len, y: selRack.y - Math.sin(a) * r.lengthFt / 2 + Math.sin(a) * len } })(), 0))) }}
        onDelete={deleteSelection} />,
    }
  })() : null
  const selBar = selHw.length ? (() => {
    const cs = selHw.flatMap(highwayCorners), xs = cs.map(q => q.x), ys = cs.map(q => q.y), ids = selHw.map(h => h.id)
    return {
      at: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) },
      node: <PathBar paths={selHw} fmtLen={ft => fmtLength(ft, unitSystem, 0)} onDirection={dir => setDirection(ids, () => dir)} onLanes={n => setLanes(ids, n)} onDelete={deleteSelection} />,
    }
  })() : null

  // Side panel: Layout's folded cards, with a status word each; the drawing card is Setup's.
  const drawingCard = (
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
        onOpacity={opacity => bg && setLayout({ ...layout, background: { ...bg, opacity } }, 'bg-opacity')}
        extentsFt={bg?.scale && bg.widthPx && bg.heightPx ? { w: bg.widthPx * scale, h: bg.heightPx * scale } : null}
      />
  )

  // Setup's drawing — shown wherever scaling is under way, so the typed length always has its card.
  const drawingSection = (
    <Section title="Drawing" open status={bg ? drawingStatus(bg) : 'Optional'} tone={bg && !bg.scale ? 'warn' : undefined}>{drawingCard}{examples}</Section>
  )

  // The flows drawn on the map: all of them, or those of the selected station(s) or flow.
  const focus = selection?.kind === 'point' ? [selection.id] : selection?.kind === 'points' ? selection.ids : []
  const flowsShown = showFlows ? flows
    : flows.filter(f => (selection?.kind === 'flow' && f.id === selection.id) || focus.includes(f.fromPointId ?? '') || focus.includes(f.toPointId ?? ''))

  return (
    <div className="sim-editor">
      <div className="sim-work">
        <div className="sim-canvas-wrap">
          <LayoutCanvas
            layout={shownLayout}
            driven={drag ? withHighways(shownLayout) : driven}
            flows={flowsShown}
            image={imageFt}
            highwayStatus={highwayStatus}
            selection={selection}
            notConnected={loose}
            showFlows
            clearances={clearances}
            panOnEmpty={false}
            panAlways={tool === 'hand' || spaceHeld}
            fmtLen={ft => fmtLength(ft, unitSystem, 1)}
            rubberFrom={drag?.kind === 'hwDraw' ? drag.from : drag?.kind === 'hwEnd' ? drag.pivot : chainFrom ? byId.get(chainFrom) ?? null : null}
            box={drag?.kind === 'box' ? { a: drag.from, b: drag.at } : null}
            lasso={drag?.kind === 'lasso' ? drag.pts : null}
            marks={marks ?? []}
            offset={offset}
            onPointer={onPointer}
            onFlowClick={id => { if (tool === 'lasso' || tool === 'flows') setSelection({ kind: 'flow', id }) }}
            fitKey={fitKey}
            centerOn={center}
            emptyPrompt={tool === 'lasso' ? emptyPrompt : undefined}
            aim={tool !== 'lasso' && tool !== 'hand'}
            onContextMenu={e => { if (chainFrom || marks) { e.preventDefault(); cancel() } }}
            snap={spaceHeld ? null : drag?.kind === 'points' || drag?.kind === 'hwDraw' || drag?.kind === 'hwEnd' ? drag.snap ?? null : (tool === 'routes' || tool === 'highway' || (tool === 'points' && placeType !== 'object' && placeType !== 'rack')) && !marks ? hover : null}
            onLeave={() => { setHover(null); setHoverOn(null) }}
            showLegend={showClearance || selection?.kind === 'segment'}
            laneWidths={inputs.laneWidths}
            overridden={overridden}
            onDoubleClick={() => { if (tool === 'routes') cancel() }}
            draftHighway={draftHighway}
            pathEnds={marks ? undefined : tool === 'lasso' ? 'grab' : tool === 'highway' ? 'connect' : undefined}
            selectionBar={selBar ?? rackBar}
            loads={loads}
            draftRack={draftRack}
            measure={measure}
            flowTargets={targetMarks}
            flowPreview={preview}
            viewControls={<>
              <button type="button" className={showFlows ? 'on' : ''} aria-pressed={showFlows} onClick={() => setShowFlows(v => !v)} title="Show every material flow (otherwise only the selected station’s)">Material flows</button>
              <button type="button" className={showClearance ? 'on' : ''} aria-pressed={showClearance} onClick={() => setShowClearance(v => !v)} title="B56.5 clearance overlay">B56.5</button>
              <i className="sim-zoomctl-sep" aria-hidden />
            </>}
          >
            {/* Floating tool bar (proof-of-concept look): tools, then undo/redo. */}
            <div className="sim-tools" role="toolbar" aria-label="Layout tools" onPointerDown={e => e.stopPropagation()}>
              {BAR.map(t => (
                <button key={t.id} type="button" className={`sim-tool${tool === t.id && !marks ? ' on' : ''}`} aria-pressed={tool === t.id}
                  title={`${t.label} (${t.key}) — ${TOOL_DEFS[t.id].hint}`} aria-label={t.label} onClick={() => chooseTool(t.id)}>
                  <ToolIcon d={t.icon} />
                </button>
              ))}
              <div className="sim-tool-sep" />
              <button type="button" className="sim-tool" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)" aria-label="Undo"><ToolIcon d={UNDO_ICON} /></button>
              <button type="button" className="sim-tool" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo"><ToolIcon d={REDO_ICON} /></button>
            </div>
            {stage === 'points' && !marks && (
              <StationTray unplaced={place.unplaced} armed={armed} onPick={a => {
                arm(a)
                fromTray.current = true
                // The drag ends with the next release, wherever it is (capture: before the tray or the map can
                // stop it), just after the map has used it. Released anywhere but the map, the station stays
                // armed — the next click on the map places it.
                window.addEventListener('pointerup', () => window.setTimeout(() => { fromTray.current = false }), { once: true, capture: true })
              }} />
            )}
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
            {message && <p className="sim-toast" role="status">{message}</p>}
          </LayoutCanvas>
          <p className="sim-status" aria-live="polite">{hint}</p>
        </div>
        <div className="sim-side">
          {/* Two cards (owner, 2026-11-22): the checklist with its one Next, then the step's detail. */}
          <div className="sim-guide-card">{guide.list}{guide.next}</div>
          <div className="sim-side-body sim-detail-card">
            {banner}
            {stage !== 'layout' && marks && drawingSection}
            {stage === 'layout' ? (
              // Layout's three sub-tasks: the drawing and its scale, the vehicle types, the payloads.
              <>
                {drawingSection}
                <Section title="Vehicle types" open>{vehiclesStep}</Section>
                <Section title="Payloads" open>
                  <SetupCard projectId={project.id} loads={loads} unitSystem={unitSystem} confirmed={project.simSettings?.payloadsConfirmed === payloadsKey(loads)}
                    onConfirm={() => patchSimSettings(project.id, { payloadsConfirmed: payloadsKey(loads) })} />
                </Section>
              </>
            ) : stage === 'flows' ? (
              <>
                <ValidationList checks={checks} status={status} onLocate={locate} onDetails={t => { locate(t); onStage('points') }} onFix={onFix} />
                <Section title={`Material flows on the layout · ${linked.length} of ${flows.length}`} open>
                  <FlowsList
                    layout={layout}
                    flows={flows}
                    simVehicleOf={simVehicleOf}
                    vehicleById={vehicleById}
                    settings={settings}
                    fleet={fleet}
                    unitSystem={unitSystem}
                    radiusFor={radiusFor}
                    onFlows={setFlows}
                    selectedId={selection?.kind === 'flow' ? selection.id : undefined}
                    onSelect={id => { setTool('lasso'); setSelection({ kind: 'flow', id }) }}
                    onLinkOnMap={() => chooseTool('flows')}
                    loads={loads}
                  />
                </Section>
              </>
            ) : stage === 'chargers' && !selection ? (
              <ChargersCard layout={layout} suggested={suggestedChargers} needed={vehiclesPlaced} onArmHome={armType} />
            ) : (
              <>
                <LayoutPanel
                  key={selection ? ('id' in selection ? selection.id : selection.ids.join()) : ''}
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
                  onHighways={(ids, patch, what) => setLayout(updateHighways(layout, ids, h => ('lane' in patch(h) ? withLaneWidth(h, patch(h)) : patch(h))), `highways:${ids.join()}:${what}`)}
                  onHighway={(id, patch) => setLayout(updateHighways(layout, [id], h => ('lane' in patch ? withLaneWidth(h, patch) : patch)), `highway:${id}:${Object.keys(patch).join()}`)}
                  envelopeFt={inputs.envelopeFt}
                  highwayStatus={highwayStatus}
                  simVehicleOf={simVehicleOf}
                  vehicleTypes={vehicleTypes}
                  onFlowVehicle={onFlowVehicle}
                  onRepeat={(id, count, stepFt, dir) => {
                    const made = repeatPoint(layout, id, count, stepFt, dir)
                    setLayout(made.layout)
                    setSelection({ kind: 'points', ids: made.ids })
                  }}
                  onCopy={() => { clipboard.current = selectedPoints; paste() }}
                  onFlow={(id, patch) => setFlows(flows.map(f => (f.id === id ? { ...f, ...patch } : f)), `flow:${id}:${Object.keys(patch).join()}`)}
                  onUnlink={flowId => setFlows(flows.map(f => (f.id === flowId ? unlinked(f) : f)))}
                  onDelete={deleteSelection}
                  onFocus={focusOn}
                  onAddFlow={addFlow}
                  focusRateOf={justAdded}
                  onRateFocused={() => setJustAdded(null)}
                  onBack={() => setSelection(null)}
                  backLabel={stage === 'routes' ? 'Routes' : stage === 'chargers' ? 'Chargers' : 'Pick and drop points'}
                  onSelectFlow={id => setSelection({ kind: 'flow', id })}
                  rack={selRack && selRackGeo ? { id: selRack.id, g: selRackGeo, reach: selRackReach } : null}
                  onAddPoint={() => { onStage('points'); armType('stand') }}
                  chargers={{ suggested: suggestedChargers, stats: chargerRun }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
