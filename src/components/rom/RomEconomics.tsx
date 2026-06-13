'use client'

import { useState, useEffect } from 'react'
import type { RomSummary } from '@/src/calc/rom'
import { usd } from './RomKpis'

export interface RomPatch {
  operatorsPerShift?: number
  fullyBurdenedRateUsdPerYear?: number
  numberOfOperators?: number
}

interface Props {
  rom: RomSummary
  /** Seed from project.operatorsPerShift — local state owns the live value. */
  operatorsPerShift: number
  shiftsPerDay: number
  /** Seed from project.fullyBurdenedRateUsdPerYear ?? 65000 */
  fullyBurdenedRate: number
  onPatch: (patch: RomPatch) => void
}

const num = (s: string, min = 0) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(min, n) : min
}

/** ROI card — two editable inputs, fully self-contained computation via local
 *  state so typing is immediately responsive regardless of the storage/render
 *  cycle. Props seed on mount; useEffect re-syncs when an external change
 *  (e.g. Step 1 edit in another tab) pushes a new value. */
export default function RomEconomics({ rom, operatorsPerShift, shiftsPerDay, fullyBurdenedRate, onPatch }: Props) {
  const [localOps, setLocalOps] = useState(operatorsPerShift)
  const [localRate, setLocalRate] = useState(fullyBurdenedRate)

  useEffect(() => { setLocalOps(operatorsPerShift) }, [operatorsPerShift])
  useEffect(() => { setLocalRate(fullyBurdenedRate) }, [fullyBurdenedRate])

  const totalOps = localOps * shiftsPerDay
  const annualOffset = totalOps * localRate
  const capexMid = (rom.pricing.totalMin + rom.pricing.totalMax) / 2
  const paybackYears = annualOffset > 0 ? capexMid / annualOffset : null

  return (
    <div className="rom-econ">
      <div className="rom-econ-inputs">
        <label className="rom-econ-field">
          <span className="rom-econ-lbl">Operators replaced per shift</span>
          <span className="rom-econ-input-wrap">
            <input
              className="rom-econ-input mono"
              type="number" min="0" step="1" inputMode="numeric"
              value={localOps}
              onChange={e => {
                const v = num(e.target.value)
                setLocalOps(v)
                onPatch({ operatorsPerShift: v, numberOfOperators: undefined })
              }}
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
              value={localRate}
              onChange={e => {
                const v = num(e.target.value)
                setLocalRate(v)
                onPatch({ fullyBurdenedRateUsdPerYear: v })
              }}
            />
            <span className="rom-econ-suffix">$/yr ea.</span>
          </span>
        </label>
      </div>

      <dl className="rom-econ-out">
        <div>
          <dt>Operators displaced</dt>
          <dd className="mono">{totalOps} ({localOps} × {shiftsPerDay} shift{shiftsPerDay === 1 ? '' : 's'})</dd>
        </div>
        <div><dt>Annual labor offset</dt><dd className="mono">{usd(annualOffset)}</dd></div>
        <div><dt>System CAPEX</dt><dd className="mono">{usd(rom.pricing.totalMin)} – {usd(rom.pricing.totalMax)}</dd></div>
        <div className="rom-econ-strong rom-econ-accent">
          <dt>Simple payback</dt>
          <dd className="mono">{paybackYears == null ? '—' : `${paybackYears.toFixed(1)} yr`}</dd>
        </div>
      </dl>
    </div>
  )
}
