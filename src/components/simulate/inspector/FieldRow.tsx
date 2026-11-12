'use client'

// One assumption (Milestone 6, spec §5.7a; compact rows, QoL pass): label and a small source word on
// the left, the value with its unit inside the box on the right, reset when overridden or drawn, and
// its one line of help behind ⓘ. The same row in the inspector and the Assumptions view.

import type { ReactNode } from 'react'
import { SIM_FIELD_HELP } from '@/src/content/help'
import { fromDisplay, toDisplay, unitLabel, type FieldState, type SimFieldDef } from '@/src/lib/simFields'
import type { UnitSystem } from '@/src/lib/utils/units'

type Value = number | string | boolean

interface Props {
  def: SimFieldDef
  state: FieldState
  unitSystem: UnitSystem
  /** A new value, or `undefined` to reset to the source. */
  onChange: (v: Value | undefined) => void
  /** Owner shown before the label (Assumptions view, e.g. "CB18 AGF"). */
  owner?: string
  /** A control in place of the number box or select (e.g. the approach arrows); the row keeps its
   *  label, source chip, reset and help. */
  children?: ReactNode
}

const round = (v: number) => Math.round(v * 1000) / 1000

export default function FieldRow({ def, state, unitSystem, onChange, owner, children }: Props) {
  const overridden = state.source === 'Override'
  const unit = unitLabel(def.unit, unitSystem)
  const shown = typeof state.value === 'number' ? round(toDisplay(def.unit, state.value, unitSystem)) : null
  const commit = (raw: string) => {
    if (raw.trim() === '') { onChange(undefined); return }
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const ft = fromDisplay(def.unit, v, unitSystem)
    const clamped = Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, ft))
    onChange(def.integer ? Math.round(clamped) : clamped)
  }
  const choice = def.choices && (
    <select value={def.choices.findIndex(c => c.value === state.value)} onChange={e => onChange(def.choices![Number(e.target.value)].value)}>
      {def.choices.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
    </select>
  )
  const fallback = state.value == null && def.fallback && !children ? `Not set — ${def.fallback.charAt(0).toLowerCase() + def.fallback.slice(1)}. ` : ''
  const help = fallback + (SIM_FIELD_HELP[def.key] ?? '')
  return (
    <div className={`sim-frow${overridden ? ' is-override' : ''}${children ? ' is-wide' : ''}`}>
      <div className="sim-frow-head">
        <span className="sim-frow-label">
          {overridden && <i className="sim-odot" aria-label="Overridden" />}{owner && <b>{owner} · </b>}{def.label}
          {help && <span className="sim-info" tabIndex={0} role="note" aria-label={help} data-tip={help}>i</span>}
        </span>
        <span className={`sim-src src-${state.source.replace(' ', '').toLowerCase()}`}>{state.source}</span>
      </div>
      <div className="sim-frow-input">
        {children ?? (def.readOnly ? <span className="num sim-frow-ro">{shown ?? '—'} {unit}</span>
          : choice ?? (
            <span className="sim-input-unit">
              <input type="number" step="any" min={def.min != null ? round(toDisplay(def.unit, def.min, unitSystem)) : undefined}
                max={def.max != null ? round(toDisplay(def.unit, def.max, unitSystem)) : undefined}
                defaultValue={shown ?? ''} key={`${shown}`} placeholder="—"
                aria-label={owner ? `${owner} ${def.label}` : def.label}
                onBlur={e => { if (e.target.value !== String(shown ?? '')) commit(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              {unit && <span>{unit}</span>}
            </span>
          ))}
        {(overridden || state.source === 'Drawn') && !def.readOnly && (
          <button type="button" className="sim-reset" title={`Reset to ${state.base == null ? 'default' : `${round(toDisplay(def.unit, Number(state.base), unitSystem))} ${unit}`}`}
            aria-label={`Reset ${def.label}`} onClick={() => onChange(undefined)}>↺</button>
        )}
      </div>
    </div>
  )
}
