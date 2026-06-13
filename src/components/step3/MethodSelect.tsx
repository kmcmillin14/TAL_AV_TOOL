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
  unitSystem: 'imperial' | 'metric'
  onMethodChange: (idx: number) => void
  onLiftChange: (ft: number) => void
}

/** Total seconds this transfer adds to the cycle: load + unload, plus the
 *  height-derived lift time for lifting methods. */
function addedSec(m: TransferMethod, liftTimeSec: number): number {
  return (m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0) + (m.lifts ? liftTimeSec : 0)
}

function methodTooltip(m: TransferMethod, liftTimeSec: number): string {
  const base = `${m.method} — load ${m.loadTimeSec}s + unload ${m.unloadTimeSec}s`
  return m.lifts ? `${base} + lift ${liftTimeSec.toFixed(1)}s` : base
}

/**
 * Transfer-method cell. Every method reads uniformly as `Method +Ns` (the time
 * it adds). For lifting methods the `+Ns` badge is a button: clicking it opens a
 * popover with the lift-height input, so the height is never an always-visible
 * field cluttering the row. Non-lifting methods show a static badge.
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  if (!vehicle) return <span className="flow-method-empty">—</span>
  const methods = vehicle.transferMethods ?? []
  if (methods.length === 0) return <span className="flow-method-empty">—</span>

  const active = methods[methodIdx] ?? methods[0]
  const isLifting = active?.lifts === true
  const metric = unitSystem === 'metric'
  const total = Math.round(addedSec(active, liftTimeSec))

  const heightValue = metric
    ? Number(units.distance.toMetric(liftHeightFt).toFixed(1))
    : liftHeightFt
  const onHeight = (input: string) => {
    const n = Number(input)
    const safe = !Number.isFinite(n) || n < 0 ? 0 : n
    onLiftChange(metric ? units.distance.toImperial(safe) : safe)
  }

  return (
    <div className="flow-method-line">
      {methods.length === 1 ? (
        <span className="flow-method-name" title={methodTooltip(active, liftTimeSec)}>
          {active.method}
        </span>
      ) : (
        <select
          className="flow-method-select"
          value={methodIdx}
          onChange={e => onMethodChange(Number(e.target.value))}
          aria-label="Transfer method"
          title={methodTooltip(active, liftTimeSec)}
        >
          {methods.map((m, i) => (
            <option key={`${m.method}-${i}`} value={i}>{m.method}</option>
          ))}
        </select>
      )}

      {isLifting ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`flow-method-time flow-method-time-btn mono${liftHeightFt === 0 ? ' needs-height' : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-haspopup="dialog"
            aria-expanded={open}
            title="Set lift height"
          >
            +{total}s
          </button>
          <FloatingPanel
            anchorRef={triggerRef}
            open={open}
            onClose={() => setOpen(false)}
            align="right"
            className="lift-panel"
          >
            <div className="lift-panel-head">Lift height</div>
            <div className="lift-panel-field">
              <input
                className="lift-panel-input mono"
                type="number"
                min="0"
                inputMode="decimal"
                value={heightValue}
                onChange={e => onHeight(e.target.value)}
                aria-label="Lift height"
                autoFocus
              />
              <span className="lift-panel-unit">{metric ? 'm' : 'ft'}</span>
            </div>
            <div className="lift-panel-note mono">Adds {liftTimeSec.toFixed(1)}s to the cycle</div>
          </FloatingPanel>
        </>
      ) : (
        <span className="flow-method-time mono">+{total}s</span>
      )}
    </div>
  )
}
