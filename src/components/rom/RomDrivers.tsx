'use client'

import type { ScenarioDrivers, ScenarioDiff } from '@/src/lib/scenario'
import { bufferFromUtilization, utilizationFromBuffer } from '@/src/calc/types'

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
  { key: 'throughputBoostPct', label: 'Throughput boost', suffix: '%', step: 5, min: 0, max: 200,
    toInput: n => Math.round(n * 100), fromInput: n => n / 100 },
  { key: 'operatorsPerShift', label: 'Operators / shift', step: 1, min: 0 },
  { key: 'shiftsPerDay', label: 'Shifts / day', step: 1, min: 1, max: 3 },
  { key: 'fullyBurdenedRateUsdPerYear', label: 'Fully-burdened labor', suffix: '$/yr', step: 1000, min: 0 },
  { key: 'annualMaintenancePctOfCapex', label: 'Maintenance', suffix: '% of CAPEX', step: 1, min: 0,
    toInput: n => Math.round(n * 100), fromInput: n => n / 100 },
  { key: 'bufferPct', label: 'Target utilization', suffix: '%', step: 1, min: 50, max: 100,
    toInput: n => Math.round(utilizationFromBuffer(n) * 100), fromInput: n => bufferFromUtilization(n / 100) },
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
  /** Scenario-vs-baseline deltas, for the headline readout in the rail. */
  deltas?: ScenarioDiff | null
  /** Suppresses the money deltas when the project cannot be priced. */
  pricingBlocked?: boolean
  /** Hide the rail, handing its width to the charts (presentation mode). */
  onCollapse?: () => void
}

/** The three figures worth watching while a slider moves. Shown in the rail
 *  itself so comparing a scenario doesn't mean scrolling to find a changed
 *  tile — the control and its consequence stay on the same screen.
 *
 *  Exported because the collapsed rail has no room for it: the dashboard then
 *  renders it as a full-width strip above the KPI band instead. Collapsing must
 *  not leave a scenario where nothing visibly responds. */
export function ScenarioDelta(
  { deltas, pricingBlocked, inline = false }: { deltas: ScenarioDiff; pricingBlocked: boolean; inline?: boolean },
) {
  const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString()}`
  const rows: Array<{ label: string; text: string; good: boolean } | null> = [
    deltas.totalFleetSold
      ? { label: 'Fleet', text: `${deltas.totalFleetSold > 0 ? '+' : '−'}${Math.abs(deltas.totalFleetSold)}`, good: deltas.totalFleetSold < 0 }
      : null,
    !pricingBlocked && deltas.capexMid
      ? { label: 'CAPEX', text: money(deltas.capexMid), good: deltas.capexMid < 0 }
      : null,
    !pricingBlocked && deltas.paybackYears != null && deltas.paybackYears !== 0
      ? { label: 'Payback', text: `${deltas.paybackYears > 0 ? '+' : '−'}${Math.abs(deltas.paybackYears).toFixed(1)} yr`, good: deltas.paybackYears < 0 }
      : null,
  ]
  const shown = rows.filter((r): r is NonNullable<typeof r> => r != null)
  if (shown.length === 0) {
    return <p className={`rom2-rail-delta-none${inline ? ' is-inline' : ''}`}>No change from baseline yet.</p>
  }
  return (
    <dl className={`rom2-rail-delta${inline ? ' is-inline' : ''}`} aria-label="Scenario vs baseline">
      {shown.map(r => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd className={`mono ${r.good ? 'is-good' : 'is-bad'}`}>{r.text}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function RomDrivers({ baseline, drivers, onChange, onApply, hasOverrides, mode, onMode, deltas, pricingBlocked = false, onCollapse }: Props) {
  const set = (key: keyof ScenarioDrivers, value: number | undefined) =>
    onChange({ ...drivers, [key]: value })

  return (
    <aside className="rom2-rail" aria-label="Scenario drivers">
      <div className="rom2-rail-head">
        <div className="rom2-rail-titlerow">
          <span className="rom2-rail-title">Drivers</span>
          {onCollapse && (
            <button
              type="button" className="rom2-rail-collapse" onClick={onCollapse}
              aria-label="Hide drivers and widen the charts"
              title="Hide drivers and widen the charts"
            >&#x2039;</button>
          )}
        </div>
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
        {mode === 'scenario' && deltas && (
          <ScenarioDelta deltas={deltas} pricingBlocked={pricingBlocked} />
        )}
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
