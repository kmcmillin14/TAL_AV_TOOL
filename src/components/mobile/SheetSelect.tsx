'use client'

import { useState, type ReactNode } from 'react'
import BottomSheet from './BottomSheet'

export interface SheetOption {
  id: string
  label: string
  dot?: string          // optional color dot (vehicle chips)
  sub?: string          // optional secondary line
}

interface Props {
  label: string
  value: string | undefined
  options: SheetOption[]
  placeholder?: string
  sheetTitle?: string
  onChange: (id: string) => void
  /** Optional custom trigger content (defaults to the selected option's label). */
  renderValue?: (opt: SheetOption | undefined) => ReactNode
}

/**
 * A labeled field whose value opens a BottomSheet list of options — the
 * phone-native replacement for a desktop dropdown. Generic; used for the
 * vehicle and avg-speed pickers in the flow sheet.
 */
export default function SheetSelect({ label, value, options, placeholder = 'Select', sheetTitle, onChange, renderValue }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.id === value)
  return (
    <div className="m-field">
      <label className="m-field-label">{label}</label>
      <button type="button" className="m-input m-pick" onClick={() => setOpen(true)}>
        <span className="m-pick-val">
          {renderValue ? renderValue(selected)
            : selected ? (<>{selected.dot && <span className="m-dot" style={{ background: selected.dot }} />}{selected.label}</>)
            : <span className="m-pick-ph">{placeholder}</span>}
        </span>
        <span className="m-pick-chev" aria-hidden>⌄</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={sheetTitle ?? label}>
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            className={`m-sheet-opt${o.id === value ? ' is-sel' : ''}`}
            onClick={() => { onChange(o.id); setOpen(false) }}
          >
            {o.dot && <span className="m-dot" style={{ background: o.dot }} />}
            <span className="m-sheet-opt-main">
              {o.label}
              {o.sub && <span className="m-sheet-opt-sub">{o.sub}</span>}
            </span>
            {o.id === value && <span className="m-sheet-opt-check" aria-hidden>✓</span>}
          </button>
        ))}
      </BottomSheet>
    </div>
  )
}
