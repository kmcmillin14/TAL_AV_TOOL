'use client'

import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { usd } from './RomKpis'

export interface RomPatch {
  numberOfOperators?: number
  fullyBurdenedRateUsdPerYear?: number
  energyCostUsdPerKwh?: number
  annualMaintenancePctOfCapex?: number
  operatingDaysPerYear?: number
}

interface Props {
  costs: RomCostInputs
  rom: RomSummary
  onPatch: (patch: RomPatch) => void
}

const num = (s: string, min = 0) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(min, n) : min
}

/** Editable economic assumptions + the OPEX/payback they drive. */
export default function RomEconomics({ costs, rom, onPatch }: Props) {
  const fields: Array<{ key: keyof RomCostInputs; label: string; value: number; step: string; suffix: string; toStore?: (n: number) => number }> = [
    { key: 'numberOfOperators', label: 'Operators displaced', value: costs.numberOfOperators, step: '1', suffix: 'people' },
    { key: 'fullyBurdenedRateUsdPerYear', label: 'Fully-burdened rate', value: costs.fullyBurdenedRateUsdPerYear, step: '1000', suffix: '$/yr ea.' },
    { key: 'energyCostUsdPerKwh', label: 'Energy cost', value: costs.energyCostUsdPerKwh, step: '0.01', suffix: '$/kWh' },
    // maintenance stored as fraction 0..1; shown as percent.
    { key: 'annualMaintenancePctOfCapex', label: 'Maintenance', value: Math.round(costs.annualMaintenancePctOfCapex * 100), step: '1', suffix: '%/yr', toStore: n => n / 100 },
    { key: 'operatingDaysPerYear', label: 'Operating days', value: costs.operatingDaysPerYear, step: '1', suffix: 'days/yr' },
  ]

  return (
    <div className="rom-econ">
      <div className="rom-econ-inputs">
        {fields.map(f => (
          <label key={f.key} className="rom-econ-field">
            <span className="rom-econ-lbl">{f.label}</span>
            <span className="rom-econ-input-wrap">
              <input
                className="rom-econ-input mono"
                type="number" min="0" step={f.step} inputMode="decimal"
                value={f.value}
                onChange={e => {
                  const raw = num(e.target.value)
                  onPatch({ [f.key]: f.toStore ? f.toStore(raw) : raw } as RomPatch)
                }}
              />
              <span className="rom-econ-suffix">{f.suffix}</span>
            </span>
          </label>
        ))}
      </div>

      <dl className="rom-econ-out">
        <div><dt>Annual energy</dt><dd className="mono">{usd(rom.opex.annualEnergyCost)}</dd></div>
        <div><dt>Annual maintenance</dt><dd className="mono">{usd(rom.opex.annualMaintenance)}</dd></div>
        <div className="rom-econ-strong"><dt>Annual OPEX</dt><dd className="mono">{usd(rom.opex.annualOpex)}</dd></div>
        <div><dt>Annual labor offset</dt><dd className="mono">{usd(rom.payback.annualLaborOffset)}</dd></div>
        <div className="rom-econ-strong rom-econ-accent">
          <dt>Simple payback</dt>
          <dd className="mono">{rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr`}</dd>
        </div>
      </dl>
    </div>
  )
}
