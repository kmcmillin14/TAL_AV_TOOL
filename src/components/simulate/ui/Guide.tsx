'use client'

// The guide (owner, 2026-11-21/22): the steps of fleet size verification as one compact list at the top of
// the side panel — Layout (scale, vehicle types, payloads), Pick and drop points, Routes, Flows, Chargers,
// Simulate, Data. Each shows its progress: green when done, amber when started, grey when not; when every
// step before Simulate is green, it is ready to simulate. The open step shows its sub-tasks and one sentence
// of what to do; one Next sits at the panel's foot. Any step opens with a click; the order is shown, never
// locked.

import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'

export type Stage = 'layout' | 'points' | 'routes' | 'flows' | 'chargers' | 'simulate' | 'data'

export interface StageInfo {
  id: Stage
  label: string
  /** The step's one line: what it holds now. */
  status: string
  /** What to do here, in one sentence — shown under the open step. */
  lead: string
  done?: boolean
  /** Started but not done (amber). */
  started?: boolean
  /** Next stays the way on whether or not it is done. */
  optional?: boolean
  /** Why it cannot open yet (the run's steps); pressing it opens `onBlocked` instead. */
  blocked?: string
  /** Sub-tasks, each with its own progress (Layout: scale, vehicle types, payloads). */
  subs?: { label: string; status: string; done: boolean; optional?: boolean }[]
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
const tone = (s: { done?: boolean; started?: boolean }) => (s.done ? ' is-done' : s.started ? ' is-started' : '')

/** The steps, top of the side panel. */
export function GuideList(p: Props) {
  return (
    <nav className="sim-guide" aria-label="Fleet size verification steps">
      <ol>
        {p.stages.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === p.value ? 'step' : undefined} title={s.blocked}
              className={`sim-guide-step${s.id === p.value ? ' is-on' : ''}${tone(s)}${s.blocked ? ' is-blocked' : ''}`}
              onClick={() => go(s, p)}>
              <span className="sim-guide-n" aria-hidden>{s.done ? <Icon name="check" size={11} /> : i + 1}</span>
              <span className="sim-guide-label">{s.label}</span>
              <span className="sim-guide-status">{s.status}</span>
            </button>
            {s.id === p.value && (
              <>
                {s.subs && (
                  <ul className="sim-guide-subs">
                    {s.subs.map(t => (
                      <li key={t.label} className={tone(t)}>
                        <span className="sim-guide-dot" aria-hidden>{t.done && <Icon name="check" size={9} />}</span>
                        {t.label}<span className="sim-guide-status">{t.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="sim-guide-lead">{s.lead}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The one way on, foot of the side panel: the next step, or — when it cannot open (the run needs a valid
 *  layout) — the next step of the workflow, since verification is optional. It is the screen's one red
 *  button only once the open step is done (or optional); until then the step's own action is. */
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
