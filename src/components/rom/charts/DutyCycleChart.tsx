'use client'

import type { DutyCycleSeries, DutyKey } from '@/src/calc/romCharts'

const COLORS: Record<DutyKey, string> = {
  driveLoaded: 'var(--accent)', driveEmpty: '#6aa9ff', transfer: '#46c19a',
  lift: '#e0a23c', charging: '#9b7ad6', idle: 'var(--border)',
}

interface Props { series: DutyCycleSeries }

/** Single 100% stacked bar of what the fleet does all day. */
export default function DutyCycleChart({ series }: Props) {
  const segs = series.segments.filter(s => s.fraction > 0.001)
  return (
    <div className="rv-duty">
      <div className="rv-duty-bar" role="img" aria-label="Fleet activity split">
        {segs.map(s => (
          <span key={s.key} className="rv-duty-seg" style={{ width: `${s.fraction * 100}%`, background: COLORS[s.key] }} title={`${s.label}: ${Math.round(s.fraction * 100)}%`} />
        ))}
      </div>
      <ul className="rv-legend">
        {segs.map(s => (
          <li key={s.key}><span className="rv-swatch" style={{ background: COLORS[s.key] }} />{s.label} <span className="mono">{Math.round(s.fraction * 100)}%</span></li>
        ))}
      </ul>
    </div>
  )
}
