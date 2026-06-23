'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import type { UtilizationSeries } from '@/src/calc/romCharts'
import { ChartFrame, ChartTooltip, ChartCaption, TICK, AXIS_STROKE, GRID_STROKE, CURSOR } from './recharts/ChartKit'

interface Props { series: UtilizationSeries }

/** Per-type raw demand vs provisioned fleet — the gap to "sold" is headroom. */
export default function UtilizationChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see utilization.</div>
  const data = series.rows.map(r => ({
    name: r.vehicleName,
    demand: Number(r.rawDemand.toFixed(2)),
    sold: r.fleetSold,
  }))
  const fmt = (n: number) => String(n)
  const height = Math.max(120, data.length * 46 + 24)
  const worst = series.rows.reduce((m, r) => Math.max(m, r.fleetSold > 0 ? r.rawDemand / r.fleetSold : 0), 0)

  return (
    <>
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barGap={2}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" horizontal={false} />
          <XAxis type="number" tick={TICK} stroke={AXIS_STROKE} allowDecimals />
          <YAxis type="category" dataKey="name" tick={TICK} stroke={AXIS_STROKE} width={64} />
          <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: 'var(--bg-hover)' }} />
          <Bar dataKey="sold" name="Provisioned" fill="var(--tal-classic-blue)" maxBarSize={16} radius={[0, 3, 3, 0]} />
          <Bar dataKey="demand" name="Raw demand" fill="var(--accent)" maxBarSize={16} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ChartFrame>
      <ChartCaption>Raw demand sits under provisioned capacity — peak type runs at {Math.round(worst * 100)}% utilization.</ChartCaption>
    </>
  )
}
