'use client'

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { TcoSeries } from '@/src/calc/romCharts'
import { ChartFrame, ChartTooltip, ChartCaption, TICK, AXIS_STROKE, GRID_STROKE, CURSOR, usdShort } from './recharts/ChartKit'

interface Props { series: TcoSeries }

/** Per-year cost stack (CAPEX once + cumulative OPEX) vs cumulative labor offset,
 *  with the net cash position as a line — see where benefit overtakes cost. */
export default function TcoStacked({ series }: Props) {
  const pts = series.points.filter(p => p.year > 0)
  if (pts.length < 1) return <div className="rv-empty">Size the fleet to see TCO.</div>
  const data = pts.map(p => ({ year: p.year, capex: p.capex, opex: p.cumOpex, offset: p.cumLaborOffset, net: p.net }))

  return (
    <>
      <ChartFrame height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="year" tick={TICK} stroke={AXIS_STROKE} tickFormatter={y => `yr ${y}`} />
          <YAxis tick={TICK} stroke={AXIS_STROKE} width={48} tickFormatter={usdShort} />
          <Tooltip content={<ChartTooltip fmt={usdShort} labelPrefix="Year " />} cursor={CURSOR} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--tal-font-numeric)' }} />
          <Bar dataKey="capex" name="CAPEX" stackId="cost" fill="var(--accent)" maxBarSize={28} />
          <Bar dataKey="opex" name="Cumulative OPEX" stackId="cost" fill="var(--tal-golden-orange)" maxBarSize={28} />
          <Bar dataKey="offset" name="Labor offset" fill="var(--good)" maxBarSize={28} />
          <Line type="monotone" dataKey="net" name="Net" stroke="var(--tal-dark-grey)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ChartFrame>
      <ChartCaption>Cost (CAPEX + OPEX) vs cumulative labor offset; the net line crosses zero at payback.</ChartCaption>
    </>
  )
}
