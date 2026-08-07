'use client'

import { useEffect, useState } from 'react'
import type { PartialProjectFormData } from '@/src/lib/validations/schemas'

export interface QSection {
  id: string                 // anchor id (e.g. 'q-sec-01')
  num: string                // '01'
  short: string              // nav label
  tier: string               // tier band label
  fields: readonly (keyof PartialProjectFormData)[]  // fields that count toward "started"
}

interface Props {
  sections: readonly QSection[]
  values: Partial<PartialProjectFormData>
}

/** True when a section carries the required `submissionType` field but it's unset.
 *  Drives the status-bar "Required" marker (export is blocked until it's chosen). */
export function isRequiredUnmet(s: QSection, values: Partial<PartialProjectFormData>): boolean {
  return s.fields.includes('submissionType') && !values.submissionType
}

/** True when a section has any answer (non-empty / non-default). */
function started(s: QSection, values: Partial<PartialProjectFormData>): boolean {
  return s.fields.some(f => {
    const v = values[f]
    if (v == null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
}

/** Self-contained section scroller for the questionnaire — mirrors Step 1's
 *  SectionNav (sticky rail, progress, intersection-observer highlight,
 *  click-to-scroll) but driven by the questionnaire's own SECTIONS (no Step-1
 *  / storage coupling). */
export default function QuestionnaireNav({ sections, values }: Props) {
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

  const total = sections.length
  const filled = sections.filter(s => started(s, values)).length
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100)

  return (
    <nav className="section-nav" aria-label="Section navigation">
      <div className="section-nav-progress">
        <div className="section-nav-progress-pct">{pct}%</div>
        <div className="section-nav-progress-stat">{filled} of {total} sections</div>
        <div className="section-nav-progress-bar">
          <div className="section-nav-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="section-nav-list">
        {sections.map((s, i) => {
          const isActive = activeId === s.id
          const tierStart = i === 0 || sections[i - 1].tier !== s.tier
          const requiredUnmet = isRequiredUnmet(s, values)
          const dot = requiredUnmet ? 'section-dot required' : started(s, values) ? 'section-dot in-progress' : 'section-dot optional'
          return (
            <li key={s.id}>
              {tierStart && <div className="section-nav-tier">{s.tier}</div>}
              <button
                type="button"
                className={`section-nav-item${isActive ? ' active' : ''}`}
                onClick={() => handleClick(s.id)}
                aria-label={requiredUnmet ? `${s.short} — required answer missing` : undefined}
              >
                <span className={dot} aria-hidden />
                <span className="section-nav-num">{s.num}</span>
                <span className="section-nav-label">{s.short}</span>
                {requiredUnmet && <span className="section-nav-req">Required</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
