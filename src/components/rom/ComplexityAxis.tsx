'use client'

import { useState } from 'react'
import type { TierResult } from '@/src/calc/scoreTier'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import type { GateAxis } from '@/src/lib/romComplexityFromProject'
import { complexityLabel, complexityDriverPhrase, tierName } from '@/src/lib/romComplexityLabels'

/** "an 11–20 unit fleet, a 500K+ sq ft facility, and a customer new to AGVs" */
function driverSentence(result: TierResult): string {
  const phrases = result.reasons.map(r => complexityDriverPhrase(r.label))
  if (phrases.length === 0) return 'Nothing in this project pushes it above the base rate.'
  if (phrases.length === 1) return `Driven by ${phrases[0]}.`
  if (phrases.length === 2) return `Driven by ${phrases[0]} and ${phrases[1]}.`
  return `Driven by ${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}.`
}

/** Where a category landed on the three-step scale, as three segments.
 *
 *  It rides in the ledger's section header, inches from a dollar figure, so it
 *  is drawn in the type colour rather than tinted: a red or amber chip there
 *  reads as a warning about the money. Three filled-or-empty blocks say "2 of
 *  3" without spending a word or a numeral next to the amount column, and the
 *  reader gets the ceiling for free — a bare "2" does not say out of what. */
export function TierMeter({ tier }: { tier: number }) {
  return (
    <span
      className="cx-meter"
      role="img"
      aria-label={`Complexity tier ${tier} of 3`}
      title={`Complexity tier ${tier} of 3 — the multiplier applied to this section. Open the section to see how it scored.`}
    >
      {[1, 2, 3].map(i => (
        <span key={i} className={i <= tier ? 'is-on' : undefined} />
      ))}
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

/** The audit trail for one complexity axis: the scale, what drove it, and the
 *  points, behind a disclosure of its own.
 *
 *  The score itself is NOT here — it rides in the section header as a
 *  `TierMeter`, visible without opening anything. What is here is only the
 *  arithmetic behind it, which matters to one reader in ten and cost four
 *  paragraphs of the page to everyone else. Closed by default: this is the
 *  second level of a disclosure that is already one level down.
 *
 *  Both axes score from project-level answers and the program's total fleet
 *  size — nothing vehicle-specific — so this is ONE fleet-wide result, never
 *  repeated per chassis. */
export default function ComplexityAxis({
  axis, result, multiplier,
}: { axis: GateAxis; result: TierResult; multiplier: number }) {
  const [open, setOpen] = useState(false)
  // Keyed on the axis id, never the visible heading — renaming the heading used
  // to silently swap in the other axis's thresholds with no type error.
  const thresholds = axis === 'software'
    ? PRICING_ASSUMPTIONS.softwareScoring.thresholds
    : PRICING_ASSUMPTIONS.integrationScoring.thresholds

  return (
    <div className={`rom-cx-axis${open ? ' is-open' : ''}`}>
      <button type="button" className="rom-cx-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="rom-cx-toggle-name">
          {tierName(result.tier)} complexity
        </span>
        <span className="rom-cx-toggle-mult mono">{multiplier}× base rate</span>
        <span className="rom-cx-toggle-more">How this scored</span>
      </button>

      {open && (
        <div className="rom-cx-detail">
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
      )}
    </div>
  )
}
