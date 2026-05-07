'use client'

import { useState } from 'react'
import Icon from '@/src/design-system/components/Icon'

interface FormSectionProps {
  sectionNum: string
  title: string
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}

export default function FormSection({
  sectionNum,
  title,
  collapsible = false,
  defaultOpen = true,
  children,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="form-section">
      <div
        className={`form-section-header${collapsible ? ' collapsible' : ''}`}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
      >
        <h3>
          <span className="sec-num">{sectionNum}.</span> {title}
        </h3>
        {collapsible && (
          <Icon
            name="chevron"
            size={14}
            className={`collapse-icon${open ? ' open' : ''}`}
          />
        )}
      </div>
      {open && <div className="form-section-body">{children}</div>}
    </div>
  )
}
