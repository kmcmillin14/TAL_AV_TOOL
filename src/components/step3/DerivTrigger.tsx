'use client'

import { useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import type { Derivation } from '@/src/lib/derivation'
import DerivationPanel from './DerivationPanel'

interface Props {
  /** Lazy — built only when the panel opens, not for every row on every render. */
  derivation: () => Derivation
  route?: string
  disabled?: boolean
  /** Button class — defaults to the engine-table formula button. */
  className?: string
  label?: string
}

/** A self-contained "show the math" button that toggles a {@link DerivationPanel}
 *  anchored to itself. Shared by every Fleet Engine tier (Flows, Charging,
 *  Buffer) so the trigger + panel wiring lives in one place. */
export default function DerivTrigger({
  derivation, route, disabled, className = 'flow-act-btn flow-formula', label = 'Show the fleet math',
}: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={disabled ? undefined : label}
      >
        <Icon name="formula" size={14} />
      </button>
      {open && (
        <DerivationPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} derivation={derivation()} route={route} />
      )}
    </>
  )
}
