'use client'

import { useEffect, useRef } from 'react'
import type { CycleBreakdown } from '@/src/calc/types'

interface Props {
  breakdown: CycleBreakdown
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
}

function fmt(sec: number): string {
  return `${sec.toFixed(1)}s`
}

export default function CyclePopover({ breakdown, onClose, triggerRef }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose, triggerRef])

  const method = breakdown.methodName || 'Transfer'
  const liftLabel =
    breakdown.liftHeightFt > 0
      ? `${method} — lift (${breakdown.liftHeightFt.toFixed(1)} ft)`
      : `${method} — lift`

  return (
    <div ref={popoverRef} className="cycle-popover" role="dialog" aria-label="Cycle breakdown">
      <div className="cycle-popover-title">Cycle breakdown</div>
      <dl className="cycle-popover-list">
        <div className="cycle-popover-row">
          <dt>Travel loaded</dt>
          <dd className="mono">{fmt(breakdown.travelLoadedSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Travel empty</dt>
          <dd className="mono">{fmt(breakdown.travelEmptySec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>{method} — load</dt>
          <dd className="mono">{fmt(breakdown.loadSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>{method} — unload</dt>
          <dd className="mono">{fmt(breakdown.unloadSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>{liftLabel}</dt>
          <dd className="mono">{fmt(breakdown.liftTimeSec)}</dd>
        </div>
        <div className="cycle-popover-row">
          <dt>Custom delay</dt>
          <dd className="mono">{fmt(breakdown.customDelaySec)}</dd>
        </div>
        <div className="cycle-popover-row total">
          <dt>Total</dt>
          <dd className="mono">{fmt(breakdown.totalSec)}</dd>
        </div>
      </dl>
    </div>
  )
}
