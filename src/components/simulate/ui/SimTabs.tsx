'use client'

import type { ReactNode } from 'react'

// A tab strip in the side panel: the page's Layout · Sim · Data, and Layout's own Edit · Flows ·
// Validation (`small`). A blocked tab stays pressable — it says why on hover, and a press calls
// `onBlocked` (the page opens the Validation list) instead of doing nothing.

export interface SimTab<T extends string> { id: T; label: ReactNode; blocked?: string }

export default function SimTabs<T extends string>({ tabs, value, onChange, onBlocked, label, small, idPrefix }: {
  tabs: SimTab<T>[]
  value: T
  onChange: (id: T) => void
  onBlocked?: () => void
  label: string
  small?: boolean
  /** Gives each tab an id (`${idPrefix}-${id}`) for its panel's aria-labelledby. */
  idPrefix?: string
}) {
  return (
    <div className={`sim-tabs${small ? ' sim-subtabs' : ' sim-modes'}`} role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" id={idPrefix ? `${idPrefix}-${t.id}` : undefined} aria-selected={t.id === value}
          aria-disabled={t.blocked ? true : undefined} title={t.blocked} className={`${t.id === value ? 'on' : ''}${t.blocked ? ' is-blocked' : ''}`}
          onClick={() => (t.blocked ? onBlocked?.() : onChange(t.id))}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
