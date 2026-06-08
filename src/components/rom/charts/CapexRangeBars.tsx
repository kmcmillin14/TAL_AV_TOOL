'use client'

import type { CapexBarsSeries } from '@/src/calc/romCharts'

const usd = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}K`

interface Props { series: CapexBarsSeries }

/** Per-vehicle price-range bars over a shared scale + total band. Always a range. */
export default function CapexRangeBars({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see ROM pricing.</div>
  const max = Math.max(series.totalMax, ...series.rows.map(r => r.lineMax)) || 1
  const bar = (min: number, max2: number) => ({ left: `${(min / max) * 100}%`, width: `${((max2 - min) / max) * 100}%` })
  return (
    <div className="rv-capex">
      {series.rows.map(r => (
        <div key={r.vehicleName} className="rv-capex-row">
          <span className="rv-capex-name">{r.qty}× {r.vehicleName}</span>
          <span className="rv-capex-track"><span className="rv-capex-fill" style={bar(r.lineMin, r.lineMax)} /></span>
          <span className="rv-capex-val mono">{usd(r.lineMin)}–{usd(r.lineMax)}</span>
        </div>
      ))}
      <div className="rv-capex-row rv-capex-total">
        <span className="rv-capex-name">Total</span>
        <span className="rv-capex-track"><span className="rv-capex-fill" style={bar(series.totalMin, series.totalMax)} /></span>
        <span className="rv-capex-val mono">{usd(series.totalMin)}–{usd(series.totalMax)}</span>
      </div>
    </div>
  )
}
