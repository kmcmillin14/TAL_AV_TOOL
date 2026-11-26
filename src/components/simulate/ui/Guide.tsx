'use client'

// The steps of fleet size verification as a left sidebar (owner, 2026-11-26): Pallets & vehicles · Routes ·
// Points · Flows · Simulate · Data. Each shows its progress — green done, amber started, grey not yet; when
// every step before Simulate is green, it is ready to simulate. The open step shows its sub-tasks one level
// down (leading lines) and one sentence of what to do; the one Next sits at the foot. Any step opens with a
// click (Routes and Points in either order); the order is suggested, never locked. « collapses the sidebar
// to an icon rail (remembered in this browser), giving the map the room.

import Link from 'next/link'
import { useState } from 'react'
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
const KEY = 'sim-steps-collapsed'

/** The sidebar: the steps, the open one's sub-tasks and sentence, and the one Next. */
export default function GuideSidebar(p: Props) {
  // Remembered per browser; storage can be missing or refuse (private windows). The page renders on the
  // client only (the project is in this browser), so reading it at first render is safe.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const toggle = () => setCollapsed(c => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* none */ } return !c })
  const at = p.stages.findIndex(s => s.id === p.value), here = p.stages[at], next = p.stages[at + 1]
  // Next is the screen's one red button only once the open step is done (or optional).
  const cls = `btn ${here?.done || here?.optional || here?.done === undefined ? 'primary' : 'ghost'}`
  return (
    <aside className={`sim-steps${collapsed ? ' is-collapsed' : ''}`} aria-label="Fleet size verification steps">
      <button type="button" className="sim-steps-toggle" onClick={toggle} aria-expanded={!collapsed}
        title={collapsed ? 'Show the steps' : 'Collapse to icons'}>{collapsed ? '»' : '«'}</button>
      <ol className="sim-guide">
        {p.stages.map(s => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === p.value ? 'step' : undefined} title={collapsed ? `${s.label} · ${s.status}` : s.blocked}
              className={`sim-guide-step${s.id === p.value ? ' is-on' : ''}${tone(s)}${s.blocked ? ' is-blocked' : ''}`}
              onClick={() => go(s, p)}>
              <span className="sim-guide-n" aria-hidden><Icon name={s.icon} size={15} />{s.done && <i className="sim-guide-tick"><Icon name="check" size={8} /></i>}</span>
              <span className="sim-guide-text">
                <span className="sim-guide-label">{s.label}</span>
                <span className="sim-guide-status">{s.status}</span>
              </span>
            </button>
            {s.id === p.value && !collapsed && (
              <>
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
                <p className="sim-guide-lead">{s.lead}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="sim-guide-next">
        {next && !next.blocked ? (
          <button type="button" className={cls} onClick={() => go(next, p)} title={`Next: ${next.label}`}>
            <span className="sim-guide-nexttext">Next: {next.label}</span> <Icon name="arrowR" size={13} />
          </button>
        ) : (
          <Link href={p.then.href} className={cls} title={`Next: ${p.then.label}`}>
            <span className="sim-guide-nexttext">Next: {p.then.label}</span> <Icon name="arrowR" size={13} />
          </Link>
        )}
      </div>
    </aside>
  )
}
