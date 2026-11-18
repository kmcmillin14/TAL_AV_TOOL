'use client'

// The stage strip (owner, 2026-11-18): Setup · Layout · Connect · Chargers · Simulate · Results, in order,
// each with a one-line status — what is done and what is next, without locking the order. It replaces the
// Layout · Sim · Data tabs and Layout's Edit · Flows · Validation sub-tabs.

export type Stage = 'setup' | 'layout' | 'connect' | 'chargers' | 'simulate' | 'results'

export interface StageInfo {
  id: Stage
  label: string
  /** One line under the label: what this stage holds now. */
  status: string
  done?: boolean
  /** Why it cannot open yet (Simulate, Results); pressing it opens `onBlocked` instead. */
  blocked?: string
}

export default function StageStrip({ stages, value, onChange, onBlocked }: {
  stages: StageInfo[]
  value: Stage
  onChange: (s: Stage) => void
  onBlocked: () => void
}) {
  return (
    <nav className="sim-stages" aria-label="Fleet size verification stages">
      <ol>
        {stages.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === value ? 'step' : undefined} title={s.blocked}
              className={`sim-stage-btn${s.id === value ? ' is-on' : ''}${s.done ? ' is-done' : ''}${s.blocked ? ' is-blocked' : ''}`}
              onClick={() => (s.blocked ? onBlocked() : onChange(s.id))}>
              <span className="sim-stage-name"><span className="sim-stage-n" aria-hidden>{s.done ? '✓' : i + 1}</span>{s.label}</span>
              <span className="sim-stage-status">{s.status}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
