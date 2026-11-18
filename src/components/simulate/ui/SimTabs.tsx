'use client'

import type { ReactNode } from 'react'

// A two-way switch in Simulation's head: Operations · Layout check. (The stage strip replaced the panel tabs.)

export interface SimTab<T extends string> { id: T; label: ReactNode }

export default function SimTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: SimTab<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="sim-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
