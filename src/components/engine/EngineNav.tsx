'use client'

import { useEffect, useState } from 'react'

export const ENGINE_SECTIONS = [
  { id: 'engine-raw',      num: '01', label: 'Raw Fleet', short: 'Raw Fleet' },
  { id: 'engine-charging', num: '02', label: 'Charging',  short: 'Charging' },
  { id: 'engine-buffer',   num: '03', label: 'Buffer',    short: 'Buffer' },
] as const

interface Props {
  /** Bound project total (Σ fleetSold) — shown live at the top of the rail. */
  totalFleetSold: number
  hasFleet: boolean
}

/** Sticky scroll-spy rail for the Fleet Engine's three always-visible sections —
 *  the questionnaire's SectionNav pattern (same CSS), with the live TOTAL where
 *  Step 1 shows qualification readiness. */
export default function EngineNav({ totalFleetSold, hasFleet }: Props) {
  const [activeId, setActiveId] = useState<string>(ENGINE_SECTIONS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const top = visible.reduce((a, b) => (a.intersectionRatio >= b.intersectionRatio ? a : b))
        if (top.target.id) setActiveId(top.target.id)
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    for (const s of ENGINE_SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  return (
    <nav className="section-nav" aria-label="Fleet Engine sections">
      <div className="section-nav-progress">
        <div className="section-nav-progress-pct">{hasFleet ? totalFleetSold : '—'}</div>
        <div className="section-nav-progress-stat">
          {hasFleet ? `vehicle${totalFleetSold === 1 ? '' : 's'} total` : 'assign vehicles to size'}
        </div>
      </div>
      <ul className="section-nav-list">
        <li><div className="section-nav-tier">Fleet Build-Up</div></li>
        {ENGINE_SECTIONS.map(s => (
          <li key={s.id}>
            <button
              type="button"
              className={`section-nav-item${activeId === s.id ? ' active' : ''}`}
              onClick={() => handleClick(s.id)}
            >
              <span className="section-nav-num">{s.num}</span>
              <span className="section-nav-label">{s.short}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
