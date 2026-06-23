'use client'

import type { ScenarioDrivers } from '@/src/lib/scenario'

/** One editable driver. `format`/`parse` map between the stored number and the
 *  input string so e.g. percent fields show 10 for 0.10. */
interface DriverDef {
  key: keyof ScenarioDrivers
  label: string
  suffix?: string
  step: number
  min?: number
  max?: number
  /** stored value → input value */
  toInput?: (n: number) => number
  /** input value → stored value */
  fromInput?: (n: number) => number
}

const DRIVERS: DriverDef[] = [
  { key: 'operatorsPerShift', label: 'Operators / shift', step: 1, min: 0 },
  { key: 'shiftsPerDay', label: 'Shifts / day', step: 1, min: 1, max: 3 },
  { key: 'fullyBurdenedRateUsdPerYear', label: 'Fully-burdened labor', suffix: '$/yr', step: 1000, min: 0 },
  { key: 'annualMaintenancePctOfCapex', label: 'Maintenance', suffix: '% of CAPEX', step: 1, min: 0,
    toInput: n => Math.round(n * 100), fromInput: n => n / 100 },
  { key: 'bufferPct', label: 'Buffer', suffix: '%', step: 1, min: 0, max: 100,
    toInput: n => Math.round(n * 100), fromInput: n => n / 100 },
  { key: 'serviceLifeYears', label: 'Service life', suffix: 'yr', step: 1, min: 1, max: 20 },
]

interface Props {
  /** Baseline values (from the persisted project) shown when no override is set. */
  baseline: ScenarioDrivers
  /** Current in-memory overrides. */
  drivers: ScenarioDrivers
  onChange: (drivers: ScenarioDrivers) => void
  /** Persist the current overrides onto the project (becomes the new baseline). */
  onApply: () => void
  /** Whether any override differs from baseline. */
  hasOverrides: boolean
  mode: 'baseline' | 'scenario'
  onMode: (m: 'baseline' | 'scenario') => void
}

export default function RomDrivers({ baseline, drivers, onChange, onApply, hasOverrides, mode, onMode }: Props) {
  const set = (key: keyof ScenarioDrivers, value: number | undefined) =>
    onChange({ ...drivers, [key]: value })

  return (
    <aside className="rom2-rail" aria-label="Scenario drivers">
      <div className="rom2-rail-head">
        <span className="rom2-rail-title">Drivers</span>
        <div className="rom2-seg" role="radiogroup" aria-label="Compare mode">
          <button
            type="button" role="radio" aria-checked={mode === 'baseline'}
            className={`rom2-seg-btn ${mode === 'baseline' ? 'active' : ''}`}
            onClick={() => onMode('baseline')}
          >Baseline</button>
          <button
            type="button" role="radio" aria-checked={mode === 'scenario'}
            className={`rom2-seg-btn ${mode === 'scenario' ? 'active' : ''}`}
            onClick={() => onMode('scenario')}
            disabled={!hasOverrides}
            title={hasOverrides ? 'Show the scenario' : 'Change a driver to build a scenario'}
          >Scenario</button>
        </div>
      </div>

      <div className="rom2-drivers">
        {DRIVERS.map(d => {
          const toInput = d.toInput ?? ((n: number) => n)
          const fromInput = d.fromInput ?? ((n: number) => n)
          const baseVal = baseline[d.key]
          const override = drivers[d.key]
          const stored = override ?? baseVal ?? 0
          const changed = override !== undefined && override !== baseVal
          return (
            <label key={d.key} className={`rom2-driver ${changed ? 'is-changed' : ''}`}>
              <span className="rom2-driver-lbl">
                {d.label}{d.suffix ? <em> {d.suffix}</em> : null}
              </span>
              <input
                type="number"
                className="rom2-driver-input"
                value={Number.isFinite(toInput(stored)) ? toInput(stored) : ''}
                step={d.step}
                min={d.min}
                max={d.max}
                onChange={e => {
                  const raw = e.target.value
                  if (raw === '') return set(d.key, undefined)
                  const next = fromInput(Number(raw))
                  set(d.key, Number.isNaN(next) ? undefined : next)
                }}
              />
            </label>
          )
        })}
      </div>

      <div className="rom2-rail-actions">
        <button
          type="button" className="rom2-rail-btn"
          onClick={() => onChange({})}
          disabled={!hasOverrides}
        >Reset</button>
        <button
          type="button" className="rom2-rail-btn rom2-rail-btn-primary"
          onClick={onApply}
          disabled={!hasOverrides}
          title="Persist these values as the project baseline"
        >Apply to baseline</button>
      </div>
    </aside>
  )
}
