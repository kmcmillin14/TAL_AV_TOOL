'use client'

import { useRef, useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import VehicleSelect, { VehicleDot } from './VehicleSelect'
import MethodSelect from './MethodSelect'
import SpeedsUsedSelect from './SpeedsUsedSelect'
import GroupSelect from './GroupSelect'
import CyclePopover from './CyclePopover'
import CycleAnatomyBar from './CycleAnatomyBar'

export interface GroupTabInfo {
  name: string
  color: string
  rowSpan: number
  /** Present for real groups; omitted for the "Ungrouped" pseudo-group. */
  onRename?: () => void
  onDelete?: () => void
}

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  groups: string[]
  /** Set only on the first row of a group; renders the rowspanning left tab. */
  groupTab: GroupTabInfo | null
  onChange: (next: Flow) => void
  onDelete: () => void
  onAssignGroup: (group: string | undefined) => void
  onCreateGroup: (name: string) => void
}

const FT_PER_M = 3.28084

function fmtCycle(sec: number | null): string {
  if (sec == null) return '—'
  return `${Math.round(sec)}s`
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
  groups,
  groupTab,
  onChange,
  onDelete,
  onAssignGroup,
  onCreateGroup,
}: Props) {
  const metric = unitSystem === 'metric'

  const roundTripFt = flow.distanceFt * 2
  const distDisplay = metric
    ? (roundTripFt / FT_PER_M).toFixed(0)
    : roundTripFt.toString()

  const setDistance = (input: string) => {
    const n = clampNum(input)
    const oneWay = (metric ? n * FT_PER_M : n) / 2
    onChange({ ...flow, distanceFt: oneWay })
  }

  const selectedVehicle = flow.vehicleId
    ? vehicles.find(v => v.id === flow.vehicleId)
    : undefined

  const [cycleOpen, setCycleOpen] = useState(false)
  const cycleTriggerRef = useRef<HTMLButtonElement>(null)
  const cycleDisabled = derived.cycleSeconds == null || derived.breakdown == null

  const rawDisplay =
    derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)
  const rawTone =
    derived.rawVehicles == null
      ? ''
      : derived.rawVehicles >= 1
      ? 'flow-cell-warn'
      : ''

  const methodIdx = flow.transferMethodIdx ?? 0

  return (
    <tr className="flow-row">
      {groupTab && (
        <td
          className="flow-group-tab"
          rowSpan={groupTab.rowSpan}
          style={{ ['--group-color' as string]: groupTab.color }}
        >
          {groupTab.onDelete && (
            <span className="flow-group-tab-controls">
              <button
                type="button"
                className="flow-group-del"
                onClick={groupTab.onDelete}
                aria-label={`Delete group ${groupTab.name}`}
                title="Delete group"
              >
                ×
              </button>
            </span>
          )}
          {groupTab.onRename ? (
            <button
              type="button"
              className="flow-group-tab-label"
              onClick={groupTab.onRename}
              title="Rename group"
            >
              {groupTab.name}
            </button>
          ) : (
            <span className="flow-group-tab-label flow-group-tab-label-static">
              {groupTab.name}
            </span>
          )}
        </td>
      )}

      <td className="flow-meta-cell">
        <span className="flow-row-index mono">{String(index + 1).padStart(2, '0')}</span>
        <GroupSelect
          value={flow.sectionName}
          groups={groups}
          onAssign={onAssignGroup}
          onCreateGroup={onCreateGroup}
        />
      </td>

      <td className="flow-veh-cell">
        <div className="flow-veh-inner">
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
        </div>
      </td>

      <td className="flow-method-cell">
        <MethodSelect
          vehicle={selectedVehicle}
          methodIdx={methodIdx}
          liftHeightFt={flow.liftHeightFt}
          liftTimeSec={derived.breakdown?.liftTimeSec ?? 0}
          unitSystem={unitSystem}
          onMethodChange={idx => onChange({ ...flow, transferMethodIdx: idx })}
          onLiftChange={ft => onChange({ ...flow, liftHeightFt: ft })}
        />
      </td>

      <td className="flow-route-cell">
        <SpeedsUsedSelect
          value={flow.routeLayout}
          vehicle={selectedVehicle}
          onChange={layout => onChange({ ...flow, routeLayout: layout })}
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

      <td className="flow-calc-cell flow-td-output">
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
      <td className={`flow-calc flow-td-output mono ${rawTone}`}>
        <span className="flow-count-val">{rawDisplay}</span>
        {derived.rawVehicles != null && <span className="flow-count-unit">vehicles</span>}
      </td>

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
