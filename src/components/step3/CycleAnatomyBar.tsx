'use client'

import type { CycleBreakdown } from '@/src/calc/types'

interface Props {
  breakdown: CycleBreakdown
}

function fmt(sec: number): string {
  return `${sec.toFixed(1)}s`
}

/**
 * 4-px stacked horizontal bar showing the cycle's component shares.
 * Click is owned by the parent button; this component is decorative
 * (each segment carries a native title tooltip with the exact seconds).
 *
 * Segments (left → right):
 *   1. Round-trip travel  — color: --info
 *   2. Transfer (load + unload) — color: --text-secondary
 *   3. Lift                — color: --warn
 *   4. Custom delay        — color: --accent (loud — engineer overrides)
 *
 * Zero-width segments are omitted so the bar never shows imperceptible slivers.
 */
export default function CycleAnatomyBar({ breakdown }: Props) {
  const travelSec = breakdown.travelLoadedSec + breakdown.travelEmptySec
  const transferSec = breakdown.loadSec + breakdown.unloadSec
  const segments: Array<{ label: string; sec: number; cls: string; tooltip: string }> = [
    {
      label: 'travel',
      sec: travelSec,
      cls: 'cab-travel',
      tooltip: `Round-trip travel: ${fmt(travelSec)} (loaded ${fmt(breakdown.travelLoadedSec)} + empty ${fmt(breakdown.travelEmptySec)})`,
    },
    {
      label: 'transfer',
      sec: transferSec,
      cls: 'cab-transfer',
      tooltip: `${breakdown.methodName} load + unload: ${fmt(transferSec)}`,
    },
    {
      label: 'lift',
      sec: breakdown.liftTimeSec,
      cls: 'cab-lift',
      tooltip:
        breakdown.liftHeightFt > 0
          ? `Lift (${breakdown.liftHeightFt.toFixed(1)} ft): ${fmt(breakdown.liftTimeSec)}`
          : `Lift: ${fmt(breakdown.liftTimeSec)}`,
    },
    {
      label: 'delay',
      sec: breakdown.customDelaySec,
      cls: 'cab-delay',
      tooltip: `Custom delay: ${fmt(breakdown.customDelaySec)}`,
    },
  ]

  const total = breakdown.totalSec
  if (total <= 0) return null

  return (
    <div className="cycle-anatomy-bar" aria-hidden="true">
      {segments
        .filter(s => s.sec > 0)
        .map(s => (
          <span
            key={s.label}
            className={`cab-seg ${s.cls}`}
            style={{ flexGrow: s.sec / total }}
            title={s.tooltip}
          />
        ))}
    </div>
  )
}
