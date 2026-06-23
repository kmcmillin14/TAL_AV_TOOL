'use client'

import { useRef, useState, type CSSProperties } from 'react'
import FloatingPanel from '@/src/components/step3/FloatingPanel'
import type { KpiDetail } from '@/src/lib/kpiDetails'
import { seriesColor } from './palette'

interface Props {
  label: string
  value: string
  detail: KpiDetail
  accent?: boolean
  /** Index into the brand data palette for the mini-bar color. */
  colorIndex?: number
  /** Scenario-vs-baseline delta chip (already formatted, e.g. "▲ +2"). */
  delta?: string
}

/**
 * Interactive KPI tile (Power BI-style): shows the headline figure; on hover or
 * focus a popover reveals the metric's breakdown (formula · mini bars · rows);
 * click pins it open. Read-only detail, so hover-to-read needs no pointer travel.
 */
export default function KpiTile({ label, value, detail, accent, colorIndex = 0, delta }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const barColor = seriesColor(colorIndex)

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`rom-kpi${accent ? ' rom-kpi-accent' : ''}${pinned ? ' rom-kpi-pinned' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setPinned(p => !p)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value}. ${pinned ? 'Click to unpin' : 'Click to pin details'}`}
      >
        <span className="rom-kpi-val mono">{value}</span>
        <span className="rom-kpi-lbl">{label}</span>
        {delta
          ? <span className="rom-kpi-delta mono" aria-label={`change vs baseline ${delta}`}>{delta}</span>
          : <span className="rom-kpi-hint" aria-hidden="true">{pinned ? '● pinned' : 'hover ⓘ'}</span>}
      </button>

      {open && (
        <FloatingPanel anchorRef={ref} open={open} onClose={() => { setPinned(false); setHovered(false) }} align="left" className="kpi-pop">
          <div className="kpi-pop-head">{label}</div>
          {detail.formula && <div className="kpi-pop-formula mono">{detail.formula}</div>}
          {detail.bars && detail.bars.length > 0 && (
            <div className="kpi-pop-bars">
              {detail.bars.map((b, i) => (
                <div key={i} className="kpi-bar-row">
                  <span className="kpi-bar-label">{b.label}</span>
                  <span className="kpi-bar-track">
                    <span className="kpi-bar-fill" style={{ width: `${Math.round(b.frac * 100)}%`, background: barColor } as CSSProperties} />
                  </span>
                  <span className="kpi-bar-val mono">{b.display}</span>
                </div>
              ))}
            </div>
          )}
          {detail.rows && detail.rows.length > 0 && (
            <dl className="kpi-pop-rows">
              {detail.rows.map((r, i) => (
                <div key={i}><dt>{r.label}</dt><dd className="mono">{r.value}</dd></div>
              ))}
            </dl>
          )}
          {detail.note && <div className="kpi-pop-note">{detail.note}</div>}
        </FloatingPanel>
      )}
    </>
  )
}
