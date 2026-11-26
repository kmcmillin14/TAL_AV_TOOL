'use client'

// The steps of fleet size verification, always in view at the top of the one sidebar (owner, 2026-11-26): Pallets & vehicles · Routes ·
// Points · Flows · Simulate · Data. Each shows its progress — green done, amber started, grey not yet; when
// every step before Simulate is green, it is ready to simulate. The open step shows its sub-steps nested
// under it in the list, and one sentence of what to do in the detail card; the one Next sits at the foot. Any step opens with a
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

/** The steps, always in view (owner, 2026-11-26): one symmetric grid — number · name · status · progress dot,
 *  every dot in one column — with the open step's sub-steps nested under it (2.1, 2.2 …) on a leading line.
 *  `rail`: icons only (the sidebar folded with «). */
export function Tracker(p: StepsProps & { mode: 'list' | 'rail' }) {
  const list = p.mode === 'list'
  return (
    <ol className={`sim-guide is-${p.mode}`} aria-label="Steps">
      {p.stages.map((s, i) => (
        <li key={s.id}>
          <button type="button" aria-label={s.label} aria-current={s.id === p.value ? 'step' : undefined} title={list ? s.blocked : `${s.label} · ${s.status}`}
            className={`sim-guide-step${s.id === p.value ? ' is-on' : ''}${tone(s)}${s.blocked ? ' is-blocked' : ''}`}
            onClick={() => go(s, p)}>
            {list ? (
              <><span className="sim-guide-num">{String(i + 1).padStart(2, '0')}</span><span className="sim-guide-label">{s.label}</span>
                <span className="sim-guide-status">{s.status}</span><i className="sim-guide-pip" aria-hidden /></>
            ) : (
              <span className="sim-guide-n" aria-hidden><Icon name={s.icon} size={14} />{s.done && <i className="sim-guide-tick"><Icon name="check" size={8} /></i>}</span>
            )}
          </button>
          {list && s.id === p.value && s.subs && (
            <ul className="sim-guide-subs" aria-label={`${s.label} sub-steps`}>
              {s.subs.map((t, j) => (
                <li key={t.label} className={`sim-guide-sub${tone(t)}`} title={`${t.label} · ${t.status}`}>
                  <span className="sim-guide-num">{i + 1}.{j + 1}</span><span className="sim-guide-label">{t.label}</span>
                  <span className="sim-guide-status">{t.status}</span><i className="sim-guide-pip" aria-hidden />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}

/** What to do in the open step, while it is not done — at the top of the detail card. */
function StepHead({ s }: { s: StageInfo }) {
  return s.done === false ? <p className="sim-guide-lead sim-stephead">{s.lead}</p> : null
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
        <div className="sim-steps-head">
          {!rail && <span className="eh-eyebrow mono">Steps · {steps.stages.filter(s => s.done).length} of {steps.stages.length} done</span>}
          {!card && <button type="button" className="sim-steps-toggle" onClick={toggle} aria-expanded={!rail} title={rail ? 'Show the panel' : 'Fold to icons'}>{rail ? '»' : '«'}</button>}
        </div>
        <Tracker {...steps} mode={rail ? 'rail' : 'list'} />
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
