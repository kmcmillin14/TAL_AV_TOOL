'use client'

// The steps of fleet size verification, always in view at the top of the one sidebar (owner, 2026-11-26): Pallets & vehicles · Routes ·
// Points · Flows · Simulate · Data. Each shows its progress — green done, amber started, grey not yet; when
// every step before Simulate is green, it is ready to simulate. The open step shows its sub-tasks one level
// down (leading lines) and one sentence of what to do; the one Next sits at the foot. Any step opens with a
// click (Routes and Points in either order); the order is suggested, never locked. « collapses the sidebar
// to an icon rail (remembered in this browser), giving the map the room.

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import Icon from '@/src/design-system/components/Icon'

export type Stage = 'vehicles' | 'routes' | 'points' | 'flows' | 'simulate' | 'data'

export interface StageInfo {
  id: Stage
  label: string
  /** The rail's icon. */
  icon: Parameters<typeof Icon>[0]['name']
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
  /** Sub-tasks, each with its own progress (Pallets & vehicles: payloads, vehicle types; Points: stations,
   *  chargers and parking). */
  subs?: { label: string; status: string; done: boolean; optional?: boolean }[]
}

const go = (s: StageInfo, p: Pick<StepsProps, 'onChange' | 'onBlocked'>) => (s.blocked ? p.onBlocked() : p.onChange(s.id))
const tone = (s: { done?: boolean; started?: boolean }) => (s.done ? ' is-done' : s.started ? ' is-started' : '')
const KEY = 'sim-steps-collapsed'

export interface StepsProps {
  stages: StageInfo[]
  value: Stage
  onChange: (s: Stage) => void
  onBlocked: () => void
  /** Where Next goes after the last step — the next step of the workflow. */
  then: { label: string; href: string }
}

/** The steps, always in view (owner, 2026-11-26): each one line — its icon, name and status. `rail`: icons
 *  only (the sidebar folded with «). */
export function Tracker(p: StepsProps & { mode: 'list' | 'rail' }) {
  return (
    <ol className={`sim-guide is-${p.mode}`} aria-label="Steps">
      {p.stages.map(s => (
        <li key={s.id}>
          <button type="button" aria-label={s.label} aria-current={s.id === p.value ? 'step' : undefined} title={p.mode === 'list' ? s.blocked : `${s.label} · ${s.status}`}
            className={`sim-guide-step${s.id === p.value ? ' is-on' : ''}${tone(s)}${s.blocked ? ' is-blocked' : ''}`}
            onClick={() => go(s, p)}>
            <span className="sim-guide-n" aria-hidden><Icon name={s.icon} size={14} />{s.done && <i className="sim-guide-tick"><Icon name="check" size={8} /></i>}</span>
            {p.mode === 'list' && <><span className="sim-guide-label">{s.label}</span><span className="sim-guide-status">{s.status}</span></>}
          </button>
        </li>
      ))}
    </ol>
  )
}

/** The open step at the top of the detail card: its sub-tasks, and what to do while it is not done. */
function StepHead({ s }: { s: StageInfo }) {
  if (!s.subs && s.done !== false) return null
  return (
    <div className="sim-stephead">
      {s.subs && (
        <ul className="sim-guide-subs">
          {s.subs.map(t => (
            <li key={t.label} className={tone(t)}>
              <span className="sim-guide-dot" aria-hidden>{t.done && <Icon name="check" size={9} />}</span>
              <span className="sim-guide-sublabel">{t.label}</span><span className="sim-guide-status">{t.status}</span>
            </li>
          ))}
        </ul>
      )}
      {s.done === false && <p className="sim-guide-lead">{s.lead}</p>}
    </div>
  )
}

/** The one way on: the next step, or — when it cannot open — the next step of the workflow. The screen's one
 *  red button only once the open step is done (or optional). */
export function NextButton(p: StepsProps & { short?: boolean }) {
  const at = p.stages.findIndex(s => s.id === p.value), here = p.stages[at], next = p.stages[at + 1]
  const cls = `btn ${here?.done || here?.optional || here?.done === undefined ? 'primary' : 'ghost'}`
  const label = next && !next.blocked ? next.label : p.then.label
  const body = <>{!p.short && <span>Next: {label}</span>} <Icon name="arrowR" size={13} /></>
  return next && !next.blocked
    ? <button type="button" className={cls} onClick={() => go(next, p)} title={`Next: ${label}`}>{body}</button>
    : <Link href={p.then.href} className={cls} title={`Next: ${label}`}>{body}</Link>
}

/** The one sidebar (owner, 2026-11-26): two cards, clearly apart — the steps (always in view) with their one
 *  Next, tinted; then the detail, white: the open step's sub-tasks and its content, or the selection's card.
 *  « folds it to a rail of step icons (remembered in this browser); a card opens it again. */
export function SimSidebar({ steps, card, children }: { steps: StepsProps; card: boolean; children: ReactNode }) {
  // Remembered per browser; storage can be missing or refuse (private windows). The page renders on the
  // client only (the project is in this browser), so reading it at first render is safe.
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const toggle = () => setFolded(c => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* none */ } return !c })
  const rail = folded && !card
  const here = steps.stages.find(s => s.id === steps.value)
  return (
    <aside className={`sim-pane${rail ? ' is-rail' : ''}`} aria-label="Fleet size verification">
      <div className="sim-pane-top">
        <Tracker {...steps} mode={rail ? 'rail' : 'list'} />
        {!card && <button type="button" className="sim-steps-toggle" onClick={toggle} aria-expanded={!rail} title={rail ? 'Show the panel' : 'Fold to icons'}>{rail ? '»' : '«'}</button>}
        <div className="sim-guide-next"><NextButton {...steps} short={rail} /></div>
      </div>
      {!rail && (
        <div className="sim-pane-body">
          {!card && here && <StepHead s={here} />}
          {children}
        </div>
      )}
    </aside>
  )
}
