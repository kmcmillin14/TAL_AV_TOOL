'use client'

// The path editor's selection bar (owner, 2026-11-16): floated above the selected path(s) on the canvas
// — direction (the icon turns with the path), 1 or 2 lanes, length and width, delete.

import { highwayLanes } from '@/src/calc/sim/highways'
import type { SimHighway } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'

const DIRS: { id: SimHighway['dir']; label: string; d: string; turn: number }[] = [
  { id: 'two', label: 'Two-way', d: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4', turn: 0 },
  { id: 'ab', label: 'One-way', d: 'M4 12h16M15 7l5 5-5 5', turn: 0 },
  { id: 'ba', label: 'One-way, the other way', d: 'M4 12h16M15 7l5 5-5 5', turn: 180 },
]

export default function PathBar({ paths, fmtLen, onDirection, onLanes, onDelete }: {
  paths: SimHighway[]
  fmtLen: (ft: number) => string
  onDirection: (dir: SimHighway['dir']) => void
  onLanes: (lanes: 1 | 2) => void
  onDelete: () => void
}) {
  const [first] = paths
  const dir = paths.every(h => h.dir === first.dir) ? first.dir : null
  const lanes = paths.every(h => highwayLanes(h) === highwayLanes(first)) ? highwayLanes(first) : null
  const total = paths.reduce((t, h) => t + h.lengthFt, 0)
  return (
    <>
      <div className="seg" role="group" aria-label="Direction">
        {DIRS.map(o => (
          <button key={o.id} type="button" className={dir === o.id ? 'on' : ''} aria-pressed={dir === o.id} title={`${o.label} (D)`} aria-label={o.label} onClick={() => onDirection(o.id)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: `rotate(${first.angleDeg + o.turn}deg)` }}><path d={o.d} /></svg>
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Lanes">
        {([1, 2] as const).map(n => (
          <button key={n} type="button" className={lanes === n ? 'on' : ''} aria-pressed={lanes === n} onClick={() => onLanes(n)}
            title={n === 2 ? 'Two-way, a lane each way — no passing' : 'One lane: shared two-way, or one-way'}>{n === 1 ? '1 lane' : '2 lanes'}</button>
        ))}
      </div>
      <span className="sim-selbar-read">{paths.length === 1 ? `${fmtLen(total)} · ${fmtLen(first.widthFt)} wide` : `${paths.length} paths · ${fmtLen(total)}`}</span>
      <button type="button" className="sim-selbar-del" onClick={onDelete} title="Delete (Del)" aria-label="Delete"><Icon name="trash" size={14} /></button>
    </>
  )
}
