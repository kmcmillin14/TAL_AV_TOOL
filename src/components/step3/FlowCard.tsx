'use client'

import { useRef, useState, type ReactNode } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import VehicleSelect, { VehicleDot } from './VehicleSelect'
import MethodSelect from './MethodSelect'
import SpeedsUsedSelect from './SpeedsUsedSelect'
import CyclePopover from './CyclePopover'
import DerivTrigger from './DerivTrigger'
import { cycleDerivation } from '@/src/lib/derivation'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

function clampNum(input: string, min = 0): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return min
  return Math.max(min, n)
}

/**
 * Phone/tablet (≤ 700px) rendering of one flow — the fixed-width table's
 * zoom-fit is illegible at 390px, so each flow is a stacked card carrying the
 * same controls and derived outputs. Drag-reorder (HTML5 DnD is dead on touch)
 * is replaced by up/down buttons. Desktop keeps the table (FlowRow).
 */
export default function FlowCard({
  index, flow, vehicles, derived, unitSystem,
  onChange, onDelete, onDuplicate, onMoveUp, onMoveDown,
}: Props) {
  const metric = unitSystem === 'metric'
  const v = flow.vehicleId ? vehicles.find(x => x.id === flow.vehicleId) : undefined

  // Distance is stored one-way (imperial ft); the field shows round-trip in the
  // active unit — identical logic to FlowRow so the two stay consistent.
  const roundTripFt = flow.distanceFt * 2
  const distDisplay = metric ? units.distance.toMetric(roundTripFt).toFixed(0) : roundTripFt.toString()
  const setDistance = (input: string) => {
    const n = clampNum(input)
    const oneWay = (metric ? units.distance.toImperial(n) : n) / 2
    onChange({ ...flow, distanceFt: oneWay })
  }

  const [cycleOpen, setCycleOpen] = useState(false)
  const cycleRef = useRef<HTMLButtonElement>(null)
  const cycleDisabled = derived.cycleSeconds == null || derived.breakdown == null
  const rawDisplay = derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)

  const field = (label: string, node: ReactNode) => (
    <div className="fc-field"><span className="fc-label">{label}</span>{node}</div>
  )

  return (
    <div className="flow-card">
      <div className="fc-head">
        <span className="fc-index mono">{String(index + 1).padStart(2, '0')}</span>
        <input
          className="flow-cell fc-route"
          value={flow.origin}
          placeholder="Origin"
          onChange={e => onChange({ ...flow, origin: e.target.value })}
        />
        <span className="fc-arrow" aria-hidden>→</span>
        <input
          className="flow-cell fc-route"
          value={flow.destination}
          placeholder="Destination"
          onChange={e => onChange({ ...flow, destination: e.target.value })}
        />
      </div>

      <div className="fc-grid">
        {field('Vehicle', (
          <span className="fc-veh">
            <VehicleDot vehicle={v} />
            <VehicleSelect
              vehicles={vehicles}
              value={flow.vehicleId}
              onChange={vid => onChange({ ...flow, vehicleId: vid, transferMethodIdx: vid ? 0 : undefined })}
            />
          </span>
        ))}
        {field('Transfer', (
          <MethodSelect
            vehicle={v}
            methodIdx={flow.transferMethodIdx ?? 0}
            liftHeightFt={flow.liftHeightFt}
            liftTimeSec={derived.breakdown?.liftTimeSec ?? 0}
            transferSecOverride={flow.transferSecOverride}
            unitSystem={unitSystem}
            onMethodChange={i => onChange({ ...flow, transferMethodIdx: i, transferSecOverride: undefined })}
            onLiftChange={ft => onChange({ ...flow, liftHeightFt: ft })}
            onOverrideChange={sec => onChange({ ...flow, transferSecOverride: sec })}
          />
        ))}
        {field('Layout', (
          <SpeedsUsedSelect
            value={flow.routeLayout}
            vehicle={v}
            unitSystem={unitSystem}
            onChange={l => onChange({ ...flow, routeLayout: l })}
          />
        ))}
        {field(metric ? 'Distance RT (m)' : 'Distance RT (ft)', (
          <input
            className="flow-cell mono"
            type="number"
            min="0"
            inputMode="decimal"
            value={distDisplay}
            onChange={e => setDistance(e.target.value)}
          />
        ))}
        {field('Moves/hr', (
          <input
            className="flow-cell mono"
            type="number"
            min="0"
            inputMode="decimal"
            value={flow.thruPerHr}
            onChange={e => onChange({ ...flow, thruPerHr: clampNum(e.target.value) })}
          />
        ))}
      </div>

      <div className="fc-out mono">
        <button
          ref={cycleRef}
          type="button"
          className="fc-out-cell"
          disabled={cycleDisabled}
          onClick={() => setCycleOpen(o => !o)}
          aria-haspopup="dialog"
          aria-expanded={cycleOpen}
        >
          <span className="fc-out-label">Cycle</span>
          <strong>{derived.cycleSeconds == null ? '—' : `${Math.round(derived.cycleSeconds)}s`}</strong>
        </button>
        {cycleOpen && derived.breakdown && (
          <CyclePopover breakdown={derived.breakdown} triggerRef={cycleRef} onClose={() => setCycleOpen(false)} />
        )}
        <span className="fc-out-cell">
          <span className="fc-out-label">Demand</span>
          <strong>{rawDisplay}</strong>
        </span>
      </div>

      <div className="fc-actions">
        {derived.breakdown && v && (
          <DerivTrigger
            derivation={() => cycleDerivation(derived.breakdown!, {
              distanceFt: flow.distanceFt,
              thruPerHr: flow.thruPerHr,
              speedLoadedFps: v.calc.speedLoadedFps,
              speedUnloadedFps: v.calc.speedUnloadedFps ?? v.calc.speedLoadedFps,
              liftSpeedFps: v.calc.liftSpeedFps ?? null,
              rawVehicles: derived.rawVehicles,
            })}
            route={flow.origin || flow.destination ? `${flow.origin || '—'} → ${flow.destination || '—'}` : undefined}
            label="Show the fleet math for this flow"
          />
        )}
        <span className="fc-actions-spacer" />
        <button type="button" className="flow-act-btn fc-move" onClick={onMoveUp} disabled={!onMoveUp} aria-label="Move flow up">
          <Icon name="arrowL" size={16} />
        </button>
        <button type="button" className="flow-act-btn fc-move fc-move-down" onClick={onMoveDown} disabled={!onMoveDown} aria-label="Move flow down">
          <Icon name="arrowL" size={16} />
        </button>
        <button type="button" className="flow-act-btn flow-duplicate" onClick={onDuplicate} aria-label="Duplicate flow">
          <Icon name="copy" size={16} />
        </button>
        <button type="button" className="flow-act-btn flow-delete" onClick={onDelete} aria-label="Delete flow">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  )
}
