'use client'

// One assumption (Milestone 6, spec §5.7a): label, value in the user's units, source chip, reset when
// overridden, and its one line of help. The same row in the inspector and the Assumptions view.

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
}

const round = (v: number) => Math.round(v * 1000) / 1000

export default function FieldRow({ def, state, unitSystem, onChange, owner }: Props) {
  const overridden = state.source === 'Override'
  const unit = unitLabel(def.unit, unitSystem)
  const shown = typeof state.value === 'number' ? round(toDisplay(def.unit, state.value, unitSystem)) : null
  const commit = (raw: string) => {
    if (raw.trim() === '') { onChange(undefined); return }
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const ft = fromDisplay(def.unit, v, unitSystem)
    onChange(Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, ft)))
  }
  const choice = def.choices && (
    <select value={String(state.value)} onChange={e => onChange(def.field === 'sharedBetweenVehicles' ? e.target.value === 'true' : e.target.value)}>
      {def.choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  )
  return (
    <div className={`sim-frow${overridden ? ' is-override' : ''}`}>
      <div className="sim-frow-head">
        <span className="sim-frow-label">{overridden && <i className="sim-odot" aria-label="Overridden" />}{owner && <b>{owner} · </b>}{def.label}</span>
        <span className={`sim-src src-${state.source.replace(' ', '').toLowerCase()}`}>{state.source}</span>
      </div>
      <div className="sim-frow-input">
        {def.readOnly ? <span className="num">{shown ?? '—'} {unit}</span>
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
          )}
        {(overridden || state.source === 'Drawn') && !def.readOnly && (
          <button type="button" className="sim-reset" title={`Reset to ${state.base == null ? 'default' : `${round(toDisplay(def.unit, Number(state.base), unitSystem))} ${unit}`}`}
            aria-label={`Reset ${def.label}`} onClick={() => onChange(undefined)}>↺</button>
        )}
      </div>
      <p className="sim-frow-help">
        {state.value == null && def.fallback && <b className="sim-frow-fallback">Not set — {def.fallback.charAt(0).toLowerCase() + def.fallback.slice(1)}. </b>}
        {SIM_FIELD_HELP[def.key]}
      </p>
    </div>
  )
}
