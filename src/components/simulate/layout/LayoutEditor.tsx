'use client'

// Layout editor (spec v2 §5.1): Drawing & scale → Points (P) → Routes (R) → Flows (F), with
// Select (V) and Direction (D), undo/redo. Points first: a point can sit off every route and is
// listed "Not connected" until a route reaches it.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addPoint, addSegment, flowRefusal, flowStartRefusal, FLOW_POINT_TYPES, linkFlow, linkSuggestions, notConnected,
  placeOnSegment, removePoint, removeSegment, rescaleLayout, splitSegment, updatePoint, updateSegment, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { SimPointType, SimRole, SimSegment } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'
import type { LoadedDrawing } from '@/src/lib/drawingImport'
import { newFlowId } from '@/src/lib/ids'
import { getDrawingData, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import DrawingCard from './DrawingCard'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import LayoutCanvas, { type CanvasPointer, type Selection, type XY } from './LayoutCanvas'
import LayoutPanel, { Segmented } from './LayoutPanel'
import { useLayoutEditor, type EditorLayout, type ProjectFlow } from './useLayoutEditor'

type Tool = 'select' | 'points' | 'routes' | 'flows' | 'direction'
const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Click to edit, drag a point to move it, drag empty space to pan' },
  { id: 'points', label: 'Points', key: 'P', hint: 'Click to place; on a route, the point joins it' },
  { id: 'routes', label: 'Routes', key: 'R', hint: 'Click point to point; Esc ends the route' },
  { id: 'flows', label: 'Flows', key: 'F', hint: 'Click a Pick point, then a Drop point' },
  { id: 'direction', label: 'Direction', key: 'D', hint: 'Click a route: two-way → one-way → other way → single-lane' },
]
const PALETTE: SimPointType[] = [...FLOW_POINT_TYPES, ...VEHICLE_POINT_TYPES]
/** Direction tool order: two-way → one-way A→B → one-way B→A → single-lane two-way → two-way. */
const DIRECTION_CYCLE: Pick<SimSegment, 'dir' | 'lane'>[] = [
  { dir: 'two', lane: 'two' }, { dir: 'ab', lane: 'two' }, { dir: 'ba', lane: 'two' }, { dir: 'two', lane: 'single' },
]
/** An unscaled drawing with nothing to inherit is shown at this size until its scale is set. */
const UNSCALED_FT_PER_PX = 0.05

type Background = NonNullable<EditorLayout['background']>
const ftPerPx = (bg?: Background) => (bg?.scale
  ? bg.scale.lengthFt / Math.max(1e-9, Math.hypot(bg.scale.b.x - bg.scale.a.x, bg.scale.b.y - bg.scale.a.y))
  : bg?.unscaledFtPerPx ?? UNSCALED_FT_PER_PX)

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

/** Clear a flow's point links: it keeps its values and goes back to a typed distance in Sizing. */
const unlinked = (f: ProjectFlow): ProjectFlow => ({ ...f, fromPointId: undefined, toPointId: undefined, distanceSource: undefined })

interface Props { project: StoredProject; vehicles: Vehicle[]; unitSystem: UnitSystem; emptyPrompt?: string }

export default function LayoutEditor({ project, vehicles, unitSystem, emptyPrompt }: Props) {
  const editor = useLayoutEditor(project)
  const { doc, latest, commit, canUndo, canRedo } = editor
  const { layout, flows } = doc
  const [tool, setTool] = useState<Tool>('select')
  const [placeType, setPlaceType] = useState<SimPointType>('stand')
  const [placeRole, setPlaceRole] = useState<SimRole>('pick')
  const [selection, setSelection] = useState<Selection>(null)
  const [chainFrom, setChainFrom] = useState<string | null>(null)       // route or flow being drawn
  const [marks, setMarks] = useState<XY[] | null>(null)                 // null = not setting the scale
  const [drag, setDrag] = useState<{ id: string; from: XY; at: XY } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showFlows, setShowFlows] = useState(true)
  const [fitKey, setFitKey] = useState(0)

  const bg = layout.background
  const image = getDrawingData(project.id)
  const scale = ftPerPx(bg)
  const loose = useMemo(() => new Set(notConnected(layout).map(p => p.id)), [layout])
  const suggestions = useMemo(() => linkSuggestions(layout, flows), [layout, flows])
  const byId = useMemo(() => new Map(layout.points.map(p => [p.id, p])), [layout])

  const setLayout = (next: EditorLayout, merge?: string) => commit({ layout: next, flows }, merge)
  const setFlows = (next: ProjectFlow[], merge?: string) => commit({ layout, flows: next }, merge)
  const say = (m: string) => { setMessage(m); window.setTimeout(() => setMessage(c => (c === m ? null : c)), 3500) }
  /** Stop whatever is half-drawn: a route, a flow, the scale marks. */
  const cancel = () => { setChainFrom(null); setMarks(null) }
  const chooseTool = (t: Tool) => { setTool(t); cancel() }
  /** Undo/redo can remove what a half-drawn route or a selection points at: drop both. */
  const undo = () => { cancel(); setSelection(null); editor.undo() }
  const redo = () => { cancel(); setSelection(null); editor.redo() }

  // Where the dragged point is now (shown until the drop commits it).
  const dragged = drag && byId.get(drag.id)
  const dragAt = dragged && drag ? { x: dragged.x + drag.at.x - drag.from.x, y: dragged.y + drag.at.y - drag.from.y } : null

  /** A point id to draw from or to: the point under the pointer, a new junction on a route, or one on empty floor. */
  const anchor = (at: XY, hit: CanvasPointer['hit']): { layout: EditorLayout; id: string } => {
    if (hit?.kind === 'point') return { layout, id: hit.id }
    if (hit?.kind === 'segment') return splitSegment(layout, hit.id, at) ?? addPoint(layout, at, 'junction')
    return addPoint(layout, at, 'junction')
  }

  const onPointer = ({ type, at, hit }: CanvasPointer) => {
    if (marks) {
      if (type === 'down' && marks.length < 2) setMarks([...marks, at])
      return
    }
    if (tool === 'select') {
      if (type === 'down') {
        setSelection(hit && { kind: hit.kind, id: hit.id })
        if (hit?.kind === 'point') setDrag({ id: hit.id, from: at, at })
      } else if (type === 'move' && drag) {
        setDrag({ ...drag, at })
      } else if (type === 'up' && drag) {
        if (dragAt && (drag.at.x !== drag.from.x || drag.at.y !== drag.from.y)) setLayout(updatePoint(layout, drag.id, dragAt))
        setDrag(null)
      }
      return
    }
    if (type !== 'down') return
    if (tool === 'points') {
      if (hit?.kind === 'point') { setSelection({ kind: 'point', id: hit.id }); return }
      const role = FLOW_POINT_TYPES.includes(placeType) ? placeRole : undefined
      const placed = (hit?.kind === 'segment' && placeOnSegment(layout, hit.id, at, placeType, role)) || addPoint(layout, at, placeType, role)
      setLayout(placed.layout)
      setSelection({ kind: 'point', id: placed.id })
    } else if (tool === 'routes') {
      const end = anchor(at, hit)
      if (chainFrom && chainFrom !== end.id) setLayout(addSegment(end.layout, chainFrom, end.id).layout)
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
    if (selection.kind === 'point') {
      const gone = (f: ProjectFlow) => f.fromPointId === selection.id || f.toPointId === selection.id
      commit({ layout: removePoint(layout, selection.id), flows: flows.map(f => (gone(f) ? unlinked(f) : f)) })
    } else if (selection.kind === 'segment') {
      setLayout(removeSegment(layout, selection.id))
    } else {
      setFlows(flows.map(f => (f.id === selection.id ? unlinked(f) : f)))
    }
    setSelection(null)
  }

  // Keyboard: tools, Esc, Delete, undo/redo — captured before the header's app-level ⌘Z, which
  // steps aside (PersistentHeader checks defaultPrevented). The listener is bound once and calls
  // the latest handler through a ref.
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
    if (mod || e.altKey) return
    const t = TOOLS.find(x => x.key.toLowerCase() === k)
    if (t) chooseTool(t.id)
    else if (e.key === 'Escape') { if (chainFrom || marks) cancel(); else setSelection(null) }
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
    setMarks(null); setFitKey(k => k + 1)
  }

  const imageFt = bg && image ? { href: image, widthFt: (bg.widthPx ?? 0) * scale, heightFt: (bg.heightPx ?? 0) * scale } : null

  return (
    <div className="sim-editor">
      <div className="sim-toolbar" role="toolbar" aria-label="Layout tools">
        <div className="seg-toggle">
          {TOOLS.map(t => (
            <button key={t.id} type="button" className={`seg-btn${tool === t.id ? ' on' : ''}`} aria-pressed={tool === t.id}
              title={`${t.label} (${t.key})`} onClick={() => chooseTool(t.id)}>
              {t.label} <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        {tool === 'points' && (
          <div className="sim-palette" aria-label="Point type">
            {PALETTE.map(t => (
              <button key={t} type="button" className={`sim-palette-btn${placeType === t ? ' on' : ''}`} aria-pressed={placeType === t} onClick={() => setPlaceType(t)}>
                <Icon name={t as Exclude<SimPointType, 'junction'>} size={16} /><span>{POINT_LABEL[t]}</span>
              </button>
            ))}
            {FLOW_POINT_TYPES.includes(placeType) && <Segmented options={ROLE_OPTIONS} value={placeRole} onChange={setPlaceRole} />}
          </div>
        )}
        <div className="sim-toolbar-end">
          <label className="sim-check"><input type="checkbox" checked={showFlows} onChange={e => setShowFlows(e.target.checked)} /> Show flows</label>
          <button type="button" className="btn ghost btn-sm" onClick={() => setFitKey(k => k + 1)}>Fit</button>
          <button type="button" className="btn ghost btn-sm" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">Undo</button>
          <button type="button" className="btn ghost btn-sm" disabled={!canRedo} onClick={redo} title="Redo (⌘⇧Z)">Redo</button>
        </div>
      </div>

      <div className="sim-work">
        <div className="sim-canvas-wrap">
          <LayoutCanvas
            layout={layout}
            flows={flows}
            image={imageFt}
            selection={selection}
            notConnected={loose}
            showFlows={showFlows}
            panOnEmpty={tool === 'select' && !marks}
            rubberFrom={chainFrom ? byId.get(chainFrom) ?? null : null}
            marks={marks ?? []}
            dragging={drag && dragAt && { id: drag.id, at: dragAt }}
            onPointer={onPointer}
            onFlowClick={id => { if (tool === 'select' || tool === 'flows') setSelection({ kind: 'flow', id }) }}
            fitKey={fitKey}
            emptyPrompt={emptyPrompt}
          />
          <p className="sim-hint" aria-live="polite">{message ?? (marks ? 'Click both ends of a known dimension' : TOOLS.find(t => t.id === tool)!.hint)}</p>
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
          <LayoutPanel
            layout={layout}
            flows={flows}
            vehicles={vehicles}
            selection={selection}
            unitSystem={unitSystem}
            notConnected={loose}
            suggestions={suggestions}
            onPoint={(id, patch) => setLayout(updatePoint(layout, id, patch), `point:${id}:${Object.keys(patch).join()}`)}
            onSegment={(id, patch) => setLayout(updateSegment(layout, id, patch))}
            onFlow={(id, patch) => setFlows(flows.map(f => (f.id === id ? { ...f, ...patch } : f)), `flow:${id}:${Object.keys(patch).join()}`)}
            onLink={(flowId, from, to) => setFlows(flows.map(f => (f.id === flowId ? linkFlow(layout, f, from, to) : f)))}
            onUnlink={flowId => setFlows(flows.map(f => (f.id === flowId ? unlinked(f) : f)))}
            onDelete={deleteSelection}
            onSelect={s => { setTool('select'); setSelection(s) }}
          />
        </div>
      </div>
    </div>
  )
}
