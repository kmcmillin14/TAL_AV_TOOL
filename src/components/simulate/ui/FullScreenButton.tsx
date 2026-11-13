'use client'

// Full screen for the whole Simulate page (owner, 2026-11-13: next to zoom). It fills the screen with the
// page's `.sim-shell`; Esc or the button leaves it.

import { useEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'

export default function FullScreenButton() {
  const self = useRef<HTMLButtonElement>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement && document.fullscreenElement.classList.contains('sim-shell'))
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void self.current?.closest<HTMLElement>('.sim-shell')?.requestFullscreen?.().catch(() => {})
  }
  return (
    <button type="button" ref={self} className="sim-full-btn" aria-pressed={full} onClick={toggle}
      aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (Esc)' : 'Full screen'}>
      <Icon name={full ? 'collapse' : 'expand'} size={14} />
    </button>
  )
}
