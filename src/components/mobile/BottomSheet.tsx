'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Shared slide-up overlay for phone-native pickers/editors. Rendered through a
 * portal to <body> so it escapes any `overflow:hidden` ancestor; closes on
 * scrim tap or Escape. The slide animation is CSS and respects
 * prefers-reduced-motion. Used by SheetSelect and the Step-3 pickers.
 */
export default function BottomSheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Lock body scroll while the sheet is up.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="m-sheet-scrim" onClick={onClose} role="presentation">
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="m-sheet-grip" aria-hidden />
        {title && <div className="m-sheet-title">{title}</div>}
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
