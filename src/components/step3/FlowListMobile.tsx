'use client'

import { useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import { effectiveGroups as computeEffectiveGroups } from '@/src/calc/flowMetrics'
import { groupColorMap } from './sectionColor'
import { vehicleColor } from './vehicleColor'
import FlowSheet from './FlowSheet'

interface Props {
  flows: Flow[]
  flowGroups: string[]
  flowGroupColors: Record<string, string>
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onUpdate: (id: string, next: Flow) => void
  onDelete: (id: string) => void
  onAdd: (sectionName?: string) => Flow      // returns the created flow so we can open its sheet
}

const EMPTY: FlowDerived = { cycleSeconds: null, rawVehicles: null, breakdown: null }

/** Phone-native flows: a scannable summary list; tapping a row opens FlowSheet. */
export default function FlowListMobile({ flows, flowGroups, flowGroupColors, vehicles, derivedByFlowId, unitSystem, onUpdate, onDelete, onAdd }: Props) {
  const [editId, setEditId] = useState<string | null>(null)
  const effGroups = computeEffectiveGroups(flowGroups, flows)
  const groupColors = groupColorMap(effGroups, flowGroupColors)
  const ungrouped = flows.filter(f => !f.sectionName || !effGroups.includes(f.sectionName))
  const vName = (id?: string) => (id ? vehicles.find(v => v.id === id)?.name ?? id : 'No vehicle')
  const totalDemand = flows.reduce((s, f) => s + (derivedByFlowId.get(f.id)?.rawVehicles ?? 0), 0)

  // Sequential index across every rendered flow (groups first, then ungrouped).
  const order: string[] = [...effGroups.flatMap(g => flows.filter(f => f.sectionName === g).map(f => f.id)), ...ungrouped.map(f => f.id)]
  const indexOf = (id: string) => order.indexOf(id)

  const editing = editId ? flows.find(f => f.id === editId) : undefined

  const row = (f: Flow) => {
    const d = derivedByFlowId.get(f.id) ?? EMPTY
    return (
      <button key={f.id} type="button" className="m-row" onClick={() => setEditId(f.id)}>
        <span className="m-row-idx mono">{String(indexOf(f.id) + 1).padStart(2, '0')}</span>
        <span className="m-row-main">
          <span className="m-row-route">{f.origin || '—'} → {f.destination || '—'}</span>
          <span className="m-row-sub">
            <span className="m-dot" style={{ background: vehicleColor(f.vehicleId ?? '') }} />
            {vName(f.vehicleId)} · {f.thruPerHr}/hr
          </span>
        </span>
        <span className="m-row-dem"><b>{d.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2)}</b><span>veh</span></span>
        <span className="m-row-chev" aria-hidden>›</span>
      </button>
    )
  }

  return (
    <div className="m-flowlist">
      {effGroups.map(g => {
        const gf = flows.filter(f => f.sectionName === g)
        const gd = gf.reduce((s, f) => s + (derivedByFlowId.get(f.id)?.rawVehicles ?? 0), 0)
        return (
          <div key={`g-${g}`} className="m-listgroup">
            <div className="m-listgroup-head">
              <span className="m-dot" style={{ background: groupColors[g] }} />
              <span className="m-listgroup-name">{g}</span>
              <span className="m-listgroup-meta mono">{gf.length} · {gd.toFixed(2)} veh</span>
              <button type="button" className="btn ghost m-listgroup-add" onClick={() => setEditId(onAdd(g).id)}>
                <Icon name="plus" size={12} /> Flow
              </button>
            </div>
            {gf.map(row)}
          </div>
        )
      })}
      {ungrouped.map(row)}

      <button type="button" className="flows-add-bottom" onClick={() => setEditId(onAdd().id)}>
        <Icon name="plus" size={12} /> Add flow
      </button>

      <div className="m-listfoot">
        <span>Raw demand</span>
        <b>{Math.ceil(totalDemand)} vehicle{Math.ceil(totalDemand) === 1 ? '' : 's'}</b>
      </div>

      {editing && (
        <FlowSheet
          flow={editing}
          index={indexOf(editing.id)}
          vehicles={vehicles}
          groups={effGroups}
          derived={derivedByFlowId.get(editing.id) ?? EMPTY}
          unitSystem={unitSystem}
          onChange={next => onUpdate(editing.id, next)}
          onDelete={() => onDelete(editing.id)}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  )
}
