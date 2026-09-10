'use client'

import { useState } from 'react'
import type { TierResult } from '@/src/calc/scoreTier'
import type { FleetComplexityBaseline, RomSellPriceLine, RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import { complexityLabel, complexityDriverPhrase, tierName } from '@/src/lib/romComplexityLabels'

interface Props {
  baseline: FleetComplexityBaseline
  lines: RomSellPriceLine[]
  overrides: Record<string, RomSellPriceOverride | undefined>
  onOverride: (vehicleId: string, patch: Partial<RomSellPriceOverride>) => void
}

/** "an 11–20 unit fleet, a 500K+ sq ft facility, and a customer new to AGVs" */
function driverSentence(result: TierResult): string {
  const phrases = result.reasons.map(r => complexityDriverPhrase(r.label))
  if (phrases.length === 0) return 'Nothing in this project pushes it above the base rate.'
  if (phrases.length === 1) return `Driven by ${phrases[0]}.`
  if (phrases.length === 2) return `Driven by ${phrases[0]} and ${phrases[1]}.`
  return `Driven by ${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}.`
}

/** One axis, in plain English: named tier, what drove it, what it costs, and
 *  the point math tucked behind a toggle for anyone auditing the number. */
function AxisSummary({
  axis, result, multiplier,
}: { axis: string; result: TierResult; multiplier: number }) {
  return (
    <div className="rom-cx-axis">
      <div className="rom-cx-axis-head">
        <span className="rom-cx-axis-name">{axis}</span>
        <span className={`rom-cx-tier rom-cx-tier-${result.tier}`}>
          {tierName(result.tier)} <span className="rom-cx-tier-of mono">{result.tier} of 3</span>
        </span>
      </div>
      <p className="rom-cx-driver">{driverSentence(result)}</p>
      <p className="rom-cx-multiplier">
        Priced at <span className="mono">{multiplier}×</span> the base rate.
      </p>
      <details className="rom-cx-detail">
        <summary>Show scoring detail</summary>
        <div className="rom-cx-detail-body">
          <p className="rom-cx-detail-score">
            Score <span className="mono">{result.score}</span> — Standard starts at{' '}
            <span className="mono">{axis === 'Software'
              ? PRICING_ASSUMPTIONS.softwareScoring.thresholds.tier2
              : PRICING_ASSUMPTIONS.integrationScoring.thresholds.tier2}</span>, Complex at{' '}
            <span className="mono">{axis === 'Software'
              ? PRICING_ASSUMPTIONS.softwareScoring.thresholds.tier3
              : PRICING_ASSUMPTIONS.integrationScoring.thresholds.tier3}</span>.
          </p>
          {result.reasons.length > 0 && (
            <dl className="rom-cx-points">
              {result.reasons.map(r => (
                <div key={r.label}>
                  <dt>{complexityLabel(r.label)}</dt>
                  <dd className="mono">+{r.points}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.notTriggered.length > 0 && (
            <p className="rom-cx-not-triggered">
              Not triggered: {result.notTriggered.map(complexityLabel).join(', ')}.
            </p>
          )}
        </div>
      </details>
    </div>
  )
}

/** Fleet-level complexity, in plain English, plus the per-vehicle tier
 *  adjustments an engineer can still make.
 *
 *  Both axes score from project-level answers and the program's total fleet
 *  size — nothing vehicle-specific — so the breakdown is ONE fleet-wide
 *  result, not the same list repeated per chassis (which is what a
 *  mixed-chassis fleet used to render). A vehicle only diverges from the
 *  baseline when its own floor raises it or an engineer overrides it, and
 *  those cases are called out by name in the adjustments section. */
export default function RomComplexityPanel({ baseline, lines, overrides, onOverride }: Props) {
  const [openAdjust, setOpenAdjust] = useState(false)

  const diverged = lines.filter(
    l => l.integrationResult.tier !== baseline.integration.tier
      || l.softwareResult.tier !== baseline.software.tier
  )

  const intMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(baseline.integration.tier) as '1' | '2' | '3']
  const swMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(baseline.software.tier) as '1' | '2' | '3']

  return (
    <section className="rom-cx">
      <header className="rom-cx-head">
        <h2 className="rom-cx-title">How this project was scored</h2>
        <p className="rom-cx-sub">
          One score for the whole fleet — complexity comes from the site and the program, not
          from which chassis you picked.
        </p>
      </header>

      <div className="rom-cx-axes">
        <AxisSummary axis="Professional services" result={baseline.integration} multiplier={intMultiplier} />
        <AxisSummary axis="Software" result={baseline.software} multiplier={swMultiplier} />
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
          <p className="rom-cx-note">
            An override applies to one vehicle type only, and can raise a tier but never drop it
            below that vehicle&rsquo;s own minimum.
          </p>
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
