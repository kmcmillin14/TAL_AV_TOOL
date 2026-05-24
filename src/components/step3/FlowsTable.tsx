'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FlowRow from './FlowRow'

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

  const update = (id: string, next: Flow) =>
    onFlowsChange(flows.map(f => (f.id === id ? next : f)))
  const remove = (id: string) =>
    onFlowsChange(flows.filter(f => f.id !== id))
  const add = () => onFlowsChange([...flows, emptyFlow()])

  const distLabel = metric ? 'Distance (m)' : 'Distance (ft)'

  // Unique section names, preserving first-encountered insertion order.
  const allSections: string[] = []
  for (const f of flows) {
    if (f.sectionName && !allSections.includes(f.sectionName)) {
      allSections.push(f.sectionName)
    }
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

      {flows.length === 0 ? (
        <div className="flows-empty">
          <h3>No flows yet</h3>
          <p>Click <strong>Add Flow</strong> to model an origin → destination route. Cycle time and raw vehicle demand recompute as you type.</p>
        </div>
      ) : (
        <>
          <div className="flows-scroll">
            <table className="flows-table">
              <thead>
                <tr className="flow-zone-row">
                  <th className="flow-zone-th" colSpan={3}>What&apos;s Moving</th>
                  <th className="flow-zone-th" colSpan={3}>From → To</th>
                  <th className="flow-zone-th" colSpan={2}>How Often</th>
                  <th className="flow-zone-th" colSpan={2}>Fleet Need</th>
                  <th className="flow-zone-th"></th>
                </tr>
                <tr>
                  <th className="flow-th-num">#</th>
                  <th>Vehicle</th>
                  <th>Transfer Method</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th
                    className="flow-th-num flow-th-zone-end"
                    title="One-way distance, feet. The cycle includes the return trip — loaded out, empty back."
                  >
                    {distLabel} <span className="flow-th-suffix">· one-way</span>
                  </th>
                  <th className="flow-th-num" title="Cycles per hour. One cycle = one full round-trip pick-and-place.">Thru/hr</th>
                  <th
                    className="flow-th-num"
                    title="How the path geometry slows the vehicle vs its rated cruise speed. Low (50%): lots of turns, tight corners, blind intersections, frequent slowdowns. Med (70%): mix of straightaways and turns, typical warehouse traffic. High (90%): mostly straightaways, open lanes, few turns."
                  >
                    Route Layout
                  </th>
                  <th className="flow-th-num">Cycle</th>
                  <th
                    className="flow-th-num flow-th-zone-end"
                    title="Fractional raw demand: thru × cycle / 3600. Per-vehicle baseFleet = ⌈Σ raw⌉."
                  >
                    Raw veh
                  </th>
                  <th className="flow-th-act"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Render flows with section header rows inserted at boundaries
                  // where the previous flow's sectionName differs from this one's.
                  // Only renders headers when ANY flow has a sectionName set;
                  // otherwise the table looks identical to the pre-section state.
                  const anySectioned = flows.some(f => f.sectionName != null)
                  const rows: React.ReactNode[] = []
                  let prevSection: string | undefined = undefined
                  let sectionFlowCounts: Map<string | undefined, number> | null = null
                  if (anySectioned) {
                    sectionFlowCounts = new Map()
                    for (const f of flows) {
                      const key = f.sectionName ?? undefined
                      sectionFlowCounts.set(key, (sectionFlowCounts.get(key) ?? 0) + 1)
                    }
                  }
                  flows.forEach((f, i) => {
                    const cur = f.sectionName ?? undefined
                    if (anySectioned && (i === 0 || cur !== prevSection)) {
                      const count = sectionFlowCounts?.get(cur) ?? 0
                      const display = cur ?? 'Ungrouped'
                      rows.push(
                        <tr key={`section-${cur ?? '__none__'}-${i}`} className="flow-section-row">
                          <td colSpan={11}>
                            <div className="flow-section-head">
                              <input
                                className="flow-section-name"
                                value={cur ?? ''}
                                placeholder="Ungrouped"
                                aria-label="Section name"
                                onChange={e => {
                                  const next = e.target.value.trim() || undefined
                                  // Rename every flow currently in this section
                                  onFlowsChange(
                                    flows.map(fl =>
                                      (fl.sectionName ?? undefined) === cur
                                        ? { ...fl, sectionName: next }
                                        : fl
                                    )
                                  )
                                }}
                              />
                              <span className="flow-section-count mono">
                                {count} {count === 1 ? 'flow' : 'flows'}
                              </span>
                              <button
                                type="button"
                                className="flow-section-add"
                                onClick={() =>
                                  onFlowsChange([
                                    ...flows,
                                    { ...emptyFlow(), sectionName: cur },
                                  ])
                                }
                                title={cur ? `Add a flow to "${display}"` : 'Add an ungrouped flow'}
                              >
                                + Add to {display}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    prevSection = cur
                    rows.push(
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
                        allSections={allSections}
                        onChange={next => update(f.id, next)}
                        onDelete={() => remove(f.id)}
                      />
                    )
                  })
                  return rows
                })()}
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
