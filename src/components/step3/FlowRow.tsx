'use client'

import { useRef, useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import VehicleSelect, { VehicleDot } from './VehicleSelect'
import MethodSelect from './MethodSelect'
import RouteLayoutSelect from './RouteLayoutSelect'
import CyclePopover from './CyclePopover'
import CycleAnatomyBar from './CycleAnatomyBar'
import SectionPicker from './SectionPicker'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  allSections: string[]
  onChange: (next: Flow) => void
  onDelete: () => void
}

const FT_PER_M = 3.28084

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
  allSections,
  onChange,
  onDelete,
}: Props) {
  const metric = unitSystem === 'metric'

  const distDisplay = metric
    ? (flow.distanceFt / FT_PER_M).toFixed(0)
    : flow.distanceFt.toString()

  const setDistance = (input: string) => {
    const n = clampNum(input)
    onChange({ ...flow, distanceFt: metric ? n * FT_PER_M : n })
  }

  const selectedVehicle = flow.vehicleId
    ? vehicles.find(v => v.id === flow.vehicleId)
    : undefined

  const [cycleOpen, setCycleOpen] = useState(false)
  const cycleTriggerRef = useRef<HTMLButtonElement>(null)
  const cycleDisabled = derived.cycleSeconds == null || derived.breakdown == null

  const rawDisplay =
    derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(3)
  const rawTone =
    derived.rawVehicles == null
      ? ''
      : derived.rawVehicles >= 1
      ? 'flow-cell-warn'
      : ''

  const methodIdx = flow.transferMethodIdx ?? 0

  return (
    <tr className="flow-row">
      <td className="flow-row-num mono">
        <span className="flow-row-index">{String(index + 1).padStart(2, '0')}</span>
        <SectionPicker
          currentSection={flow.sectionName}
          allSections={allSections}
          onChange={next => onChange({ ...flow, sectionName: next })}
        />
      </td>

      <td className="flow-veh-cell">
        <VehicleDot vehicle={selectedVehicle} />
        <VehicleSelect
          vehicles={vehicles}
          value={flow.vehicleId}
          onChange={vid =>
            onChange({
              ...flow,
              vehicleId: vid,
              transferMethodIdx: vid ? 0 : undefined,
            })
          }
        />
      </td>

      <td className="flow-method-cell">
        <MethodSelect
          vehicle={selectedVehicle}
          methodIdx={methodIdx}
          liftHeightFt={flow.liftHeightFt}
          unitSystem={unitSystem}
          onMethodChange={idx => onChange({ ...flow, transferMethodIdx: idx })}
          onLiftChange={ft => onChange({ ...flow, liftHeightFt: ft })}
        />
      </td>

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
      <td className="flow-route-cell">
        <RouteLayoutSelect
          value={flow.routeLayout}
          onChange={layout => onChange({ ...flow, routeLayout: layout })}
        />
      </td>

      <td className="flow-calc-cell">
        <div className="flow-calc-wrap">
          <button
            ref={cycleTriggerRef}
            type="button"
            className="flow-calc-trigger mono"
            disabled={cycleDisabled}
            onClick={() => setCycleOpen(o => !o)}
            aria-haspopup="dialog"
            aria-expanded={cycleOpen}
            title={cycleDisabled ? undefined : 'Click for cycle breakdown'}
          >
            {derived.breakdown && <CycleAnatomyBar breakdown={derived.breakdown} />}
            <span className="flow-calc-value">{fmtCycle(derived.cycleSeconds)}</span>
          </button>
          {cycleOpen && derived.breakdown && (
            <CyclePopover
              breakdown={derived.breakdown}
              triggerRef={cycleTriggerRef}
              onClose={() => setCycleOpen(false)}
            />
          )}
        </div>
      </td>
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
