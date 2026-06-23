'use client'

/** Radial 270° gauge (T-Hive style, TAL-formatted): grey track + brand-red fill,
 *  big centered % and a label below. Pure SVG, scales to its container. */

const SIZE = 120
const CX = SIZE / 2
const CY = SIZE / 2
const R = 48
const STROKE = 11
const START = 135 // degrees (bottom-left)
const SWEEP = 270 // total arc

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** SVG arc path from `a0`° sweeping `len`° clockwise. */
function arc(a0: number, len: number) {
  const a1 = a0 + len
  const p0 = polar(CX, CY, R, a0)
  const p1 = polar(CX, CY, R, a1)
  const large = len > 180 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${large} 1 ${p1.x} ${p1.y}`
}

interface Props {
  /** 0–1 */
  value: number
  label: string
  /** Optional override for the centered display (defaults to rounded %). */
  display?: string
  /** Color the fill by status when true (green/amber/red by value). */
  status?: boolean
  /** Plain-language definition shown on hover (title + a tooltip). */
  def?: string
}

export default function RomGauge({ value, label, display, status, def }: Props) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const fill = status
    ? (v >= 0.85 ? 'var(--good)' : v >= 0.6 ? 'var(--tal-golden-orange)' : 'var(--accent)')
    : 'var(--accent)'
  return (
    <div className="rom2-gauge" title={def}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rom2-gauge-svg" role="img" aria-label={`${label}: ${display ?? `${Math.round(v * 100)}%`}${def ? `. ${def}` : ''}`}>
        <path d={arc(START, SWEEP)} fill="none" stroke="var(--border)" strokeWidth={STROKE} strokeLinecap="round" />
        {v > 0 && (
          <path d={arc(START, SWEEP * v)} fill="none" stroke={fill} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        <text x={CX} y={CY + 2} className="rom2-gauge-val" textAnchor="middle">{display ?? `${Math.round(v * 100)}%`}</text>
      </svg>
      <div className="rom2-gauge-lbl">
        {label}
        {def && <span className="rom2-gauge-info" aria-hidden> ⓘ</span>}
      </div>
      {def && <div className="rom2-gauge-tip">{def}</div>}
    </div>
  )
}
