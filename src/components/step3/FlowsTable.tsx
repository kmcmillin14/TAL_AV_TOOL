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
    turns: 0,
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
  const liftLabel = metric ? 'Lift (m)' : 'Lift (ft)'

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
                <tr>
                  <th className="flow-th-num">#</th>
                  <th>Vehicle</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th className="flow-th-num">{distLabel}</th>
                  <th className="flow-th-num">Thru/hr</th>
                  <th className="flow-th-num">Turns</th>
                  <th className="flow-th-num">{liftLabel}</th>
                  <th className="flow-th-num">Cycle</th>
                  <th className="flow-th-num" title="Fractional raw demand: thru × cycle / 3600">Raw veh</th>
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
