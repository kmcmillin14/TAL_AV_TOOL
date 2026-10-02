'use client'

import { useState } from 'react'
import type { FleetComplexityBaseline, RomSellPriceLine, RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { tierName } from '@/src/lib/romComplexityLabels'
import { ADDERS_CONFIG } from '@/src/lib/pricingContent'
import { fullUsd } from './RomSellPriceParts'

interface Props {
  baseline: FleetComplexityBaseline
  lines: RomSellPriceLine[]
  overrides: Record<string, RomSellPriceOverride | undefined>
  onOverride: (vehicleId: string, patch: Partial<RomSellPriceOverride>) => void
  selectedAdderIds: string[]
  onToggleAdder: (id: string) => void
}

/** The controls that move the quotation above: options to add, and per-vehicle
 *  tier overrides.
 *
 *  Scoring itself moved INTO the quotation card (2026-10-02) — a tier chip on
 *  the category it multiplies, with the full point math behind one disclosure.
 *  It had been a parallel column here, which asked the reader to hold a number
 *  from one card against a number in another. This card is now only the things
 *  you can change, so the split is output above, input below.
 *
 *  A vehicle only diverges from the fleet baseline when its own floor raises it
 *  or an engineer overrides it; those cases are called out by name below. */
export default function RomPriceDrivers({
  baseline, lines, overrides, onOverride, selectedAdderIds, onToggleAdder,
}: Props) {
  const [openAdjust, setOpenAdjust] = useState(false)

  const diverged = lines.filter(
    l => l.integrationResult.tier !== baseline.integration.tier
      || l.softwareResult.tier !== baseline.software.tier
  )

  return (
    <section className="rom-cx rom-drivers">
      <header className="rom-cx-head">
        <h2 className="rom-cx-title">Options &amp; adjustments</h2>
      </header>

      <div className="rom-sp-adder-grid">
        {ADDERS_CONFIG.adders.map(a => (
          <label key={a.id} className="rom-sp-adder-row">
            <input
              type="checkbox"
              checked={selectedAdderIds.includes(a.id)}
              onChange={() => onToggleAdder(a.id)}
            />
            {a.label} <span className="mono">{fullUsd(a.amount)}</span>
          </label>
        ))}
      </div>

      {diverged.length > 0 && (
        <p className="rom-cx-diverged">
          {diverged.map(l => {
            const parts: string[] = []
            if (l.integrationResult.tier !== baseline.integration.tier) {
              parts.push(`professional services priced ${tierName(l.integrationResult.tier)}${l.integrationResult.flooredBy ? ' (this vehicle’s minimum)' : ' (overridden)'}`)
            }
            if (l.softwareResult.tier !== baseline.software.tier) {
              parts.push(`software priced ${tierName(l.softwareResult.tier)}${l.softwareResult.flooredBy ? ' (this vehicle’s minimum)' : ' (overridden)'}`)
            }
            return `${l.vehicleName} — ${parts.join(', and ')}.`
          }).join(' ')}
        </p>
      )}

      <button
        type="button"
        className="rom-cx-adjust-toggle"
        onClick={() => setOpenAdjust(o => !o)}
        aria-expanded={openAdjust}
      >
        {openAdjust ? 'Hide' : 'Adjust'} tiers per vehicle
      </button>

      {openAdjust && (
        <div className="rom-cx-adjust">
          {lines.map(l => {
            const ov = overrides[l.vehicleId]
            return (
              <div key={l.vehicleId} className="rom-cx-adjust-row">
                <span className="rom-cx-adjust-veh">{l.vehicleName}</span>
                <div className="rom-cx-adjust-axis">
                  <label>
                    Professional services
                    <select
                      value={ov?.integrationTierOverride ?? ''}
                      onChange={e => onOverride(l.vehicleId, {
                        integrationTierOverride: e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3),
                      })}
                    >
                      <option value="">Use fleet score ({tierName(baseline.integration.tier)})</option>
                      <option value={1}>{tierName(1)}</option>
                      <option value={2}>{tierName(2)}</option>
                      <option value={3}>{tierName(3)}</option>
                    </select>
                  </label>
                  {ov?.integrationTierOverride !== undefined && (
                    <input
                      type="text"
                      className="rom-cx-adjust-reason"
                      placeholder="Why this tier?"
                      defaultValue={ov?.integrationOverrideReason ?? ''}
                      onBlur={e => onOverride(l.vehicleId, { integrationOverrideReason: e.target.value })}
                    />
                  )}
                </div>
                <div className="rom-cx-adjust-axis">
                  <label>
                    Software
                    <select
                      value={ov?.softwareTierOverride ?? ''}
                      onChange={e => onOverride(l.vehicleId, {
                        softwareTierOverride: e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3),
                      })}
                    >
                      <option value="">Use fleet score ({tierName(baseline.software.tier)})</option>
                      <option value={1}>{tierName(1)}</option>
                      <option value={2}>{tierName(2)}</option>
                      <option value={3}>{tierName(3)}</option>
                    </select>
                  </label>
                  {ov?.softwareTierOverride !== undefined && (
                    <input
                      type="text"
                      className="rom-cx-adjust-reason"
                      placeholder="Why this tier?"
                      defaultValue={ov?.softwareOverrideReason ?? ''}
                      onBlur={e => onOverride(l.vehicleId, { softwareOverrideReason: e.target.value })}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
