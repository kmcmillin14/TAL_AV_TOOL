'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  align?: 'left' | 'right'
  className?: string
  children: ReactNode
}

const EST_WIDTH = 272

/**
 * Small popover anchored to a trigger element. Uses `position: fixed` computed
 * from the anchor's rect so it is NOT clipped by the table cell's
 * `overflow: hidden` (fixed elements ignore overflow ancestors). Closes on
 * outside-click, Escape, scroll, or resize — same handler shape as CyclePopover.
 */
export default function FloatingPanel({ anchorRef, open, onClose, align = 'left', className, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMove = () => onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null
  const rect = anchorRef.current?.getBoundingClientRect()
  if (!rect) return null

  const style: CSSProperties =
    align === 'right'
      ? { position: 'fixed', top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right), zIndex: 200 }
      : { position: 'fixed', top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - EST_WIDTH)), zIndex: 200 }

  return (
    <div
      ref={panelRef}
      className={`float-panel${className ? ' ' + className : ''}`}
      style={style}
      role="dialog"
    >
      {children}
    </div>
  )
}
