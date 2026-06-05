'use client'

import type { ReactNode, RefObject } from 'react'
import type { CycleBreakdown } from '@/src/calc/types'
import FloatingPanel from './FloatingPanel'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  origin: string
  destination: string
  breakdown: CycleBreakdown
  /** One-way leg distance, imperial (feet) — the value the engine used. */
  distanceFt: number
  thruPerHr: number
  speedLoadedFps: number
  speedUnloadedFps: number
  liftSpeedFps: number | null
  rawVehicles: number | null
}

const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)
const layoutLabel = (l: string) => (l === 'low' ? 'Low' : l === 'high' ? 'High' : 'Medium')

function Row({ label, symbol, sub, result, emphasis, muted }: {
  label: string
  symbol: string
  sub?: ReactNode
  result: string
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <div className={`deriv-row${emphasis ? ' emphasis' : ''}${muted ? ' muted' : ''}`}>
      <div className="deriv-formula">
        <span className="deriv-label">{label}</span>
        <span className="deriv-symbol">{symbol}</span>
        {sub != null && <span className="deriv-sub">{sub}</span>}
      </div>
      <span className="deriv-result mono">{result}</span>
    </div>
  )
}

/**
 * Live, click-to-open derivation of a flow's fleet demand. Shows the actual
 * formula (top), the value-substituted form (below), and the result (right)
 * for every step — travel → cycle → vehicle count — so the engineer can read
 * exactly how the number was produced. All values come from the engine's
 * `CycleBreakdown` + the flow inputs, so they update live as the flow is edited.
 * Imperial throughout (the cycle math is computed in ft·s).
 */
export default function DerivationPanel({
  anchorRef, open, onClose, origin, destination, breakdown,
  distanceFt, thruPerHr, speedLoadedFps, speedUnloadedFps, liftSpeedFps, rawVehicles,
}: Props) {
  const b = breakdown
  const f = b.routeLayoutFactor
  const d = n1(distanceFt)
  const lifts = b.liftTimeSec > 0 && liftSpeedFps != null && liftSpeedFps > 0
  const route = origin || destination ? `${origin || '—'} → ${destination || '—'}` : null

  return (
    <FloatingPanel anchorRef={anchorRef} open={open} onClose={onClose} align="right" className="deriv-panel">
      <div className="deriv-head">
        <span className="deriv-title">Fleet math</span>
        <span className="deriv-tag mono">pace ×{f} · {layoutLabel(b.routeLayout)}</span>
      </div>
      {route && <div className="deriv-route">{route}</div>}
      <div className="deriv-unitnote">distance = one-way leg · times in seconds</div>

      <Row
        label="Travel out (loaded)"
        symbol="distance ÷ (speed × pace)"
        sub={`${d} ÷ (${n1(speedLoadedFps)} × ${f})`}
        result={`${n1(b.travelLoadedSec)}s`}
      />
      <Row
        label="Travel back (empty)"
        symbol="distance ÷ (speed × pace)"
        sub={`${d} ÷ (${n1(speedUnloadedFps)} × ${f})`}
        result={`${n1(b.travelEmptySec)}s`}
      />
      <Row label={`${b.methodName} · load`} symbol="from transfer method" result={`${n1(b.loadSec)}s`} />
      <Row label={`${b.methodName} · unload`} symbol="from transfer method" result={`${n1(b.unloadSec)}s`} />
      {lifts ? (
        <Row
          label="Lift"
          symbol="lift height ÷ lift speed"
          sub={`${n1(b.liftHeightFt)} ÷ ${n1(liftSpeedFps!)}`}
          result={`${n1(b.liftTimeSec)}s`}
        />
      ) : (
        <Row label="Lift" symbol="no vertical lift" result="0.0s" muted />
      )}

      <Row
        label="Cycle time"
        symbol="travel + travel + load + unload + lift"
        sub={`${n1(b.travelLoadedSec)} + ${n1(b.travelEmptySec)} + ${n1(b.loadSec)} + ${n1(b.unloadSec)} + ${n1(b.liftTimeSec)}`}
        result={`${n1(b.totalSec)}s`}
        emphasis
      />
      <Row
        label="Vehicle count"
        symbol="throughput × cycle ÷ 3600"
        sub={`${thruPerHr} × ${n1(b.totalSec)} ÷ 3600`}
        result={rawVehicles == null ? '—' : n2(rawVehicles)}
        emphasis
      />

      <div className="deriv-note">
        Fleet integer = ⌈Σ vehicle count⌉, pooled across <em>all</em> this vehicle&apos;s flows at the
        project level — not per flow. See the fleet summary.
      </div>
    </FloatingPanel>
  )
}
