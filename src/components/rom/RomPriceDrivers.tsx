'use client'

import { useState } from 'react'
import type { FleetComplexityBaseline, RomSellPriceLine, RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { tierName } from '@/src/lib/romComplexityLabels'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import ScrollSection from '@/src/components/ScrollSection'
import ComplexityAxis from './ComplexityAxis'

interface Props {
  baseline: FleetComplexityBaseline
  lines: RomSellPriceLine[]
  overrides: Record<string, RomSellPriceOverride | undefined>
  onOverride: (vehicleId: string, patch: Partial<RomSellPriceOverride>) => void
  blocked: boolean
}

/** What MOVES the total above: the complexity score and the per-vehicle tier
 *  overrides that can change it.
 *
 *  Rebuilt 2026-10-09. This used to be "Options & adjustments", which mixed two
 *  unlike things — warranty checkboxes (money you add) beside tier overrides
 *  (engineering judgement that re-multiplies a category). The adders moved into
 *  the Adders row of the quotation, where ticking one moves the subtotal it
 *  sits under; what is left here is the scoring and the authority to override
 *  it, which belong together.
 *
 *  A vehicle only diverges from the fleet baseline when its own floor raises it
 *  or an engineer overrides it; those cases are called out by name. */
export default function RomPriceDrivers({ baseline, lines, overrides, onOverride, blocked }: Props) {
  const [openAdjust, setOpenAdjust] = useState(false)

  const intMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(baseline.integration.tier) as '1' | '2' | '3']
  const swMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(baseline.software.tier) as '1' | '2' | '3']

  const diverged = lines.filter(
    l => l.integrationResult.tier !== baseline.integration.tier
      || l.softwareResult.tier !== baseline.software.tier
  )

  return (
    <ScrollSection
      id="rom-drivers"
      num="02"
      title="Price drivers"
      // Showing tiers in the header while the body says scoring is withheld
      // was two different stories about the same blanks.
      sub={blocked
        ? 'Scoring withheld until the complexity inputs are answered'
        : `Professional services ${baseline.integration.tier} of 3 · Software ${baseline.software.tier} of 3`}
    >
      {blocked ? (
        <p className="q-detail-note">
          Scoring is withheld while pricing is blocked — an unanswered input scores as
          &ldquo;simple&rdquo;, so the tiers would read lower than the job really is. Answer the
          missing inputs on Step 1 and the scoring appears here.
        </p>
      ) : (
        <div className="q-axes">
          <ComplexityAxis axis="integration" label="Professional services" result={baseline.integration} multiplier={intMultiplier} />
          <ComplexityAxis axis="software" label="Software" result={baseline.software} multiplier={swMultiplier} />
        </div>
      )}

      {diverged.length > 0 && (
        <p className="q-diverged">
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
        className="q-adjust-toggle"
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
    </ScrollSection>
  )
}
