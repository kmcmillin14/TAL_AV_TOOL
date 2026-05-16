'use client'

import { useEffect, useState } from 'react'
import { FORM_SECTIONS, sectionStatus, totalRequired, filledRequired, type SectionStatus } from '@/src/lib/constants/sections'
import type { ProjectFormData } from '@/src/lib/validations/schemas'

interface Props {
  values: Partial<ProjectFormData>
}

function dotClass(status: SectionStatus): string {
  switch (status) {
    case 'complete':    return 'section-dot complete'
    case 'in-progress': return 'section-dot in-progress'
    case 'optional':    return 'section-dot optional'
    default:            return 'section-dot untouched'
  }
}

export default function SectionNav({ values }: Props) {
  const [activeId, setActiveId] = useState<string>(FORM_SECTIONS[0].id)

  useEffect(() => {
    // Highlight the section currently closest to the top of the viewport.
    const observer = new IntersectionObserver(
      entries => {
        // Pick the entry with the highest intersectionRatio that's currently intersecting.
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const top = visible.reduce((a, b) => a.intersectionRatio >= b.intersectionRatio ? a : b)
        if (top.target.id) setActiveId(top.target.id)
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    for (const s of FORM_SECTIONS) {
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

  const total = totalRequired()
  const filled = filledRequired(values)
  const pct = total === 0 ? 100 : Math.round((filled / total) * 100)

  return (
    <nav className="section-nav" aria-label="Section navigation">
      <div className="section-nav-progress">
        <div className="section-nav-progress-pct">{pct}%</div>
        <div className="section-nav-progress-stat">{filled} of {total} required</div>
        <div className="section-nav-progress-bar">
          <div className="section-nav-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="section-nav-title">Sections</div>
      <ul className="section-nav-list">
        {FORM_SECTIONS.map(s => {
          const status = sectionStatus(s, values)
          const isActive = activeId === s.id
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`section-nav-item${isActive ? ' active' : ''}`}
                onClick={() => handleClick(s.id)}
              >
                <span className={dotClass(status)} aria-hidden />
                <span className="section-nav-num">{s.num}</span>
                <span className="section-nav-label">{s.short}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
