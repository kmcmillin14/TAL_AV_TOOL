'use client'

import type { ReactNode } from 'react'

interface Props {
  title: string
  action?: ReactNode        // optional primary action (e.g. a "+ Flow" button)
  count?: string            // optional muted count/subtitle on the right of the title row
}

/** Compact phone page header shared by every step's mobile view: title left,
 *  one primary action right. Kept deliberately minimal. */
export default function MobileHeader({ title, action, count }: Props) {
  return (
    <div className="m-head">
      <div className="m-head-titles">
        <span className="m-head-title">{title}</span>
        {count && <span className="m-head-count mono">{count}</span>}
      </div>
      {action && <div className="m-head-action">{action}</div>}
    </div>
  )
}
