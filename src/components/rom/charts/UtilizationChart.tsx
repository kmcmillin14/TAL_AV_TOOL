'use client'

import type { UtilizationSeries } from '@/src/calc/romCharts'

interface Props { series: UtilizationSeries }

/** Per-type demand vs provisioned bars; the demand fill over the sold track shows headroom. */
export default function UtilizationChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see utilization.</div>
  const max = Math.max(1, ...series.rows.map(r => r.fleetSold))
  return (
    <div className="rv-util">
      {series.rows.map(r => {
        const pctDemand = (r.rawDemand / max) * 100
        const pctSold = (r.fleetSold / max) * 100
        const util = r.fleetSold > 0 ? Math.round((r.rawDemand / r.fleetSold) * 100) : 0
        return (
          <div key={r.vehicleName} className="rv-util-row">
            <span className="rv-util-name">{r.vehicleName}</span>
            <span className="rv-util-track">
              <span className="rv-util-sold" style={{ width: `${pctSold}%` }} />
              <span className="rv-util-demand" style={{ width: `${pctDemand}%` }} />
            </span>
            <span className="rv-util-val mono">{util}% · {r.rawDemand.toFixed(1)}/{r.fleetSold}</span>
          </div>
        )
      })}
    </div>
  )
}
