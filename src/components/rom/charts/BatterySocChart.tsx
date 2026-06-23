'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import type { BatterySocSeries } from '@/src/calc/romCharts'
import { ChartFrame, ChartTooltip, ChartCaption, TICK, AXIS_STROKE, GRID_STROKE, CURSOR, pct } from './recharts/ChartKit'
import { seriesColor } from '../palette'

interface Props { series: BatterySocSeries }

/** State-of-charge over the operating day, one line per vehicle type, with the
 *  depth-of-discharge floor marked. */
export default function BatterySocChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see battery state.</div>

  // Merge per-vehicle point arrays into one row-per-hour table keyed by vehicle name.
  const hrs = new Set<number>()
  for (const r of series.rows) for (const p of r.points) hrs.add(p.hr)
  const sortedHrs = [...hrs].sort((a, b) => a - b)
  const socAt = (name: string, hr: number) =>
    series.rows.find(r => r.vehicleName === name)?.points.find(p => p.hr === hr)?.soc
  const data = sortedHrs.map(hr => {
    const row: Record<string, number> = { hr }
    for (const r of series.rows) {
      const v = socAt(r.vehicleName, hr)
      if (v != null) row[r.vehicleName] = v
    }
    return row
  })
  const floor = series.rows[0].dodFloor

  return (
    <>
      <ChartFrame height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="hr" tick={TICK} stroke={AXIS_STROKE} tickFormatter={h => `${h}h`} />
          <YAxis tick={TICK} stroke={AXIS_STROKE} width={42} domain={[0, 1]} tickFormatter={pct} />
          <Tooltip content={<ChartTooltip fmt={pct} labelPrefix="Hour " />} cursor={CURSOR} />
          <ReferenceLine y={floor} stroke="var(--bad)" strokeDasharray="4 3"
            label={{ value: `DoD floor ${pct(floor)}`, position: 'insideBottomRight', fill: 'var(--bad)', fontSize: 10 }} />
          {series.rows.map((r, i) => (
            <Line key={r.vehicleName} type="monotone" dataKey={r.vehicleName} name={r.vehicleName}
              stroke={seriesColor(i)} strokeWidth={2} dot={false} isAnimationActive />
          ))}
        </LineChart>
      </ChartFrame>
      <ChartCaption>Charge stays above the {pct(floor)} depth-of-discharge floor across the day.</ChartCaption>
    </>
  )
}
