// src/lib/useDismiss.ts — close a popover or window on Escape and, optionally, on a press outside
// `inside` (its element). The handler is read through a ref, so a parent's inline callback does not
// re-subscribe the listeners on every render.

import { useEffect, useRef, type RefObject } from 'react'

export function useDismiss(onClose: () => void, inside?: RefObject<HTMLElement | null>): void {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    const out = (e: PointerEvent) => { if (inside?.current && !inside.current.contains(e.target as Node)) close.current() }
    window.addEventListener('keydown', esc)
    if (inside) window.addEventListener('pointerdown', out)
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('pointerdown', out) }
  }, [inside])
}
