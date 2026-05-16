'use client'

import { FORM_SECTIONS, sectionStatus, totalRequired, filledRequired } from '@/src/lib/constants/sections'
import type { ProjectFormData } from '@/src/lib/validations/schemas'

interface Props {
  values: Partial<ProjectFormData>
}

export default function ProgressStrip({ values }: Props) {
  const total = totalRequired()
  const filled = filledRequired(values)
  const pct = total === 0 ? 100 : Math.round((filled / total) * 100)

  const completeSections = FORM_SECTIONS.filter(
    s => s.requiredFields.length > 0 && sectionStatus(s, values) === 'complete',
  ).length
  const sectionsWithReq = FORM_SECTIONS.filter(s => s.requiredFields.length > 0).length

  return (
    <div className="progress-strip" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-strip-text">
        <span className="progress-strip-stat">
          <strong>{completeSections}</strong> of {sectionsWithReq} sections complete
        </span>
        <span className="progress-strip-dot">·</span>
        <span className="progress-strip-stat">
          <strong>{filled}</strong> of {total} required fields filled
        </span>
        <span className="progress-strip-pct">{pct}%</span>
      </div>
      <div className="progress-strip-bar">
        <div className="progress-strip-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
