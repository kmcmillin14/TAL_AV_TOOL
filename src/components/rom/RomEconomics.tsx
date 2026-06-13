'use client'

import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { usd } from './RomKpis'

export interface RomPatch {
  numberOfOperators?: number
  operatorsPerShift?: number
  fullyBurdenedRateUsdPerYear?: number
  energyCostUsdPerKwh?: number
  annualMaintenancePctOfCapex?: number
  operatingDaysPerYear?: number
}

interface Props {
  costs: RomCostInputs
  rom: RomSummary
  /** Step 1 fields the card edits directly (ports both directions). */
  operatorsPerShift: number
  shiftsPerDay: number
  onPatch: (patch: RomPatch) => void
}

const num = (s: string, min = 0) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(min, n) : min
}

/** Simple ROI card — only the two drivers that matter: operators replaced PER
 *  SHIFT and the fully-burdened cost, against the system CAPEX. Energy /
 *  maintenance / operating days stay derived defaults behind the scenes
 *  (informational elsewhere); they are not edited here. */
export default function RomEconomics({ costs, rom, operatorsPerShift, shiftsPerDay, onPatch }: Props) {
  return (
    <div className="rom-econ">
      <div className="rom-econ-inputs">
        <label className="rom-econ-field">
          <span className="rom-econ-lbl">Operators replaced per shift</span>
          <span className="rom-econ-input-wrap">
            <input
              className="rom-econ-input mono"
              type="number" min="0" step="1" inputMode="numeric"
              value={operatorsPerShift}
              onChange={e =>
                // Writes the Step 1 field and clears any legacy explicit total
                // so the derived per-shift × shifts path is authoritative.
                onPatch({ operatorsPerShift: num(e.target.value), numberOfOperators: undefined })
              }
            />
            <span className="rom-econ-suffix">people / shift</span>
          </span>
        </label>
        <label className="rom-econ-field">
          <span className="rom-econ-lbl">Fully-burdened cost</span>
          <span className="rom-econ-input-wrap">
            <input
              className="rom-econ-input mono"
              type="number" min="0" step="1000" inputMode="decimal"
              value={costs.fullyBurdenedRateUsdPerYear}
              onChange={e => onPatch({ fullyBurdenedRateUsdPerYear: num(e.target.value) })}
            />
            <span className="rom-econ-suffix">$/yr ea.</span>
          </span>
        </label>
      </div>

      <dl className="rom-econ-out">
        <div>
          <dt>Operators displaced</dt>
          <dd className="mono">{costs.numberOfOperators} ({operatorsPerShift} × {shiftsPerDay} shift{shiftsPerDay === 1 ? '' : 's'})</dd>
        </div>
        <div><dt>Annual labor offset</dt><dd className="mono">{usd(rom.payback.annualLaborOffset)}</dd></div>
        <div><dt>System CAPEX</dt><dd className="mono">{usd(rom.pricing.totalMin)} – {usd(rom.pricing.totalMax)}</dd></div>
        <div className="rom-econ-strong rom-econ-accent">
          <dt>Simple payback</dt>
          <dd className="mono">{rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr`}</dd>
        </div>
      </dl>
    </div>
  )
}
