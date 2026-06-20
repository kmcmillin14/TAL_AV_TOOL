'use client'

import type { BatterySocSeries } from '@/src/calc/romCharts'
import { linScale, polyline } from './svgScale'
import { SERIES as LINE_COLORS } from '../palette'

const W = 520, H = 130, PAD = 24

interface Props { series: BatterySocSeries }

/** State-of-charge sawtooth per vehicle type over the operating day. */
export default function BatterySocChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see the battery profile.</div>
  const maxHr = Math.max(1, ...series.rows.flatMap(r => r.points.map(p => p.hr)))
  const x = linScale(0, maxHr, PAD, W - PAD)
  const y = linScale(0, 1, H - PAD, PAD)
  const floor = series.rows[0]?.dodFloor ?? 0.2
  return (
    <div className="rv-soc">
      <svg viewBox={`0 0 ${W} ${H}`} className="rv-soc-svg" role="img" aria-label="Battery state of charge over the day">
        <line x1={PAD} y1={y(floor)} x2={W - PAD} y2={y(floor)} className="rv-soc-floor" strokeDasharray="3 3" />
        {series.rows.map((r, i) => (
          <polyline key={r.vehicleName} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.75}
            points={polyline(r.points.map(p => [x(p.hr), y(p.soc)]))} />
        ))}
        <text x={PAD} y={H - 6} className="rv-soc-axis">0 h</text>
        <text x={W - PAD} y={H - 6} className="rv-soc-axis" textAnchor="end">{Math.round(maxHr)} h</text>
        <text x={PAD - 6} y={y(floor) + 3} className="rv-soc-axis" textAnchor="end">{Math.round(floor * 100)}%</text>
      </svg>
      <ul className="rv-legend">
        {series.rows.map((r, i) => (
          <li key={r.vehicleName}><span className="rv-swatch" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />{r.vehicleName}</li>
        ))}
      </ul>
    </div>
  )
}
