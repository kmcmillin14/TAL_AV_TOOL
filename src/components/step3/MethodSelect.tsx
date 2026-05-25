'use client'

import type { Vehicle, TransferMethod } from '@/src/lib/vehicleLibrary'

interface Props {
  vehicle?: Vehicle
  methodIdx: number
  liftHeightFt: number
  liftTimeSec: number
  unitSystem: 'imperial' | 'metric'
  onMethodChange: (idx: number) => void
  onLiftChange: (ft: number) => void
}

const FT_PER_M = 3.28084

/** Preset lift heights in feet. Engineers pick from these in the cascade
 *  dropdown. Stored values that don't match a preset snap visually to the
 *  nearest one but the underlying stored value is left untouched until
 *  the engineer picks a new preset. */
const LIFT_PRESETS_FT: ReadonlyArray<number> = [0, 2, 4, 6, 8, 10]

function impactLabel(m: TransferMethod): string {
  const total = (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)
  return m.lifts ? `+${total}s · lifts` : `+${total}s`
}

function nearestPreset(ft: number): number {
  return LIFT_PRESETS_FT.reduce((best, cur) =>
    Math.abs(cur - ft) < Math.abs(best - ft) ? cur : best,
  LIFT_PRESETS_FT[0])
}

/**
 * Per-row transfer-method cell.
 *
 * When the active method has `lifts: true`, the cell renders TWO chained
 * dropdowns: a method picker and a Lift-height picker with preset
 * options. The inline derived `→ N.Ns` chip sits next to the height
 * dropdown so engineers see the time cost of their height choice.
 *
 * When the method doesn't lift, only the method picker renders (no
 * height dropdown, no chip).
 *
 * Single-method vehicles still render as static text instead of a
 * dropdown for the method itself.
 */
export default function MethodSelect({
  vehicle,
  methodIdx,
  liftHeightFt,
  liftTimeSec,
  unitSystem,
  onMethodChange,
  onLiftChange,
}: Props) {
  if (!vehicle) {
    return <span className="flow-method-empty">—</span>
  }
  const methods = vehicle.transferMethods ?? []
  if (methods.length === 0) {
    return <span className="flow-method-empty">—</span>
  }

  const active = methods[methodIdx] ?? methods[0]
  const isLifting = active?.lifts === true

  const metric = unitSystem === 'metric'
  const liftUnit = metric ? 'm' : 'ft'
  const liftRequired = isLifting && liftHeightFt === 0

  // Snap the displayed selection to the nearest preset for visual stability
  const displayedHeightFt = nearestPreset(liftHeightFt)

  const formatPresetLabel = (ft: number): string => {
    if (metric) {
      return `${(ft / FT_PER_M).toFixed(1)} ${liftUnit}`
    }
    return `${ft} ${liftUnit}`
  }

  const MethodPicker =
    methods.length === 1 ? (
      <span className="flow-method-static" title={impactLabel(active)}>
        {active.method}  <span className="flow-method-impact">({impactLabel(active)})</span>
      </span>
    ) : (
      <select
        className="flow-method-select"
        value={methodIdx}
        onChange={e => onMethodChange(Number(e.target.value))}
        aria-label="Transfer method"
      >
        {methods.map((m, i) => (
          <option key={`${m.method}-${i}`} value={i}>
            {m.method}  ({impactLabel(m)})
          </option>
        ))}
      </select>
    )

  return (
    <div className="flow-method-row">
      <div className="flow-method-picker">{MethodPicker}</div>
      {isLifting && (
        <div className={`flow-method-lift ${liftRequired ? 'required' : ''}`}>
          <span className="flow-method-lift-label">Lift</span>
          <select
            className="flow-method-lift-select"
            value={displayedHeightFt}
            onChange={e => onLiftChange(Number(e.target.value))}
            aria-label="Lift height"
          >
            {LIFT_PRESETS_FT.map(ft => (
              <option key={ft} value={ft}>
                {formatPresetLabel(ft)}
              </option>
            ))}
          </select>
          <span className="flow-method-lift-time mono" aria-label={`Adds ${liftTimeSec.toFixed(1)} seconds`}>
            → {liftTimeSec.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  )
}
