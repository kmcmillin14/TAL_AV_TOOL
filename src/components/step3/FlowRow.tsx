'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import VehicleSelect, { VehicleDot } from './VehicleSelect'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
}

const FT_PER_M = 3.28084
const LBS_PER_KG = 2.20462

function fmtCycle(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function clampNum(input: string, min = 0): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return min
  return Math.max(min, n)
}

export default function FlowRow({
  index,
  flow,
  vehicles,
  derived,
  unitSystem,
  onChange,
  onDelete,
}: Props) {
  const metric = unitSystem === 'metric'

  const distDisplay = metric
    ? (flow.distanceFt / FT_PER_M).toFixed(0)
    : flow.distanceFt.toString()
  const liftDisplay = metric
    ? (flow.liftHeightFt / FT_PER_M).toFixed(1)
    : flow.liftHeightFt.toString()

  const setDistance = (input: string) => {
    const n = clampNum(input)
    onChange({ ...flow, distanceFt: metric ? n * FT_PER_M : n })
  }
  const setLift = (input: string) => {
    const n = clampNum(input)
    onChange({ ...flow, liftHeightFt: metric ? n * FT_PER_M : n })
  }

  const selectedVehicle = flow.vehicleId
    ? vehicles.find(v => v.id === flow.vehicleId)
    : undefined

  const rawDisplay =
    derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(3)
  const rawTone =
    derived.rawVehicles == null
      ? ''
      : derived.rawVehicles >= 1
      ? 'flow-cell-warn'
      : ''

  return (
    <tr className="flow-row">
      <td className="flow-row-num mono">{String(index + 1).padStart(2, '0')}</td>

      <td className="flow-cell-wrap">
        <input
          className="flow-cell"
          value={flow.origin}
          onChange={e => onChange({ ...flow, origin: e.target.value })}
          placeholder="e.g. Dock A"
        />
      </td>
      <td className="flow-cell-wrap">
        <input
          className="flow-cell"
          value={flow.destination}
          onChange={e => onChange({ ...flow, destination: e.target.value })}
          placeholder="e.g. Storage 1"
        />
      </td>

      <td className="flow-cell-wrap">
        <input
          className="flow-cell mono"
          type="number"
          min="0"
          inputMode="decimal"
          value={distDisplay}
          onChange={e => setDistance(e.target.value)}
        />
      </td>
      <td className="flow-cell-wrap">
        <input
          className="flow-cell mono"
          type="number"
          min="0"
          inputMode="decimal"
          value={flow.thruPerHr}
          onChange={e =>
            onChange({ ...flow, thruPerHr: clampNum(e.target.value) })
          }
        />
      </td>
      <td className="flow-cell-wrap">
        <input
          className="flow-cell mono"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={flow.turns}
          onChange={e =>
            onChange({
              ...flow,
              turns: Math.floor(clampNum(e.target.value)),
            })
          }
        />
      </td>
      <td className="flow-cell-wrap">
        <input
          className="flow-cell mono"
          type="number"
          min="0"
          inputMode="decimal"
          value={liftDisplay}
          onChange={e => setLift(e.target.value)}
        />
      </td>

      <td className="flow-veh-cell">
        <VehicleDot vehicleId={flow.vehicleId} />
        <VehicleSelect
          vehicles={vehicles}
          value={flow.vehicleId}
          onChange={vid => onChange({ ...flow, vehicleId: vid })}
        />
      </td>

      <td className="flow-calc mono">{fmtCycle(derived.cycleSeconds)}</td>
      <td className={`flow-calc mono ${rawTone}`}>{rawDisplay}</td>

      <td className="flow-row-act">
        <button
          type="button"
          className="flow-delete"
          onClick={onDelete}
          aria-label="Delete flow"
          title="Delete flow"
        >
          ×
        </button>
      </td>
    </tr>
  )
}
