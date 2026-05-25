'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow, { type GroupTabInfo } from './FlowRow'
import { sectionColor } from './sectionColor'

/** Patch the parent can apply atomically — flows and/or group list together. */
export interface FlowsPatch {
  flows?: Flow[]
  flowGroups?: string[]
}

interface Props {
  flows: Flow[]
  flowGroups: string[]
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onPatch: (patch: FlowsPatch) => void
}

const UNGROUPED_COLOR = 'var(--border-strong)'

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

type RenderItem =
  | { kind: 'flow'; flow: Flow; displayIndex: number; groupTab: GroupTabInfo | null }
  | { kind: 'empty'; name: string; color: string; onRename: () => void; onDelete: () => void }

export default function FlowsTable({
  flows,
  flowGroups,
  vehicles,
  derivedByFlowId,
  unitSystem,
  onPatch,
}: Props) {
  const metric = unitSystem === 'metric'

  // ---- Flow CRUD ----
  const update = (id: string, next: Flow) =>
    onPatch({ flows: flows.map(f => (f.id === id ? next : f)) })
  const remove = (id: string) => onPatch({ flows: flows.filter(f => f.id !== id) })
  const add = () => onPatch({ flows: [...flows, emptyFlow()] })
  const copyLast = () => {
    if (flows.length === 0) return
    const last = flows[flows.length - 1]
    onPatch({ flows: [...flows, { ...last, id: genId() }] })
  }

  // ---- Group ops ----
  const addGroup = () => {
    const name = window.prompt('New group name', `Group ${flowGroups.length + 1}`)?.trim()
    if (name) onPatch({ flowGroups: dedupe([...flowGroups, name]) })
  }
  const assignGroup = (id: string, group: string | undefined) =>
    onPatch({ flows: flows.map(f => (f.id === id ? { ...f, sectionName: group } : f)) })
  const createGroupAndAssign = (id: string, name: string) =>
    onPatch({
      flowGroups: dedupe([...flowGroups, name]),
      flows: flows.map(f => (f.id === id ? { ...f, sectionName: name } : f)),
    })
  const renameGroup = (old: string) => {
    const next = window.prompt('Rename group', old)?.trim()
    if (!next || next === old) return
    onPatch({
      flowGroups: dedupe(flowGroups.map(g => (g === old ? next : g))),
      flows: flows.map(f => (f.sectionName === old ? { ...f, sectionName: next } : f)),
    })
  }
  const deleteGroup = (name: string) => {
    onPatch({
      flowGroups: flowGroups.filter(g => g !== name),
      flows: flows.map(f => (f.sectionName === name ? { ...f, sectionName: undefined } : f)),
    })
  }

  // Effective, ordered group list: declared groups first, then any name used
  // by a flow but not declared (legacy projects carrying only sectionName).
  const usedSections = dedupe(flows.map(f => f.sectionName ?? '').filter(Boolean))
  const effectiveGroups = dedupe([...flowGroups, ...usedSections])

  // Build the ordered render list: each group's flows contiguous (rowspanning
  // tab on the first row), empty declared groups get a placeholder row, and
  // ungrouped flows fall into a trailing muted band.
  const items: RenderItem[] = []
  let displayIndex = 0
  for (const g of effectiveGroups) {
    const groupFlows = flows.filter(f => f.sectionName === g)
    if (groupFlows.length === 0) {
      items.push({
        kind: 'empty',
        name: g,
        color: sectionColor(g),
        onRename: () => renameGroup(g),
        onDelete: () => deleteGroup(g),
      })
      continue
    }
    groupFlows.forEach((f, i) => {
      items.push({
        kind: 'flow',
        flow: f,
        displayIndex: displayIndex++,
        groupTab: i === 0
          ? {
              name: g,
              color: sectionColor(g),
              rowSpan: groupFlows.length,
              onRename: () => renameGroup(g),
              onDelete: () => deleteGroup(g),
            }
          : null,
      })
    })
  }
  const ungrouped = flows.filter(f => !f.sectionName)
  ungrouped.forEach((f, i) => {
    items.push({
      kind: 'flow',
      flow: f,
      displayIndex: displayIndex++,
      groupTab: i === 0
        ? { name: 'Ungrouped', color: UNGROUPED_COLOR, rowSpan: ungrouped.length }
        : null,
    })
  })

  const distLabel = metric ? 'Distance (Round Trip, m)' : 'Distance (Round Trip)'

  return (
    <div className="flows-table-wrap">
      <div className="flows-table-head">
        <span className="flows-count">
          <strong>{flows.length}</strong> {flows.length === 1 ? 'flow' : 'flows'}
          {effectiveGroups.length > 0 && (
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
          <button type="button" className="btn ghost" onClick={copyLast} disabled={flows.length === 0}>
            <Icon name="copy" size={13} /> Copy Flow
          </button>
          <button type="button" className="btn primary" onClick={add}>
            <Icon name="plus" size={13} /> Flow
          </button>
        </div>
      </div>

      {flows.length === 0 && effectiveGroups.length === 0 ? (
        <div className="flows-empty">
          <h3>No flows yet</h3>
          <p>Click <strong>+ Flow</strong> to model an origin → destination route, or <strong>+ Group</strong> to set up a zone first. Cycle time and demand recompute as you type.</p>
        </div>
      ) : (
        <div className="flows-scroll">
          <table className="flows-table flows-table-banded">
            <colgroup>
              <col style={{ width: '30px' }} />
              <col style={{ width: '78px' }} />
              <col style={{ width: '190px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '185px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '40px' }} />
            </colgroup>
            <thead>
              <tr className="flow-band-row">
                <th className="flow-band-blank" colSpan={2}></th>
                <th className="flow-band" colSpan={2}>Vehicle</th>
                <th className="flow-band" colSpan={5}>Route Input</th>
                <th className="flow-band flow-band-output" colSpan={2}>Output</th>
                <th className="flow-band-blank"></th>
              </tr>
              <tr>
                <th className="flow-th-group"></th>
                <th className="flow-th-num">#</th>
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
              {items.map(item =>
                item.kind === 'empty' ? (
                  <tr className="flow-row flow-row-empty-group" key={`empty-${item.name}`}>
                    <td
                      className="flow-group-tab"
                      style={{ ['--group-color' as string]: item.color }}
                    >
                      <span className="flow-group-tab-controls">
                        <button
                          type="button"
                          className="flow-group-del"
                          onClick={item.onDelete}
                          aria-label={`Delete group ${item.name}`}
                          title="Delete group"
                        >
                          ×
                        </button>
                      </span>
                      <button
                        type="button"
                        className="flow-group-tab-label"
                        onClick={item.onRename}
                        title="Rename group"
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="flow-empty-group-cell" colSpan={11}>
                      Empty group — set a row’s group to <strong>{item.name}</strong>, or add a flow.
                    </td>
                  </tr>
                ) : (
                  <FlowRow
                    key={item.flow.id}
                    index={item.displayIndex}
                    flow={item.flow}
                    vehicles={vehicles}
                    derived={
                      derivedByFlowId.get(item.flow.id) ?? {
                        cycleSeconds: null,
                        rawVehicles: null,
                        breakdown: null,
                      }
                    }
                    unitSystem={unitSystem}
                    groups={effectiveGroups}
                    groupTab={item.groupTab}
                    onChange={next => update(item.flow.id, next)}
                    onDelete={() => remove(item.flow.id)}
                    onAssignGroup={group => assignGroup(item.flow.id, group)}
                    onCreateGroup={name => createGroupAndAssign(item.flow.id, name)}
                  />
                ),
              )}
            </tbody>
          </table>

          <button type="button" className="flows-add-bottom" onClick={add}>
            <Icon name="plus" size={12} /> Add another flow
          </button>
        </div>
      )}
    </div>
  )
}
