'use client'

import type { TierResult } from '@/src/calc/scoreTier'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import { complexityLabel, complexityDriverPhrase, tierName } from '@/src/lib/romComplexityLabels'

/** "an 11–20 unit fleet, a 500K+ sq ft facility, and a customer new to AGVs" */
export function driverSentence(result: TierResult): string {
  const phrases = result.reasons.map(r => complexityDriverPhrase(r.label))
  if (phrases.length === 0) return 'Nothing in this project pushes it above the base rate.'
  if (phrases.length === 1) return `Driven by ${phrases[0]}.`
  if (phrases.length === 2) return `Driven by ${phrases[0]} and ${phrases[1]}.`
  return `Driven by ${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}.`
}

/** Compact tier badge — the whole complexity answer for one axis in a chip:
 *  named tier, position in the scale, and the multiplier it applies. Sits on
 *  the quotation category it actually multiplies, so the "why" is attached to
 *  the number it moved rather than stranded in a separate card. */
export function TierChip({ result, multiplier }: { result: TierResult; multiplier: number }) {
  return (
    <span className={`rom-cx-tier rom-cx-tier-${result.tier}`}>
      {tierName(result.tier)}
      <span className="rom-cx-tier-of mono">{result.tier} of 3</span>
      <span className="rom-cx-tier-mult mono">{multiplier}×</span>
    </span>
  )
}

/** One complexity axis in full: what drove the tier, what it multiplies, and
 *  the point math for anyone auditing the number.
 *
 *  Both axes score from project-level answers and the program's total fleet
 *  size — nothing vehicle-specific — so this is ONE fleet-wide result, never
 *  repeated per chassis. */
export default function ComplexityAxis({
  axis, result, multiplier,
}: { axis: string; result: TierResult; multiplier: number }) {
  const thresholds = axis === 'Software'
    ? PRICING_ASSUMPTIONS.softwareScoring.thresholds
    : PRICING_ASSUMPTIONS.integrationScoring.thresholds

  return (
    <div className="rom-cx-axis">
      <div className="rom-cx-axis-head">
        <span className="rom-cx-axis-name">{axis}</span>
        <TierChip result={result} multiplier={multiplier} />
      </div>
      <p className="rom-cx-driver">{driverSentence(result)}</p>
      <p className="rom-cx-detail-score">
        Score <span className="mono">{result.score}</span> — Standard starts at{' '}
        <span className="mono">{thresholds.tier2}</span>, Complex at{' '}
        <span className="mono">{thresholds.tier3}</span>. Priced at{' '}
        <span className="mono">{multiplier}×</span> the base rate.
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
  )
}
