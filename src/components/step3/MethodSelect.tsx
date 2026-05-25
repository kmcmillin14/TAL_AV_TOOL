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

function impactLabel(m: TransferMethod): string {
  const total = (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)
  return m.lifts ? `+${total}s · lifts` : `+${total}s`
}

function clampNum(input: string, min = 0): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return min
  return Math.max(min, n)
}

/**
 * Per-row transfer-method cell. Combines:
 *   1. The method picker (dropdown OR static text for single-method vehicles).
 *   2. A conditional Lift (ft) sub-row that appears only when the active
 *      method has `lifts: true`. When the value is 0, the input gets a
 *      red-tinted left border and a "required" affordance — no hard block
 *      (cycle still computes; the engineer is just visibly nudged).
 *
 * Lift is shown in metric when the page is in metric mode (m) and stored
 * in imperial (ft).
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
  const liftDisplay = metric
    ? (liftHeightFt / FT_PER_M).toFixed(1)
    : liftHeightFt.toString()
  const liftUnit = metric ? 'm' : 'ft'
  const liftRequired = isLifting && liftHeightFt === 0

  const setLift = (input: string) => {
    const n = clampNum(input)
    onLiftChange(metric ? n * FT_PER_M : n)
  }

  const Picker =
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
      <div className="flow-method-picker">{Picker}</div>
      {isLifting && (
        <div className={`flow-method-lift ${liftRequired ? 'required' : ''}`}>
          <span className="flow-method-lift-label">Lift</span>
          <input
            className="flow-method-lift-input mono"
            type="number"
            min="0"
            inputMode="decimal"
            value={liftDisplay}
            onChange={e => setLift(e.target.value)}
            placeholder="0"
            aria-label="Lift height"
          />
          <span className="flow-method-lift-unit">{liftUnit}</span>
          <span className="flow-method-lift-time mono" aria-label={`Adds ${liftTimeSec.toFixed(1)} seconds`}>
            → {liftTimeSec.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  )
}
