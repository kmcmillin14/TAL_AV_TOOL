'use client'

import type { Vehicle, TransferMethod } from '@/src/lib/vehicleLibrary'

interface Props {
  vehicle?: Vehicle
  value: number
  onChange: (idx: number) => void
}

function impactLabel(m: TransferMethod): string {
  const total = (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)
  return m.lifts ? `+${total}s · lifts` : `+${total}s`
}

/**
 * Per-row transfer-method picker, scoped to the selected vehicle's
 * `transferMethods`. Options' labels embed time impact so the cost is
 * visible before commit. Single-method vehicles render as static text
 * (the chosen method is implicit). No vehicle → em dash.
 */
export default function MethodSelect({ vehicle, value, onChange }: Props) {
  if (!vehicle) {
    return <span className="flow-method-empty">—</span>
  }
  const methods = vehicle.transferMethods ?? []
  if (methods.length === 0) {
    return <span className="flow-method-empty">—</span>
  }
  if (methods.length === 1) {
    const m = methods[0]
    return (
      <span className="flow-method-static" title={impactLabel(m)}>
        {m.method}
      </span>
    )
  }
  return (
    <select
      className="flow-method-select"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      aria-label="Transfer method"
    >
      {methods.map((m, i) => (
        <option key={`${m.method}-${i}`} value={i}>
          {m.method}  ({impactLabel(m)})
        </option>
      ))}
    </select>
  )
}

/**
 * One-line meta sentence shown under the Method cell — keeps the
 * "time per accessory" visible without forcing the popover open.
 */
export function MethodMeta({ vehicle, methodIdx }: { vehicle?: Vehicle; methodIdx: number }) {
  if (!vehicle) return null
  const m = vehicle.transferMethods?.[methodIdx]
  if (!m) return null
  const liftStr = m.lifts ? ' · lift (height-based)' : ''
  return (
    <span className="flow-method-meta">
      load {m.loadTimeSec}s · unload {m.unloadTimeSec}s{liftStr}
    </span>
  )
}
