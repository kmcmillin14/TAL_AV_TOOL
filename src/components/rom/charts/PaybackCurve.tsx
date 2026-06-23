'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import type { PaybackSeries } from '@/src/calc/romCharts'
import { ChartFrame, ChartTooltip, ChartCaption, TICK, AXIS_STROKE, GRID_STROKE, CURSOR, usdShort } from './recharts/ChartKit'

interface Props { series: PaybackSeries }

/** Cumulative cash flow over the life, crossing zero at break-even. */
export default function PaybackCurve({ series }: Props) {
  const pts = series.points
  if (pts.length < 2) return <div className="rv-empty">Size the fleet to project payback.</div>
  const data = pts.map(p => ({ year: p.year, cumulative: p.cumulative }))
  const be = series.breakEvenYear
  const years = pts[pts.length - 1].year

  return (
    <>
      <ChartFrame height={200}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="year" tick={TICK} stroke={AXIS_STROKE} tickFormatter={y => `yr ${y}`} />
          <YAxis tick={TICK} stroke={AXIS_STROKE} width={48} tickFormatter={usdShort} />
          <Tooltip content={<ChartTooltip fmt={usdShort} labelPrefix="Year " />} cursor={CURSOR} />
          <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeWidth={1} />
          {be != null && be <= years && (
            <ReferenceLine x={Math.round(be)} stroke="var(--accent)" strokeDasharray="4 3"
              label={{ value: `break-even ${be.toFixed(1)} yr`, position: 'insideTopRight', fill: 'var(--accent)', fontSize: 10 }} />
          )}
          <Line type="monotone" dataKey="cumulative" name="Cumulative cash flow" stroke="var(--accent)"
            strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive />
        </LineChart>
      </ChartFrame>
      <ChartCaption>
        {be == null
          ? 'No labor offset yet — add operators to project a payback.'
          : `Breaks even at ${be.toFixed(1)} years; cash-positive thereafter.`}
      </ChartCaption>
    </>
  )
}
