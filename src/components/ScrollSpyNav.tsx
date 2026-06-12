'use client'

import { useEffect, useState, type ReactNode } from 'react'

export interface ScrollSpySection {
  id: string
  num: string
  label: string
}

interface Props {
  sections: ReadonlyArray<ScrollSpySection>
  /** Small uppercase header above the section list (e.g. "Fleet Build-Up"). */
  listLabel: string
  /** Optional live figure block rendered in the rail's top slot. */
  topSlot?: ReactNode
  ariaLabel: string
}

/** Sticky scroll-spy rail — the questionnaire's SectionNav pattern (same CSS),
 *  shared by the Fleet Engine and ROM dashboard scrolling layouts. */
export default function ScrollSpyNav({ sections, listLabel, topSlot, ariaLabel }: Props) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')

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
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  return (
    <nav className="section-nav" aria-label={ariaLabel}>
      {topSlot}
      <ul className="section-nav-list">
        <li><div className="section-nav-tier">{listLabel}</div></li>
        {sections.map(s => (
          <li key={s.id}>
            <button
              type="button"
              className={`section-nav-item${activeId === s.id ? ' active' : ''}`}
              onClick={() => handleClick(s.id)}
            >
              <span className="section-nav-num">{s.num}</span>
              <span className="section-nav-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
