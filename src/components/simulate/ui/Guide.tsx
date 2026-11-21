'use client'

// The guide (owner, 2026-11-21: "a window to the right should give clear guidelines"): the steps of fleet
// size verification as one compact list at the top of the side panel — each a line with one mark (its
// number, or a tick when done) and, for the open step, its status — and one Next at the panel's foot.
// Any step opens with a click; the order is shown, never locked.

import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'

export type Stage = 'drawing' | 'vehicles' | 'payloads' | 'layout' | 'connect' | 'chargers' | 'simulate' | 'results'

export interface StageInfo {
  id: Stage
  label: string
  /** The step's one line: what it holds now. */
  status: string
  /** What to do here, in one sentence — shown under the open step. */
  lead: string
  done?: boolean
  /** Optional (the drawing): Next stays the way on whether or not it is done. */
  optional?: boolean
  /** Why it cannot open yet (the run's steps); pressing it opens `onBlocked` instead. */
  blocked?: string
}

interface Props {
  stages: StageInfo[]
  value: Stage
  onChange: (s: Stage) => void
  onBlocked: () => void
  /** Where Next goes after the last step — the next step of the workflow. */
  then: { label: string; href: string }
}

const go = (s: StageInfo, p: Pick<Props, 'onChange' | 'onBlocked'>) => (s.blocked ? p.onBlocked() : p.onChange(s.id))

/** The steps, top of the side panel. */
export function GuideList(p: Props) {
  return (
    <nav className="sim-guide" aria-label="Fleet size verification steps">
      <ol>
        {p.stages.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === p.value ? 'step' : undefined} title={s.blocked}
              className={`sim-guide-step${s.id === p.value ? ' is-on' : ''}${s.done ? ' is-done' : ''}${s.blocked ? ' is-blocked' : ''}`}
              onClick={() => go(s, p)}>
              <span className="sim-guide-n" aria-hidden>{s.done ? <Icon name="check" size={11} /> : i + 1}</span>
              <span className="sim-guide-label">{s.label}</span>
              <span className="sim-guide-status">{s.status}</span>
            </button>
            {s.id === p.value && <p className="sim-guide-lead">{s.lead}</p>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The one way on, foot of the side panel: the next step, or — when it cannot open (the run needs a valid
 *  layout) — the next step of the workflow, since verification is optional. It is the screen's one red
 *  button only once the open step is done; until then the step's own action is, and Next stays quiet. */
export function GuideNext(p: Props) {
  const at = p.stages.findIndex(s => s.id === p.value), here = p.stages[at], next = p.stages[at + 1]
  const cls = `btn ${here?.done || here?.optional || here?.done === undefined ? 'primary' : 'ghost'}`
  return (
    <div className="sim-guide-next">
      {next && !next.blocked ? (
        <button type="button" className={cls} onClick={() => go(next, p)}>Next: {next.label} <Icon name="arrowR" size={13} /></button>
      ) : (
        <Link href={p.then.href} className={cls}>Next: {p.then.label} <Icon name="arrowR" size={13} /></Link>
      )}
    </div>
  )
}
