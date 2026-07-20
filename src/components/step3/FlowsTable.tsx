'use client'

import { Fragment, useState, useRef, useEffect, useCallback } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow from './FlowRow'
import FlowListMobile from './FlowListMobile'
import GroupHeader from './GroupHeader'
import { groupColorMap } from './sectionColor'
import { effectiveGroups as computeEffectiveGroups } from '@/src/calc/flowMetrics'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import FlowImportPanel from './FlowImportPanel'

/** Patch the parent can apply atomically — flows and/or group list together. */
export interface FlowsPatch {
  flows?: Flow[]
  flowGroups?: string[]
  flowGroupColors?: Record<string, string>
}

interface Props {
  flows: Flow[]
  flowGroups: string[]
  flowGroupColors: Record<string, string>
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onPatch: (patch: FlowsPatch) => void
}

/** Total body/header column count (kept in sync with the colgroup + headers). */
const COLS = 11

/** Header label that drops any "(parenthetical)" onto its own line at a smaller
 *  size, so columns stay narrow (e.g. "Distance" / "(Round Trip)"). */
function HeaderLabel({ text }: { text: string }) {
  const i = text.indexOf('(')
  if (i === -1) return <>{text}</>
  return (
    <>
      <span className="flow-th-main">{text.slice(0, i).trim()}</span>
      <span className="flow-th-paren">{text.slice(i).trim()}</span>
    </>
  )
}

function genId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 10)
}

function emptyFlow(sectionName?: string): Flow {
  return {
    id: genId(),
    origin: '',
    destination: '',
    distanceFt: 0,
    thruPerHr: 0,
    routeLayout: 'medium',
    liftHeightFt: 0,
    sectionName,
  }
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

export default function FlowsTable({
  flows,
  flowGroups,
  flowGroupColors,
  vehicles,
  derivedByFlowId,
  unitSystem,
  onPatch,
}: Props) {
  const metric = unitSystem === 'metric'
  const narrow = useIsNarrow()
  const [focusGroup, setFocusGroup] = useState<string | null>(null)

  // ---- Fit-to-width: scale the fixed-width table down so the whole thing
  // (incl. full AGV names) fits, instead of horizontal scroll. `zoom` keeps it
  // crisp and reflows correctly; never scales above 1.
  //
  // The natural (unzoomed) width is captured ONCE — the columns are fixed via
  // the colgroup, so it never changes. The previous code re-derived it every
  // resize as `offsetWidth / appliedScale`, a feedback loop: `offsetWidth`
  // reflecting `zoom` is browser-inconsistent, so the scale spiralled toward 0
  // and crushed the rows into unreadable lines (worse the narrower you started).
  const fitRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const naturalWidth = useRef(0)
  const [tableScale, setTableScale] = useState(1)
  useEffect(() => {
    const wrap = fitRef.current
    const table = tableRef.current
    if (!wrap || !table) return
    let raf = 0
    const fit = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Capture natural width on the first laid-out measure. Zoom is still 1
        // here: it starts at 1 and we never call setTableScale until this is
        // captured (we return early while width is 0), so the measure is clean.
        if (!naturalWidth.current) naturalWidth.current = table.offsetWidth
        const natural = naturalWidth.current
        if (!natural) return
        setTableScale(Math.min(1, wrap.clientWidth / natural))
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  // `narrow` dep: on a narrow mount the table refs are null (mobile list renders
  // instead) — the effect must re-run when the viewport widens or the observer
  // never attaches and fit-to-width silently stays off after a rotation.
  }, [narrow])

  // ---- Drag-to-reorder state ----
  const [dragId, setDragId] = useState<string | null>(null)
  const [overFlowId, setOverFlowId] = useState<string | null>(null)
  const [overAfter, setOverAfter] = useState(false)
  const [overGroup, setOverGroup] = useState<string | null>(null)

  const endDrag = () => {
    setDragId(null)
    setOverFlowId(null)
    setOverGroup(null)
  }
  const overFlow = (id: string, after: boolean) => {
    if (!dragId || id === dragId) return
    // dragover fires continuously; skip state churn unless the target changed.
    if (id === overFlowId && after === overAfter && overGroup === null) return
    setOverFlowId(id)
    setOverAfter(after)
    setOverGroup(null)
  }
  const overGroupHeader = (group: string) => {
    if (!dragId || group === overGroup) return
    setOverGroup(group)
    setOverFlowId(null)
  }
  // Drop onto a flow: move the dragged flow next to the target (before/after),
  // inheriting the target's group — so a drag across zones also re-groups.
  const dropOnFlow = (targetId: string, targetSection: string | undefined, after: boolean) => {
    if (!dragId || dragId === targetId) return endDrag()
    const dragged = flows.find(f => f.id === dragId)
    if (!dragged) return endDrag()
    const without = flows.filter(f => f.id !== dragId)
    let idx = without.findIndex(f => f.id === targetId)
    if (idx === -1) return endDrag()
    if (after) idx += 1
    const moved = { ...dragged, sectionName: targetSection }
    onPatch({ flows: [...without.slice(0, idx), moved, ...without.slice(idx)] })
    endDrag()
  }
  // Drop onto a group header: move the dragged flow into that group (first slot).
  const dropOnGroup = (group: string) => {
    if (!dragId) return endDrag()
    const dragged = flows.find(f => f.id === dragId)
    if (!dragged) return endDrag()
    const without = flows.filter(f => f.id !== dragId)
    const firstIdx = without.findIndex(f => f.sectionName === group)
    const insertAt = firstIdx === -1 ? without.length : firstIdx
    const moved = { ...dragged, sectionName: group }
    onPatch({ flows: [...without.slice(0, insertAt), moved, ...without.slice(insertAt)] })
    endDrag()
  }

  // ---- Undo-delete: stash the last deleted flow for 5 s (spec F3). New deletion replaces it. ----
  const [deleted, setDeleted] = useState<{ flow: Flow; index: number } | null>(null)
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current) }, [])

  // ---- Flow CRUD ----
  const update = (id: string, next: Flow) =>
    onPatch({ flows: flows.map(f => (f.id === id ? next : f)) })
  const remove = useCallback((id: string) => {
    const index = flows.findIndex(f => f.id === id)
    if (index === -1) return
    setDeleted({ flow: flows[index], index })
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    deleteTimer.current = setTimeout(() => setDeleted(null), 5000)
    onPatch({ flows: flows.filter(f => f.id !== id) })
  }, [flows, onPatch])
  const undoDelete = useCallback(() => {
    if (!deleted) return
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    const next = [...flows]
    next.splice(Math.min(deleted.index, next.length), 0, deleted.flow)
    onPatch({ flows: next })
    setDeleted(null)
  }, [deleted, flows, onPatch])

  // Keyboard reorder operates on the RENDERED order (groups in effGroups order,
  // then ungrouped) — the raw array can interleave groups, where an array-index
  // swap is a visual no-op. The swapped visual order covers every flow, so it
  // becomes the new flows array (normalizing storage order to match display).
  const move = useCallback((id: string, dir: -1 | 1) => {
    const groups = computeEffectiveGroups(flowGroups, flows)
    const visualOrder = [
      ...groups.flatMap(g => flows.filter(f => f.sectionName === g)),
      ...flows.filter(f => !f.sectionName || !groups.includes(f.sectionName)),
    ]
    const vIdx = visualOrder.findIndex(f => f.id === id)
    const vJ = vIdx + dir
    if (vIdx === -1 || vJ < 0 || vJ >= visualOrder.length) return
    const neighbor = visualOrder[vJ]
    const swapped = [...visualOrder]
    const [f] = swapped.splice(vIdx, 1)
    swapped.splice(vJ, 0, { ...f, sectionName: neighbor.sectionName })
    onPatch({ flows: swapped })
  }, [flows, flowGroups, onPatch])
  const addImported = (rows: import('@/src/lib/flowImport').ParsedFlowRow[]) =>
    onPatch({
      flows: [
        ...flows,
        ...rows.map(r => ({
          id: genId(),
          origin: r.origin,
          destination: r.destination,
          distanceFt: r.distanceFt,
          thruPerHr: r.thruPerHr,
          routeLayout: 'medium' as const,
          liftHeightFt: r.liftHeightFt,
        })),
      ],
    })
  // Returns the created flow so the mobile list can open its edit sheet.
  const add = (sectionName?: string): Flow => {
    const f = emptyFlow(sectionName)
    onPatch({ flows: [...flows, f] })
    return f
  }
  const duplicate = (id: string) => {
    const i = flows.findIndex(f => f.id === id)
    if (i === -1) return
    const copy = { ...flows[i], id: genId() }
    const next = [...flows]
    next.splice(i + 1, 0, copy)
    onPatch({ flows: next })
  }

  // ---- Group ops (no prompts — naming is inline in the header) ----
  const addGroup = () => {
    let n = flowGroups.length + 1
    let name = `Group ${n}`
    const existing = new Set(flowGroups)
    while (existing.has(name)) name = `Group ${++n}`
    setFocusGroup(name)
    onPatch({ flowGroups: [...flowGroups, name] })
  }
  const renameGroup = (old: string, next: string) => {
    if (!next || next === old) return
    setFocusGroup(null)
    // Carry any color override across the rename (color is keyed by group name).
    const colors = { ...flowGroupColors }
    if (colors[old] !== undefined && next !== old) {
      colors[next] = colors[old]
      delete colors[old]
    }
    onPatch({
      flowGroups: dedupe(flowGroups.map(g => (g === old ? next : g))),
      flows: flows.map(f => (f.sectionName === old ? { ...f, sectionName: next } : f)),
      flowGroupColors: colors,
    })
  }
  const deleteGroup = (name: string) => {
    const colors = { ...flowGroupColors }
    delete colors[name]
    onPatch({
      flowGroups: flowGroups.filter(g => g !== name),
      flows: flows.map(f => (f.sectionName === name ? { ...f, sectionName: undefined } : f)),
      flowGroupColors: colors,
    })
  }
  const setGroupColor = (name: string, color: string) => {
    onPatch({ flowGroupColors: { ...flowGroupColors, [name]: color } })
  }

  // Effective, ordered group list: declared groups first, then any name used
  // by a flow but not declared (legacy projects carrying only sectionName).
  // Shared with the zone summary (src/calc/flowMetrics) so they never drift.
  const effGroups = computeEffectiveGroups(flowGroups, flows)
  const groupColors = groupColorMap(effGroups, flowGroupColors)
  const hasGroups = effGroups.length > 0

  const ungrouped = flows.filter(f => !f.sectionName || !effGroups.includes(f.sectionName))

  const distLabel = metric ? 'Distance (Round Trip, m)' : 'Distance (Round Trip)'

  // Sequential row number across every rendered flow (groups first, then loose).
  let rowNum = 0
  const renderFlowRow = (f: Flow) => (
    <FlowRow
      key={f.id}
      index={rowNum++}
      flow={f}
      vehicles={vehicles}
      derived={
        derivedByFlowId.get(f.id) ?? {
          cycleSeconds: null,
          rawVehicles: null,
          breakdown: null,
        }
      }
      unitSystem={unitSystem}
      isDragging={dragId === f.id}
      isDragOver={overFlowId === f.id}
      dragOverAfter={overAfter}
      onChange={next => update(f.id, next)}
      onDelete={() => remove(f.id)}
      onDuplicate={() => duplicate(f.id)}
      onMove={dir => move(f.id, dir)}
      onDragStartFlow={() => setDragId(f.id)}
      onDragOverFlow={after => overFlow(f.id, after)}
      onDropFlow={after => dropOnFlow(f.id, f.sectionName, after)}
      onDragEndFlow={endDrag}
    />
  )

  return (
    <div className="flows-table-wrap">
      <div className="flows-table-head">
        <span className="flows-count">
          <strong>{flows.length}</strong> {flows.length === 1 ? 'flow' : 'flows'}
          {hasGroups && (
            <>
              <span className="flows-count-sep">·</span>
              {effGroups.length} {effGroups.length === 1 ? 'group' : 'groups'}
            </>
          )}
        </span>
        <div className="flows-actions">
          <button type="button" className="btn ghost" onClick={addGroup}>
            <Icon name="plus" size={13} /> Group
          </button>
        </div>
      </div>

      <FlowImportPanel onAdd={addImported} />

      {flows.length === 0 && !hasGroups ? (
        <div className="flows-empty">
          <h3>No flows yet</h3>
          <p>Click <strong>+ Add flow</strong> below to model an origin → destination route, or <strong>+ Group</strong> to set up a zone first — or add flows in Step 1&apos;s Throughput &amp; distance section; they appear here. Cycle time and demand recompute as you type. You can also paste rows from a spreadsheet with <strong>Import flows</strong> above.</p>
          <button type="button" className="flows-add-bottom" onClick={() => add()}>
            <Icon name="plus" size={12} /> Add flow
          </button>
        </div>
      ) : narrow ? (
        <FlowListMobile
          flows={flows}
          flowGroups={flowGroups}
          flowGroupColors={flowGroupColors}
          vehicles={vehicles}
          derivedByFlowId={derivedByFlowId}
          unitSystem={unitSystem}
          onUpdate={update}
          onDelete={remove}
          onAdd={add}
        />
      ) : (
        <div className="flows-scroll" ref={fitRef}>
          <table
            className="flows-table flows-table-banded"
            ref={tableRef}
            style={{ zoom: tableScale }}
          >
            {/* Column widths, in order: #, Vehicle (wide for full AGV name),
                Transfer Type, Route Avg Speed, Origin, Destination, Distance,
                Throughput, Cycle Time, Vehicle Count, actions. No inline
                comments — whitespace text nodes are illegal inside <colgroup>. */}
            <colgroup>
              <col style={{ width: '52px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '170px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '108px' }} />
              <col style={{ width: '108px' }} />
              <col style={{ width: '96px' }} />
              <col style={{ width: '96px' }} />
              <col style={{ width: '96px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '88px' }} />
            </colgroup>
            <thead>
              <tr className="flow-band-row">
                <th className="flow-band-blank"></th>
                <th className="flow-band" colSpan={2}>Vehicle</th>
                <th className="flow-band" colSpan={5}>Route Input</th>
                <th className="flow-band flow-band-output" colSpan={2}>Output</th>
                <th className="flow-band-blank"></th>
              </tr>
              <tr>
                <th className="flow-th-num flow-th-meta">#</th>
                <th>Vehicle</th>
                <th>Transfer</th>
                <th title="Route layout sets the route-average speed as a fraction of rated cruise. 70% is the realistic ceiling — no route sustains full cruise once accel/decel/turns are averaged in.">
                  Avg. Speed
                </th>
                <th>Origin</th>
                <th>Destination</th>
                <th
                  className="flow-th-num"
                  title="Round-trip distance — total feet traveled per cycle (out loaded, back empty)."
                >
                  <HeaderLabel text={distLabel} />
                </th>
                <th
                  className="flow-th-num"
                  title="Throughput — moves (cycles) per hour. One move = one full pick-and-place round trip."
                >
                  <HeaderLabel text="Throughput (Moves per Hour)" />
                </th>
                <th
                  className="flow-th-num flow-th-output"
                  title="Cycle — seconds to complete one full route (load + travel out + unload + travel back + lift). Click a value for the breakdown."
                >
                  Cycle
                </th>
                <th
                  className="flow-th-num flow-th-output"
                  title="Demand — fractional vehicles: throughput × cycle / 3600. Per-vehicle base fleet = ⌈Σ demand⌉ (see summary)."
                >
                  Demand
                </th>
                <th className="flow-th-act"></th>
              </tr>
            </thead>
            <tbody>
              {effGroups.map(g => {
                const groupFlows = flows.filter(f => f.sectionName === g)
                // Total vehicle demand for the group = Σ per-flow rawVehicles.
                const groupDemand = groupFlows.reduce(
                  (s, f) => s + (derivedByFlowId.get(f.id)?.rawVehicles ?? 0),
                  0,
                )
                return (
                  <Fragment key={`g-${g}`}>
                    <GroupHeader
                      name={g}
                      color={groupColors[g]}
                      count={groupFlows.length}
                      vehicleDemand={groupDemand}
                      colSpan={COLS}
                      autoFocus={focusGroup === g}
                      isDragOver={overGroup === g}
                      onRename={next => renameGroup(g, next)}
                      onColorChange={c => setGroupColor(g, c)}
                      onAddFlow={() => add(g)}
                      onDelete={() => deleteGroup(g)}
                      onDragOverGroup={dragId ? () => overGroupHeader(g) : undefined}
                      onDropGroup={dragId ? () => dropOnGroup(g) : undefined}
                    />
                    {groupFlows.map(renderFlowRow)}
                  </Fragment>
                )
              })}
              {ungrouped.map(renderFlowRow)}
            </tbody>
          </table>

          <button type="button" className="flows-add-bottom" onClick={() => add()}>
            <Icon name="plus" size={12} /> Add flow
          </button>
        </div>
      )}

      {deleted && (
        <div className="flow-undo-toast" role="status" aria-live="polite">
          Flow deleted
          <button type="button" className="flow-undo-btn" onClick={undoDelete}>Undo</button>
        </div>
      )}
    </div>
  )
}
