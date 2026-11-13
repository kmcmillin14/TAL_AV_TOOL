'use client'

// A ⋮ button that opens a small panel of settings for the tile it sits on (owner, 2026-11-13: "kebab
// menu to edit"). Escape or a press outside closes it.

import { useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '@/src/lib/useDismiss'

export default function KebabMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  return (
    <div className="sim-kebab" ref={box}>
      <button type="button" className="sim-kebab-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && <KebabPanel box={box} label={label} onClose={() => setOpen(false)}>{children}</KebabPanel>}
    </div>
  )
}

function KebabPanel({ box, label, onClose, children }: { box: React.RefObject<HTMLDivElement | null>; label: string; onClose: () => void; children: ReactNode }) {
  useDismiss(onClose, box)
  return <div className="sim-kebab-pop" role="dialog" aria-label={label}>{children}</div>
}
