'use client'

import { Fragment, useState, useRef, useEffect } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow from './FlowRow'
import GroupHeader from './GroupHeader'
import { sectionColor } from './sectionColor'
import { effectiveGroups as computeEffectiveGroups } from '@/src/calc/flowMetrics'

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
  const [focusGroup, setFocusGroup] = useState<string | null>(null)

  // ---- Fit-to-width: scale the fixed-width table down so the whole thing
  // (incl. full AGV names) fits any screen, instead of horizontal scroll.
  // `zoom` keeps it crisp and reflows correctly; never scales above 1.
  const fitRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const appliedScale = useRef(1)
  const [tableScale, setTableScale] = useState(1)
  useEffect(() => {
    const wrap = fitRef.current
    const table = tableRef.current
    if (!wrap || !table) return
    let raf = 0
    const fit = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // offsetWidth reflects the currently-applied zoom, so divide it back out
        // to recover the table's natural (unscaled) width.
        const natural = table.offsetWidth / (appliedScale.current || 1)
        if (!natural) return
        const next = Math.min(1, wrap.clientWidth / natural)
        appliedScale.current = next
        setTableScale(next)
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

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

  // ---- Flow CRUD ----
  const update = (id: string, next: Flow) =>
    onPatch({ flows: flows.map(f => (f.id === id ? next : f)) })
  const remove = (id: string) => onPatch({ flows: flows.filter(f => f.id !== id) })
  const add = (sectionName?: string) =>
    onPatch({ flows: [...flows, emptyFlow(sectionName)] })
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
          <button type="button" className="btn primary" onClick={() => add()}>
            <Icon name="plus" size={13} /> Flow
          </button>
        </div>
      </div>

      {flows.length === 0 && !hasGroups ? (
        <div className="flows-empty">
          <h3>No flows yet</h3>
          <p>Click <strong>+ Flow</strong> to model an origin → destination route, or <strong>+ Group</strong> to set up a zone first — or add flows in Step 1&apos;s Throughput &amp; distance section; they appear here. Cycle time and demand recompute as you type.</p>
        </div>
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
                <th>Transfer Type</th>
                <th title="Route-average speed as a fraction of rated cruise. 70% is the realistic ceiling — no route sustains full cruise once accel/decel/turns are averaged in.">
                  Route Average Speed
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
                  title="Cycle Time — seconds to complete one full route (load + travel out + unload + travel back + lift)."
                >
                  Cycle Time
                </th>
                <th
                  className="flow-th-num flow-th-output"
                  title="Vehicle Count — fractional demand: throughput × cycle / 3600. Per-vehicle base fleet = ⌈Σ demand⌉ (see summary)."
                >
                  Vehicle Count
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
                      color={flowGroupColors[g] ?? sectionColor(g)}
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
            <Icon name="plus" size={12} /> Add another flow
          </button>
        </div>
      )}
    </div>
  )
}
