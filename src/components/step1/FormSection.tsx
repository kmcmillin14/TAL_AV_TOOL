'use client'

import { useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import type { SectionStatus } from '@/src/lib/constants/sections'

interface FormSectionProps {
  sectionNum: string
  title: string
  /** Anchor id used by SectionNav for click-to-scroll + intersection observer. */
  id?: string
  /** Completion state shown as a badge in the header. */
  status?: SectionStatus
  collapsible?: boolean
  defaultOpen?: boolean
  /** Fields here aren't used in any Step 2 gate / downstream calc yet — show an
   *  "Advanced" tag + note so it's clear they don't move the traffic lights. */
  notGated?: boolean
  children: React.ReactNode
}

function statusLabel(status?: SectionStatus): string | null {
  switch (status) {
    case 'complete':    return 'Complete'
    case 'in-progress': return 'In progress'
    case 'optional':    return 'Optional'
    case 'untouched':   return 'Required'
    default:            return null
  }
}

export default function FormSection({
  sectionNum,
  title,
  id,
  status,
  collapsible = true,
  defaultOpen = true,
  notGated = false,
  children,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const badge = statusLabel(status)

  return (
    <div className="form-section" id={id}>
      <div
        className={`form-section-header${collapsible ? ' collapsible' : ''}`}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
      >
        <h3>
          <span className="sec-num">{sectionNum}.</span> {title}
        </h3>
        <div className="form-section-meta">
          {notGated && <span className="sec-tag-advanced">Advanced · not yet gated</span>}
          {badge && <span className={`sec-badge sec-badge-${status}`}>{badge}</span>}
          {collapsible && (
            <Icon
              name="chevron"
              size={14}
              className={`collapse-icon${open ? ' open' : ''}`}
            />
          )}
        </div>
      </div>
      {open && (
        <div className="form-section-body">
          {notGated && (
            <p className="sec-notgated-note">
              Captured for the proposal and planned qualification gates — these don&apos;t
              affect the Step 2 traffic lights yet.
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
