'use client'

// The inspector's building blocks (Milestone 6, spec §5.7a): a header with the object's name and its
// actions, a summary card with the few numbers that matter, and collapsible sections (Settings,
// Advanced) — the same pieces for every object, so every panel reads the same way.

import type { ReactNode } from 'react'
import type { SimPointType } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'
import { SIM_FIELD_HELP } from '@/src/content/help'
import type { FieldState } from '@/src/lib/simFields'

export function Inspector({ title, icon, onCopy, onDelete, children }: {
  title: string; icon?: SimPointType; onCopy?: () => void; onDelete?: () => void; children: ReactNode
}) {
  return (
    <aside className="sim-panel" aria-label={title}>
      <div className="sim-panel-head">
        {icon && icon !== 'junction' && <Icon name={icon} size={16} />}
        <h3>{title}</h3>
        {onCopy && <button type="button" className="icon-btn" aria-label="Duplicate" title="Duplicate (⌘C ⌘V)" onClick={onCopy}><Icon name="copy" size={14} /></button>}
        {onDelete && <button type="button" className="icon-btn" aria-label="Delete" title="Delete (⌫)" onClick={onDelete}><Icon name="trash" size={14} /></button>}
      </div>
      {children}
    </aside>
  )
}

/** Up to four numbers that matter for this object, in a quiet card. */
export function Summary({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="sim-summary">
      {items.slice(0, 4).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}
    </dl>
  )
}

/** A collapsible section (Settings open, Advanced closed by default). */
export function Section({ title, open, count, children }: { title: string; open?: boolean; count?: number; children: ReactNode }) {
  return (
    <details className="sim-section" open={open}>
      <summary>{title}{count ? <span className="sim-section-count"><i className="sim-odot" />{count}</span> : null}</summary>
      <div className="sim-section-body">{children}</div>
    </details>
  )
}

const ARROWS = [{ deg: 270, label: '↑' }, { deg: 90, label: '↓' }, { deg: 180, label: '←' }, { deg: 0, label: '→' }]

/** Approach direction as four arrows (and "Along the route"): the direction a vehicle faces as it
 *  enters the point. Same source chip, reset and help as every field. */
export function ApproachArrows({ state, onChange }: { state: FieldState; onChange: (deg: number | undefined) => void }) {
  const v = typeof state.value === 'number' ? state.value : null
  const overridden = state.source === 'Override'
  return (
    <div className={`sim-frow${overridden ? ' is-override' : ''}`}>
      <div className="sim-frow-head">
        <span className="sim-frow-label">{overridden && <i className="sim-odot" aria-label="Overridden" />}Approach direction</span>
        <span className={`sim-src src-${state.source.replace(' ', '').toLowerCase()}`}>{state.source}</span>
      </div>
      <div className="seg-toggle sim-seg-toggle sim-arrows" role="radiogroup" aria-label="Approach direction">
        <button type="button" role="radio" aria-checked={v == null} className={`seg-btn${v == null ? ' on' : ''}`} onClick={() => onChange(undefined)}>Along route</button>
        {ARROWS.map(a => (
          <button key={a.deg} type="button" role="radio" aria-checked={v === a.deg} aria-label={`Enter heading ${a.label}`}
            className={`seg-btn${v === a.deg ? ' on' : ''}`} onClick={() => onChange(a.deg)}>{a.label}</button>
        ))}
      </div>
      {v != null && !ARROWS.some(a => a.deg === v) && <p className="sim-frow-help">Set to {Math.round(v)}° in the project file.</p>}
      <p className="sim-frow-help">{SIM_FIELD_HELP['point.approachHeadingDeg']}</p>
    </div>
  )
}
