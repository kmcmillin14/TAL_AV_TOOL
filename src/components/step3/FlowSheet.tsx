'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Flow, FlowDerived, RouteLayout } from '@/src/calc/types'
import { ROUTE_LAYOUT_FACTORS } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import SheetSelect, { type SheetOption } from '@/src/components/mobile/SheetSelect'
import BottomSheet from '@/src/components/mobile/BottomSheet'
import DerivTrigger from './DerivTrigger'
import { vehicleColor } from './vehicleColor'
import { cycleDerivation } from '@/src/lib/derivation'

interface Props {
  flow: Flow
  index: number
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
  onClose: () => void
}

function clampNum(input: string, min = 0): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return min
  return Math.max(min, n)
}

const LAYOUT_LABEL: Record<RouteLayout, string> = { low: 'Low — congested', medium: 'Medium — mixed', high: 'High — open' }

/**
 * Full-screen phone editor for one flow. Live Cycle/Demand pinned at the top;
 * fields grouped Route / Vehicle & transfer; vehicle + avg-speed are
 * SheetSelect pickers, transfer is a bespoke BottomSheet (method + transfer
 * time + lift height). Reads/writes the same Flow via onChange (autosave live).
 */
export default function FlowSheet({ flow, index, vehicles, derived, unitSystem, onChange, onDelete, onClose }: Props) {
  const metric = unitSystem === 'metric'
  const v = flow.vehicleId ? vehicles.find(x => x.id === flow.vehicleId) : undefined
  const methodIdx = flow.transferMethodIdx ?? 0
  const [transferOpen, setTransferOpen] = useState(false)

  const roundTripFt = flow.distanceFt * 2
  // Round both units — a metric-origin imperial value is a long float (÷0.3048).
  const distDisplay = metric ? units.distance.toMetric(roundTripFt).toFixed(0) : String(Math.round(roundTripFt * 10) / 10)
  const setDistance = (input: string) => {
    const n = clampNum(input)
    const oneWay = (metric ? units.distance.toImperial(n) : n) / 2
    onChange({ ...flow, distanceFt: oneWay })
  }

  const vehOptions: SheetOption[] = vehicles.map(vv => ({ id: vv.id, label: vv.name, dot: vehicleColor(vv.id), sub: vv.display.category }))
  const layoutOptions: SheetOption[] = (['high', 'medium', 'low'] as RouteLayout[]).map(l => ({
    id: l, label: LAYOUT_LABEL[l], sub: `${Math.round(ROUTE_LAYOUT_FACTORS[l] * 100)}% of rated cruise`,
  }))

  const active = v?.transferMethods?.[methodIdx] ?? v?.transferMethods?.[0]
  const isCustom = active?.method === 'Custom'
  const isLifting = active?.lifts === true
  const overridden = flow.transferSecOverride != null && flow.transferSecOverride > 0
  const defaultSec = isCustom ? 0 : ((active?.loadTimeSec ?? 0) + (active?.unloadTimeSec ?? 0))
  const transferSec = overridden ? flow.transferSecOverride! : defaultSec
  const liftTimeSec = derived.breakdown?.liftTimeSec ?? 0
  const transferSummary = active ? `${active.method} · ${Math.round(transferSec + (isLifting ? liftTimeSec : 0))}s${overridden ? '*' : ''}` : '—'

  const cycleTxt = derived.cycleSeconds == null ? '—' : `${Math.round(derived.cycleSeconds)}s`
  const demandTxt = derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)

  const heightValue = metric ? Number(units.distance.toMetric(flow.liftHeightFt).toFixed(1)) : Math.round(flow.liftHeightFt * 10) / 10
  const onHeight = (input: string) => {
    const n = clampNum(input)
    onChange({ ...flow, liftHeightFt: metric ? units.distance.toImperial(n) : n })
  }
  const onOverride = (input: string) => {
    if (input.trim() === '') return onChange({ ...flow, transferSecOverride: undefined })
    onChange({ ...flow, transferSecOverride: clampNum(input) })
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="m-fullsheet" role="dialog" aria-modal="true" aria-label={`Flow ${index + 1}`}>
      <div className="m-fs-head">
        <button type="button" className="m-fs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <span className="m-fs-title">Flow {String(index + 1).padStart(2, '0')}</span>
        <button type="button" className="m-fs-del" onClick={() => { onDelete(); onClose() }}>Delete</button>
      </div>

      <div className="m-outbar">
        <div className="m-outcell"><b>{cycleTxt}</b><span>Cycle</span></div>
        <div className="m-outcell m-out-accent">
          <b>{demandTxt}</b>
          <span>Demand (veh)</span>
          {derived.breakdown && v && (
            <DerivTrigger
              className="m-outcell-math"
              derivation={() => cycleDerivation(derived.breakdown!, {
                distanceFt: flow.distanceFt, thruPerHr: flow.thruPerHr,
                speedLoadedFps: v.calc.speedLoadedFps,
                speedUnloadedFps: v.calc.speedUnloadedFps ?? v.calc.speedLoadedFps,
                liftSpeedFps: v.calc.liftSpeedFps ?? null,
                rawVehicles: derived.rawVehicles,
              })}
              route={flow.origin || flow.destination ? `${flow.origin || '—'} → ${flow.destination || '—'}` : undefined}
              label="Show the fleet math for this flow"
            />
          )}
        </div>
      </div>

      <div className="m-fs-body">
        <div className="m-group">Route</div>
        <div className="m-two">
          <div className="m-field"><label className="m-field-label">Origin</label>
            <input className="m-input" value={flow.origin} placeholder="e.g. Dock A" onChange={e => onChange({ ...flow, origin: e.target.value })} /></div>
          <div className="m-field"><label className="m-field-label">Destination</label>
            <input className="m-input" value={flow.destination} placeholder="e.g. Storage 1" onChange={e => onChange({ ...flow, destination: e.target.value })} /></div>
        </div>
        <div className="m-two">
          <div className="m-field"><label className="m-field-label">{metric ? 'Distance RT (m)' : 'Distance RT (ft)'}</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" value={distDisplay} onChange={e => setDistance(e.target.value)} /></div>
          <div className="m-field"><label className="m-field-label">Moves / hr</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" value={flow.thruPerHr} onChange={e => onChange({ ...flow, thruPerHr: clampNum(e.target.value) })} /></div>
        </div>

        <div className="m-group">Vehicle &amp; transfer</div>
        <SheetSelect label="Vehicle" sheetTitle="Choose a vehicle" placeholder="Select a vehicle"
          value={flow.vehicleId} options={vehOptions}
          onChange={id => onChange({ ...flow, vehicleId: id, transferMethodIdx: 0, transferSecOverride: undefined })}
          renderValue={o => o ? (<><span className="m-dot" style={{ background: o.dot }} />{o.label}</>) : undefined}
        />
        <div className="m-field">
          <label className="m-field-label">Transfer</label>
          <button type="button" className="m-input m-pick" onClick={() => v && setTransferOpen(true)} disabled={!v}>
            <span className="m-pick-val">{transferSummary}</span>
            <span className="m-pick-chev" aria-hidden>⌄</span>
          </button>
        </div>
        <SheetSelect label="Avg. Speed" sheetTitle="Route average speed"
          value={flow.routeLayout} options={layoutOptions}
          onChange={id => onChange({ ...flow, routeLayout: id as RouteLayout })}
        />
      </div>

      <div className="m-fs-foot">
        <button type="button" className="btn primary m-fs-done" onClick={onClose}>Done</button>
      </div>

      {/* Transfer bottom sheet: method list + transfer-time override + lift height. */}
      <BottomSheet open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer">
        {(v?.transferMethods ?? []).map((m, i) => (
          <button key={`${m.method}-${i}`} type="button" className={`m-sheet-opt${i === methodIdx ? ' is-sel' : ''}`}
            onClick={() => onChange({ ...flow, transferMethodIdx: i, transferSecOverride: undefined })}>
            <span className="m-sheet-opt-main">{m.method}
              <span className="m-sheet-opt-sub">{m.method === 'Custom' ? 'engineer-defined — enter a time' : `default ${(m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)}s`}</span></span>
            {i === methodIdx && <span className="m-sheet-opt-check" aria-hidden>✓</span>}
          </button>
        ))}
        <div className="m-sheet-fields">
          <div className="m-field"><label className="m-field-label">Transfer time (s){overridden ? ' · override' : ''}</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" placeholder={String(defaultSec)}
              value={flow.transferSecOverride ?? ''} onChange={e => onOverride(e.target.value)} /></div>
          {isLifting && (
            <div className="m-field"><label className="m-field-label">Lift height ({metric ? 'm' : 'ft'})</label>
              <input className="m-input mono" type="number" min="0" inputMode="decimal" value={heightValue} onChange={e => onHeight(e.target.value)} /></div>
          )}
        </div>
      </BottomSheet>
    </div>,
    document.body,
  )
}
