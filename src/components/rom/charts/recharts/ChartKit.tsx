'use client'

import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

/** Shared themed bits for the ROM Recharts charts — keeps every chart on the TAL
 *  system (Toyota Type, brand palette, token colors) and out of the generic
 *  charting-library look. */

export const TICK = { fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'var(--tal-font-numeric)' } as const
export const AXIS_STROKE = 'var(--border)'
export const GRID_STROKE = 'var(--border)'
export const CURSOR = { stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '3 3' } as const

export const usdShort = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n) >= 1_000_000 ? `${(Math.abs(n) / 1_000_000).toFixed(2)}M` : `${Math.round(Math.abs(n) / 1000)}K`}`
export const pct = (n: number) => `${Math.round(n * 100)}%`

/** Fixed-height responsive wrapper so charts size to the bento cell width. */
export function ChartFrame({ height = 200, children }: { height?: number; children: ReactNode }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

interface TipEntry { name?: string; value?: number | string; color?: string; dataKey?: string }
interface TipProps {
  active?: boolean
  payload?: TipEntry[]
  label?: string | number
  /** Value formatter; defaults to the raw value. */
  fmt?: (n: number) => string
  /** Prefix shown before the label (e.g. "Year "). */
  labelPrefix?: string
}

/** Custom themed tooltip — pass to `<Tooltip content={<ChartTooltip fmt={usdShort} />} />`. */
export function ChartTooltip({ active, payload, label, fmt, labelPrefix }: TipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rom2-tip">
      {label != null && <div className="rom2-tip-label">{labelPrefix}{label}</div>}
      {payload.map((e, i) => (
        <div key={i} className="rom2-tip-row">
          <span className="rom2-tip-dot" style={{ background: e.color }} aria-hidden />
          <span className="rom2-tip-name">{e.name}</span>
          <span className="rom2-tip-val mono">
            {typeof e.value === 'number' && fmt ? fmt(e.value) : String(e.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** One-line data-driven caption under a chart. */
export function ChartCaption({ children }: { children: ReactNode }) {
  return <p className="rom2-caption">{children}</p>
}
