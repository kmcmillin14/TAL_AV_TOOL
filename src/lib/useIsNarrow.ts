'use client'

import { useEffect, useState } from 'react'

/**
 * Track a `max-width` media query — the single switch between each step's
 * desktop layout and its phone-native (list→sheet) layout. Defaults to the
 * app-wide 700px mobile breakpoint. SSR-safe: starts false, resolves on mount.
 */
export function useIsNarrow(px = 700): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [px])
  return narrow
}
