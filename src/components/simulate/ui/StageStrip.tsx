'use client'

// The stage strip (owner, 2026-11-18/19): Overview · Setup · Layout · Connect · Chargers · Simulate ·
// Results — one slim row and one way forward. Each stage shows one mark (its number, or a tick when done);
// only the open stage's status is shown, beside a single Next button. Any stage can still be opened.

import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'

export type Stage = 'overview' | 'setup' | 'layout' | 'connect' | 'chargers' | 'simulate' | 'results'

export interface StageInfo {
  id: Stage
  label: string
  /** The open stage's one line: what it holds now. */
  status: string
  done?: boolean
  /** Why it cannot open yet (Simulate, Results); pressing it opens `onBlocked` instead. */
  blocked?: string
}

export default function StageStrip({ stages, value, onChange, onBlocked, then }: {
  stages: StageInfo[]
  value: Stage
  onChange: (s: Stage) => void
  onBlocked: () => void
  /** Where Next goes after the last stage — the next step of the workflow. */
  then: { label: string; href: string }
}) {
  const at = stages.findIndex(s => s.id === value)
  const current = stages[at], next = stages[at + 1]
  const go = (s: StageInfo) => (s.blocked ? onBlocked() : onChange(s.id))
  return (
    <nav className="sim-stages" aria-label="Fleet size verification stages">
      <ol>
        {stages.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === value ? 'step' : undefined} title={s.blocked ?? s.status}
              className={`sim-stage-btn${s.id === value ? ' is-on' : ''}${s.done ? ' is-done' : ''}${s.blocked ? ' is-blocked' : ''}`}
              onClick={() => go(s)}>
              <span className="sim-stage-n" aria-hidden>{s.done ? <Icon name="check" size={11} /> : i + 1}</span>{s.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="sim-stage-now" aria-live="polite">
        <span className="sim-stage-status">{current?.status}</span>
        {/* One way on: the next stage, or — when it cannot open (the run needs a valid layout) — the next step
            of the workflow, since verification is optional. A blocked stage is still a click away in the row. */}
        {next && !next.blocked ? (
          <button type="button" className="btn btn-sm primary" title={next.blocked} onClick={() => go(next)}>
            Next: {next.label} <Icon name="arrowR" size={12} />
          </button>
        ) : (
          <Link href={then.href} className="btn btn-sm primary">Next: {then.label} <Icon name="arrowR" size={12} /></Link>
        )}
      </div>
    </nav>
  )
}
