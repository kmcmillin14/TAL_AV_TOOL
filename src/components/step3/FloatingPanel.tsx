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

  const MARGIN = 8
  const GAP = 6
  // Vertical placement: open downward, but flip up when there isn't room below
  // and there's more room above. Always clamp to the viewport and scroll if the
  // content is taller than the available space (so a tall panel never runs off).
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN
  const spaceAbove = rect.top - MARGIN
  const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
  const vertical: CSSProperties = openUp
    ? { bottom: window.innerHeight - rect.top + GAP, maxHeight: spaceAbove - GAP }
    : { top: rect.bottom + GAP, maxHeight: spaceBelow - GAP }

  const horizontal: CSSProperties =
    align === 'right'
      ? { right: Math.max(MARGIN, window.innerWidth - rect.right) }
      : { left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - EST_WIDTH)) }

  const style: CSSProperties = {
    position: 'fixed',
    zIndex: 200,
    overflowY: 'auto',
    ...vertical,
    ...horizontal,
  }

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
