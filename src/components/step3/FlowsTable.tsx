'use client'

import { Fragment, useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow from './FlowRow'
import GroupHeader from './GroupHeader'
import { sectionColor } from './sectionColor'

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
  const usedSections = dedupe(flows.map(f => f.sectionName ?? '').filter(Boolean))
  const effectiveGroups = dedupe([...flowGroups, ...usedSections])
  const hasGroups = effectiveGroups.length > 0

  const ungrouped = flows.filter(f => !f.sectionName || !effectiveGroups.includes(f.sectionName))

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
              {effectiveGroups.length} {effectiveGroups.length === 1 ? 'group' : 'groups'}
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
          <p>Click <strong>+ Flow</strong> to model an origin → destination route, or <strong>+ Group</strong> to set up a zone first. Cycle time and demand recompute as you type.</p>
        </div>
      ) : (
        <div className="flows-scroll">
          <table className="flows-table flows-table-banded">
            <colgroup>
              <col style={{ width: '58px' }} />
              <col style={{ width: '188px' }} />
              <col style={{ width: '205px' }} />
              <col style={{ width: '175px' }} />
              <col style={{ width: '118px' }} />
              <col style={{ width: '118px' }} />
              <col style={{ width: '138px' }} />
              <col style={{ width: '128px' }} />
              <col style={{ width: '118px' }} />
              <col style={{ width: '128px' }} />
              <col style={{ width: '66px' }} />
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
                  {distLabel}
                </th>
                <th
                  className="flow-th-num"
                  title="Throughput — moves (cycles) per hour. One move = one full pick-and-place round trip."
                >
                  Throughput (Moves per Hour)
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
              {effectiveGroups.map(g => {
                const groupFlows = flows.filter(f => f.sectionName === g)
                return (
                  <Fragment key={`g-${g}`}>
                    <GroupHeader
                      name={g}
                      color={flowGroupColors[g] ?? sectionColor(g)}
                      count={groupFlows.length}
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
