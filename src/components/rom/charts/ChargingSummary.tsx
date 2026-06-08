'use client'

import type { ChargingSeries } from '@/src/calc/romCharts'

const fmtH = (h: number | null) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtP = (a: number | null) => (a == null ? '—' : `${Math.round(a * 100)}%`)

interface Props { series: ChargingSeries }

/** Per-type runtime, recharge, method, and uptime. */
export default function ChargingSummary({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see charging.</div>
  return (
    <table className="rv-charge">
      <thead><tr><th>Vehicle</th><th>Method</th><th className="num">Runtime</th><th className="num">Recharge</th><th className="num">Uptime</th></tr></thead>
      <tbody>
        {series.rows.map(r => (
          <tr key={r.vehicleName}>
            <td>{r.vehicleName}</td>
            <td>{r.method === 'opportunity' ? 'Opportunity' : 'Plugged'}</td>
            <td className="num mono">{fmtH(r.runHr)}</td>
            <td className="num mono">{fmtH(r.chargeHr)}</td>
            <td className="num mono">{fmtP(r.availability)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
