'use client'

import { useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow from './FlowRow'
import FlowsBulkToolbar from './FlowsBulkToolbar'

interface Props {
  flows: Flow[]
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onFlowsChange: (next: Flow[]) => void
}

function genId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 10)
}

function emptyFlow(): Flow {
  return {
    id: genId(),
    origin: '',
    destination: '',
    distanceFt: 0,
    thruPerHr: 0,
    routeLayout: 'medium',
    liftHeightFt: 0,
  }
}

export default function FlowsTable({
  flows,
  vehicles,
  derivedByFlowId,
  unitSystem,
  onFlowsChange,
}: Props) {
  const metric = unitSystem === 'metric'
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const update = (id: string, next: Flow) =>
    onFlowsChange(flows.map(f => (f.id === id ? next : f)))
  const remove = (id: string) => {
    onFlowsChange(flows.filter(f => f.id !== id))
    const next = new Set(selected)
    next.delete(id)
    setSelected(next)
  }
  const add = () => onFlowsChange([...flows, emptyFlow()])

  const distLabel = metric ? 'Distance (m)' : 'Distance (ft)'

  // Unique section names, first-encountered order.
  const allSections: string[] = []
  for (const f of flows) {
    if (f.sectionName && !allSections.includes(f.sectionName)) {
      allSections.push(f.sectionName)
    }
  }

  // Selection helpers
  const toggleRow = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const allRowIds = flows.map(f => f.id)
  const allSelected = flows.length > 0 && allRowIds.every(id => selected.has(id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allRowIds))
  }
  const clearSelection = () => setSelected(new Set())
  const bulkAssign = (sectionName: string | undefined) => {
    onFlowsChange(
      flows.map(f =>
        selected.has(f.id) ? { ...f, sectionName } : f,
      ),
    )
  }
  const bulkDelete = () => {
    onFlowsChange(flows.filter(f => !selected.has(f.id)))
    clearSelection()
  }

  return (
    <div className="flows-table-wrap">
      <div className="flows-table-head">
        <span className="flows-count">
          <strong>{flows.length}</strong> {flows.length === 1 ? 'flow' : 'flows'}
        </span>
        <button type="button" className="btn primary" onClick={add}>
          <Icon name="plus" size={13} /> Add Flow
        </button>
      </div>

      <FlowsBulkToolbar
        selectedCount={selected.size}
        existingSections={allSections}
        onAssign={bulkAssign}
        onDelete={bulkDelete}
        onClear={clearSelection}
      />

      {flows.length === 0 ? (
        <div className="flows-empty">
          <h3>No flows yet</h3>
          <p>Click <strong>Add Flow</strong> to model an origin → destination route. Cycle time and demand recompute as you type.</p>
        </div>
      ) : (
        <>
          <div className="flows-scroll">
            <table className="flows-table">
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: '36px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '32px' }} />
              </colgroup>
              <thead>
                <tr className="flow-zone-row">
                  <th className="flow-zone-th"></th>
                  <th className="flow-zone-th"></th>
                  <th className="flow-zone-th" colSpan={2}>Vehicle</th>
                  <th className="flow-zone-th" colSpan={3}>Route</th>
                  <th className="flow-zone-th" colSpan={2}>Pace</th>
                  <th className="flow-zone-th" colSpan={2}>Fleet Need</th>
                  <th className="flow-zone-th"></th>
                </tr>
                <tr>
                  <th className="flow-th-select">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all flows"
                    />
                  </th>
                  <th className="flow-th-num">#</th>
                  <th>Vehicle</th>
                  <th>Method</th>
                  <th>From</th>
                  <th>To</th>
                  <th
                    className="flow-th-num flow-th-zone-end"
                    title="One-way distance, feet. The cycle includes the return trip — loaded out, empty back."
                  >
                    {distLabel}
                  </th>
                  <th
                    className="flow-th-num"
                    title="Cycles per hour. One cycle = one full round-trip pick-and-place."
                  >
                    Per Hour
                  </th>
                  <th
                    className="flow-th-num"
                    title="Effective travel speed per route conditions. Tight aisles = 50% of rated cruise · Mixed traffic = 70% · Open straightaway = 90%."
                  >
                    Speeds
                  </th>
                  <th className="flow-th-num flow-th-output">Cycle</th>
                  <th
                    className="flow-th-num flow-th-output flow-th-zone-end"
                    title="Fractional vehicle demand: throughput × cycle / 3600. Per-vehicle base fleet = ⌈Σ demand⌉."
                  >
                    Demand
                  </th>
                  <th className="flow-th-act"></th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f, i) => (
                  <FlowRow
                    key={f.id}
                    index={i}
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
                    selected={selected.has(f.id)}
                    onToggleSelect={() => toggleRow(f.id)}
                    onChange={next => update(f.id, next)}
                    onDelete={() => remove(f.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="flows-add-bottom" onClick={add}>
            <Icon name="plus" size={12} /> Add another flow
          </button>
        </>
      )}
    </div>
  )
}
