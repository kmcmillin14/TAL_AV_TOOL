'use client'

// The drill-down card's building blocks (owner, 2026-11-22 — Flighty-style): Back, the name big with one
// status chip, a line of context, up to three big-number tiles (dashed ones are typed into in place), and
// the rest in folds that open one at a time. Everything closed fits the detail card without scrolling.

import type { ReactNode, Ref } from 'react'
import type { SimPointType } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'

export type Tone = 'good' | 'warn' | 'bad' | 'sel' | 'info' | 'mute'

/** The folds of one card share this name: opening one closes the others (an exclusive `<details>` group). */
const FOLDS = 'sim-card-fold'

export function Inspector({ title, chip, sub, icon, back, onBack, onCopy, onDelete, children }: {
  title: string; chip?: { label: string; tone: Tone } | null; sub?: ReactNode; icon?: SimPointType
  /** Where Back goes ("Pick and drop points"); Back clears the selection. */
  back?: string; onBack?: () => void
  onCopy?: () => void; onDelete?: () => void; children: ReactNode
}) {
  return (
    <aside className="sim-panel sim-dcard" aria-label={title}>
      <div className="sim-dcard-top">
        {onBack && <button type="button" className="sim-back" onClick={onBack}><span aria-hidden="true">‹</span> {back ?? 'Back'}</button>}
        <span className="sim-dcard-acts">
          {onCopy && <button type="button" className="icon-btn" aria-label="Duplicate" title="Duplicate (⌘C ⌘V)" onClick={onCopy}><Icon name="copy" size={14} /></button>}
          {onDelete && <button type="button" className="icon-btn" aria-label="Delete" title="Delete (⌫)" onClick={onDelete}><Icon name="trash" size={14} /></button>}
        </span>
      </div>
      <div className="sim-dcard-head">
        <div className="sim-dcard-title">
          {icon && icon !== 'junction' && <Icon name={icon} size={18} />}
          <h3>{title}</h3>
          {chip && <span className={`sim-state is-${chip.tone}`}>{chip.label}</span>}
        </div>
        {sub && <p className="sim-dcard-sub">{sub}</p>}
      </div>
      {children}
    </aside>
  )
}

/** Up to three big numbers with small labels. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="sim-tiles">{children}</div>
}

/** `tone`: the figure in that colour (e.g. a low battery). */
export function Tile({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: Tone }) {
  return <div className={`sim-tile${tone ? ` is-${tone}` : ''}`}><b className="num">{value}{unit && <small>{unit}</small>}</b><span>{label}</span></div>
}

/** A tile typed into in place (dashed): the number is the input. Empty means none (undefined). */
export function TileInput({ label, value, unit, max, placeholder = '0', inputRef, onChange }: {
  label: string; value: number | undefined; unit?: string; max?: number; placeholder?: string; inputRef?: Ref<HTMLInputElement>; onChange: (v: number | undefined) => void
}) {
  return (
    <label className="sim-tile is-edit">
      <b className="num">
        <input type="number" min={0} max={max} step="any" value={value ?? ''} placeholder={placeholder} ref={inputRef} aria-label={label}
          onChange={e => onChange(e.target.value === '' ? undefined : Math.min(max ?? Infinity, Math.max(0, Number(e.target.value))))}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
        {unit && <small>{unit}</small>}
      </b>
      <span>{label}</span>
    </label>
  )
}

/** Everything past a card's name, chip and three numbers (owner, 2026-11-26): its picture and its folds, one
 *  tap away. */
export function More({ children }: { children: ReactNode }) {
  return (
    <details className="sim-more">
      <summary>More</summary>
      <div className="sim-more-body">{children}</div>
    </details>
  )
}

/** The card's folds, in one group (one open at a time). */
export function Folds({ children }: { children: ReactNode }) {
  return <div className="sim-folds sim-dcard-folds">{children}</div>
}

/** Up to four numbers that matter for this object, in a quiet card. */
export function Summary({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="sim-summary">
      {items.slice(0, 4).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}
    </dl>
  )
}

/** A collapsible section (Settings open, Advanced closed by default). `status`: a word beside the title
 *  ("Scaled", "3 to place") — `tone` colours it. */
export function Section({ title, open, count, status, tone, fold, children }: {
  title: string; open?: boolean; count?: number; status?: ReactNode; tone?: 'good' | 'warn' | 'bad'
  /** One of a card's folds: opening it closes the card's other folds. */
  fold?: boolean; children: ReactNode
}) {
  return (
    <details className="sim-section" open={open} name={fold ? FOLDS : undefined}>
      <summary>{title}{count ? <span className="sim-section-count"><i className="sim-odot" />{count}</span> : null}
        {status != null && <span className={`sim-section-status${tone ? ` is-${tone}` : ''}`}>{status}</span>}</summary>
      <div className="sim-section-body">{children}</div>
    </details>
  )
}

const ARROWS = [{ deg: 270, label: '↑' }, { deg: 90, label: '↓' }, { deg: 180, label: '←' }, { deg: 0, label: '→' }]

/** Approach direction as four arrows (and "Along route"): the direction a vehicle faces as it enters
 *  the point — a control for the `point.approachHeadingDeg` row (FieldRow keeps chip, reset, help). */
export function ApproachArrows({ value, onChange }: { value: number | null; onChange: (deg: number | undefined) => void }) {
  return (
    <div className="seg-toggle sim-seg-toggle sim-arrows" role="radiogroup" aria-label="Approach direction">
      <button type="button" role="radio" aria-checked={value == null} className={`seg-btn${value == null ? ' on' : ''}`} onClick={() => onChange(undefined)}>Along route</button>
      {ARROWS.map(a => (
        <button key={a.deg} type="button" role="radio" aria-checked={value === a.deg} aria-label={`Enter heading ${a.label}`}
          className={`seg-btn${value === a.deg ? ' on' : ''}`} onClick={() => onChange(a.deg)}>{a.label}</button>
      ))}
    </div>
  )
}
