'use client'

import { useRef, useState } from 'react'
import type { Vehicle, TransferMethod } from '@/src/lib/vehicleLibrary'
import { units } from '@/src/lib/utils/units'
import FloatingPanel from './FloatingPanel'

interface Props {
  vehicle?: Vehicle
  methodIdx: number
  liftHeightFt: number
  liftTimeSec: number
  transferSecOverride?: number
  unitSystem: 'imperial' | 'metric'
  onMethodChange: (idx: number) => void
  onLiftChange: (ft: number) => void
  onOverrideChange: (sec: number | undefined) => void
}

/** The method's declared transfer total (load + unload), before any override.
 *  'Custom' is engineer-defined: it starts at 0s and demands an input. */
function defaultSec(m: TransferMethod): number {
  if (m.method === 'Custom') return 0
  return (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)
}

function methodTooltip(m: TransferMethod, liftTimeSec: number, override?: number): string {
  const base = override != null && override > 0
    ? `${m.method} — transfer ${override}s (engineer override; vehicle default ${defaultSec(m)}s)`
    : `${m.method} — load ${m.loadTimeSec}s + unload ${m.unloadTimeSec}s`
  return m.lifts ? `${base} + lift ${liftTimeSec.toFixed(1)}s` : base
}

/**
 * Transfer-method cell. Reads uniformly as `Method +Ns` (the time it adds).
 * The `+Ns` badge is a button on every method: it opens a panel with the
 * per-flow transfer-time override (prefilled with the vehicle default) and,
 * for lifting methods, the lift-height input. An engineer override renders
 * the badge in accent with a trailing `*`.
 */
export default function MethodSelect({
  vehicle,
  methodIdx,
  liftHeightFt,
  liftTimeSec,
  transferSecOverride,
  unitSystem,
  onMethodChange,
  onLiftChange,
  onOverrideChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  if (!vehicle) return <span className="flow-method-empty">—</span>
  const methods = vehicle.transferMethods ?? []
  if (methods.length === 0) return <span className="flow-method-empty">—</span>

  const active = methods[methodIdx] ?? methods[0]
  const isLifting = active?.lifts === true
  const metric = unitSystem === 'metric'
  const overridden = transferSecOverride != null && transferSecOverride > 0
  const isCustom = active?.method === 'Custom'
  const needsInput = isCustom && !overridden
  const transferSec = overridden ? transferSecOverride! : defaultSec(active)
  const total = Math.round(transferSec + (isLifting ? liftTimeSec : 0))

  const heightValue = metric
    ? Number(units.distance.toMetric(liftHeightFt).toFixed(1))
    : Math.round(liftHeightFt * 10) / 10   // round imperial too (metric-origin float)
  const onHeight = (input: string) => {
    const n = Number(input)
    const safe = !Number.isFinite(n) || n < 0 ? 0 : n
    onLiftChange(metric ? units.distance.toImperial(safe) : safe)
  }
  const onOverride = (input: string) => {
    if (input.trim() === '') return onOverrideChange(undefined)   // cleared → vehicle default
    const n = Number(input)
    if (!Number.isFinite(n) || n < 0) return onOverrideChange(undefined)
    onOverrideChange(n)
  }

  return (
    <div className="flow-method-line">
      {methods.length === 1 ? (
        <span className="flow-method-name" title={methodTooltip(active, liftTimeSec, transferSecOverride)}>
          {active.method}
        </span>
      ) : (
        <select
          className="flow-method-select"
          value={methodIdx}
          onChange={e => onMethodChange(Number(e.target.value))}
          aria-label="Transfer method"
          title={methodTooltip(active, liftTimeSec, transferSecOverride)}
        >
          {methods.map((m, i) => (
            <option key={`${m.method}-${i}`} value={i}>{m.method}</option>
          ))}
        </select>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={`flow-method-time flow-method-time-btn mono${isLifting && liftHeightFt === 0 ? ' needs-height' : ''}${needsInput ? ' needs-input' : ''}${overridden ? ' overridden' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={needsInput ? 'Custom transfer — enter the transfer time' : overridden ? 'Transfer time overridden — click to edit' : 'Set transfer time / lift height'}
      >
        +{total}s{overridden ? '*' : ''}
      </button>
      <FloatingPanel
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        className="lift-panel"
      >
        <div className="lift-panel-head">Transfer time</div>
        <div className="lift-panel-field">
          <input
            className="lift-panel-input mono"
            type="number"
            min="0"
            inputMode="decimal"
            placeholder={String(defaultSec(active))}
            value={transferSecOverride ?? ''}
            onChange={e => onOverride(e.target.value)}
            aria-label="Transfer time override (seconds)"
            autoFocus={!isLifting}
          />
          <span className="lift-panel-unit">s</span>
        </div>
        <div className="lift-panel-note mono">
          {overridden
            ? (isCustom ? 'Engineer-defined custom transfer' : `Engineer override · vehicle default ${defaultSec(active)}s`)
            : isCustom
            ? 'Custom transfer — enter the total load + unload time'
            : `Vehicle default: load ${active.loadTimeSec}s + unload ${active.unloadTimeSec}s`}
        </div>
        {isLifting && (
          <>
            <div className="lift-panel-head lift-panel-head-2">Lift height</div>
            <div className="lift-panel-field">
              <input
                className="lift-panel-input mono"
                type="number"
                min="0"
                inputMode="decimal"
                value={heightValue}
                onChange={e => onHeight(e.target.value)}
                aria-label="Lift height"
              />
              <span className="lift-panel-unit">{metric ? 'm' : 'ft'}</span>
            </div>
            <div className="lift-panel-note mono">Adds {liftTimeSec.toFixed(1)}s to the cycle</div>
          </>
        )}
      </FloatingPanel>
    </div>
  )
}
