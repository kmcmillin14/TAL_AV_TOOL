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

/** Where a category landed on the three-step scale, and nothing else.
 *  Deliberately plain text rather than a coloured badge: on the quotation this
 *  sits beside a dollar figure, and a tinted pill there reads as a status
 *  warning about the money. The tier name, the multiplier and the point math
 *  all live one disclosure away, where there is room to explain them. */
export function TierCompact({ result }: { result: TierResult }) {
  return (
    <span className="rom-cx-compact">
      Complexity <span className="mono">{result.tier} of 3</span>
    </span>
  )
}

/** The three-step scale with the project's own score placed on it — answers
 *  "which score buys which tier" directly, instead of asking the reader to
 *  hold two threshold numbers in their head and do the comparison. */
function TierScale({ result, thresholds }: { result: TierResult; thresholds: { tier2: number; tier3: number } }) {
  const bands: Array<{ tier: 1 | 2 | 3; range: string }> = [
    { tier: 1, range: `0–${thresholds.tier2 - 1}` },
    { tier: 2, range: `${thresholds.tier2}–${thresholds.tier3 - 1}` },
    { tier: 3, range: `${thresholds.tier3}+` },
  ]
  return (
    <ol className="rom-cx-scale">
      {bands.map(b => {
        const here = b.tier === result.tier
        return (
          <li key={b.tier} className={here ? 'is-here' : undefined}>
            <span className="rom-cx-scale-name">{tierName(b.tier)}</span>
            <span className="rom-cx-scale-range mono">{b.range}</span>
            {here && (
              <span className="rom-cx-scale-you mono">
                scored {result.score}
                {result.flooredBy ? ' · raised by vehicle minimum' : ''}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** One complexity axis in full: where it landed on the scale, what drove it,
 *  what it multiplies, and the points for anyone auditing the number.
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
        <span className="rom-cx-axis-tier">
          {tierName(result.tier)} <span className="mono">{result.tier} of 3</span>
          <span className="rom-cx-axis-mult mono">{multiplier}× base rate</span>
        </span>
      </div>

      <TierScale result={result} thresholds={thresholds} />

      <p className="rom-cx-driver">{driverSentence(result)}</p>

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
