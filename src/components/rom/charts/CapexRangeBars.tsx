'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import type { CapexBarsSeries } from '@/src/calc/romCharts'
import { ChartFrame, ChartCaption, TICK, AXIS_STROKE, GRID_STROKE, usdShort } from './recharts/ChartKit'

interface Props { series: CapexBarsSeries }

interface RangePayload { payload?: { name?: string; range?: [number, number] } }
function RangeTip({ active, payload }: { active?: boolean; payload?: RangePayload[] }) {
  const row = active && payload && payload[0]?.payload
  if (!row || !row.range) return null
  return (
    <div className="rom2-tip">
      <div className="rom2-tip-label">{row.name}</div>
      <div className="rom2-tip-row"><span className="rom2-tip-val mono">{usdShort(row.range[0])} – {usdShort(row.range[1])}</span></div>
    </div>
  )
}

/** Per-vehicle price-range floating bars over a shared scale + total. Always a range. */
export default function CapexRangeBars({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see ROM pricing.</div>
  const data = [
    ...series.rows.map(r => ({ name: `${r.qty}× ${r.vehicleName}`, range: [r.lineMin, r.lineMax] as [number, number], total: false })),
    { name: 'Total', range: [series.totalMin, series.totalMax] as [number, number], total: true },
  ]
  const height = Math.max(120, data.length * 40 + 24)

  return (
    <>
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" horizontal={false} />
          <XAxis type="number" tick={TICK} stroke={AXIS_STROKE} tickFormatter={usdShort} />
          <YAxis type="category" dataKey="name" tick={TICK} stroke={AXIS_STROKE} width={92} />
          <Tooltip content={<RangeTip />} cursor={{ fill: 'var(--bg-hover)' }} />
          <Bar dataKey="range" maxBarSize={18} radius={3}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.total ? 'var(--accent)' : 'var(--tal-classic-blue)'} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <ChartCaption>Range, never a point — {usdShort(series.totalMin)} to {usdShort(series.totalMax)} all-in.</ChartCaption>
    </>
  )
}
