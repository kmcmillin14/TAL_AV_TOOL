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

/** Total seconds this transfer adds to the cycle: load + unload, plus the
 *  height-derived lift time for lifting methods. */
function addedSec(m: TransferMethod, liftTimeSec: number): number {
  return (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0) + (m.lifts ? liftTimeSec : 0)
}

function tooltip(m: TransferMethod, liftTimeSec: number): string {
  const base = `${m.method} — load ${m.loadTimeSec}s + unload ${m.unloadTimeSec}s`
  return m.lifts ? `${base} + lift ${liftTimeSec.toFixed(1)}s (height × lift speed)` : base
}

/**
 * Single-line transfer-method cell. Every row is the same height regardless
 * of whether the method lifts. The trailing `+Ns` badge shows the time this
 * transfer adds to the cycle — standard (load+unload) for fixed methods, or
 * the height-derived total for lifting methods. Lifting methods reveal a
 * compact inline height field that does NOT add a second line.
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
  if (!vehicle) return <span className="flow-method-empty">—</span>
  const methods = vehicle.transferMethods ?? []
  if (methods.length === 0) return <span className="flow-method-empty">—</span>

  const active = methods[methodIdx] ?? methods[0]
  const isLifting = active?.lifts === true
  const metric = unitSystem === 'metric'
  const total = Math.round(addedSec(active, liftTimeSec))

  const heightValue = metric
    ? Number((liftHeightFt / FT_PER_M).toFixed(1))
    : liftHeightFt
  const onHeight = (input: string) => {
    const n = Number(input)
    const safe = !Number.isFinite(n) || n < 0 ? 0 : n
    onLiftChange(metric ? safe * FT_PER_M : safe)
  }

  return (
    <div className="flow-method-line" title={tooltip(active, liftTimeSec)}>
      {methods.length === 1 ? (
        <span className="flow-method-name">{active.method}</span>
      ) : (
        <select
          className="flow-method-select"
          value={methodIdx}
          onChange={e => onMethodChange(Number(e.target.value))}
          aria-label="Transfer method"
        >
          {methods.map((m, i) => (
            <option key={`${m.method}-${i}`} value={i}>{m.method}</option>
          ))}
        </select>
      )}

      {isLifting && (
        <span className="flow-method-h">
          <input
            className="flow-method-h-input mono"
            type="number"
            min="0"
            inputMode="decimal"
            value={heightValue}
            onChange={e => onHeight(e.target.value)}
            aria-label="Lift height"
            title="Lift height — drives the per-height transfer time"
          />
          <span className="flow-method-h-unit">{metric ? 'm' : 'ft'}</span>
        </span>
      )}

      <span className="flow-method-time mono">+{total}s</span>
    </div>
  )
}
