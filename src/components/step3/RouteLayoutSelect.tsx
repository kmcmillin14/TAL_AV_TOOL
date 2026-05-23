'use client'

import type { RouteLayout } from '@/src/calc/types'

interface Props {
  value: RouteLayout
  onChange: (next: RouteLayout) => void
}

const OPTIONS: ReadonlyArray<{ value: RouteLayout; label: string }> = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high',   label: 'High' },
]

/**
 * Three-pill segmented control. Engineers pick the path geometry: Low for
 * lots of turns / congested zones; High for mostly straightaways. The
 * underlying speed factor (50% / 70% / 90%) is applied by the calc.
 */
export default function RouteLayoutSelect({ value, onChange }: Props) {
  return (
    <div className="route-layout-control" role="radiogroup" aria-label="Route layout">
      {OPTIONS.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`route-layout-pill ${active ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
