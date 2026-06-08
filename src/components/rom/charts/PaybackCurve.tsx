'use client'

import type { PaybackSeries } from '@/src/calc/romCharts'
import { linScale, polyline } from './svgScale'

const W = 520, H = 170, PAD = 30

interface Props { series: PaybackSeries }

/** Cumulative cash flow over the life, crossing zero at break-even. */
export default function PaybackCurve({ series }: Props) {
  const pts = series.points
  if (pts.length < 2) return <div className="rv-empty">Size the fleet to project payback.</div>
  const years = pts[pts.length - 1].year
  const lo = Math.min(0, ...pts.map(p => p.cumulative))
  const hi = Math.max(0, ...pts.map(p => p.cumulative))
  const x = linScale(0, years, PAD, W - PAD)
  const y = linScale(lo, hi, H - PAD, PAD)
  const be = series.breakEvenYear
  const usd = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1_000_000).toFixed(1)}M`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rv-pay" role="img" aria-label="Cumulative cash flow to break-even">
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} className="rv-pay-zero" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={polyline(pts.map(p => [x(p.year), y(p.cumulative)]))} />
      {be != null && be <= years && (
        <g>
          <line x1={x(be)} y1={PAD} x2={x(be)} y2={H - PAD} className="rv-pay-be" strokeDasharray="3 3" />
          <text x={x(be) + 4} y={PAD + 10} className="rv-pay-belbl">payback {be.toFixed(1)} yr</text>
        </g>
      )}
      <text x={PAD} y={H - 8} className="rv-soc-axis">yr 0</text>
      <text x={W - PAD} y={H - 8} className="rv-soc-axis" textAnchor="end">yr {years}</text>
      <text x={PAD - 4} y={y(hi)} className="rv-soc-axis" textAnchor="end">{usd(hi)}</text>
    </svg>
  )
}
