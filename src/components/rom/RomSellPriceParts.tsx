'use client'

import { memo, type ReactNode, useState } from 'react'
import type { TierResult } from '@/src/calc/scoreTier'
import { complexityLabel } from '@/src/lib/romComplexityLabels'

/** Full-precision USD ("$770,000") — deliberately NOT the shared compact
 *  `money` from vehicleDisplay.ts ("$1.25M"/"$50K"): ROM Configuration wants
 *  exact figures, the compact form is for customer-facing dashboard tiles.
 *  Formatter hoisted to module scope — constructing Intl.NumberFormat is not
 *  free and this renders many times per render across a full fleet. */
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export function fullUsd(n: number): string {
  return usdFormatter.format(n)
}

/** One receipt line: label + amount, expandable (native <details>, no extra
 *  state) to reveal the substituted math behind the figure. */
export function ReceiptRow({ label, amount, detail }: { label: string; amount: string; detail: ReactNode }) {
  return (
    <details className="rom-sp-receipt-row">
      <summary>
        <svg className="rom-sp-receipt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <span>{label}</span>
        <span className="rom-sp-receipt-amount mono">{amount}</span>
      </summary>
      <div className="rom-sp-receipt-detail">{detail}</div>
    </details>
  )
}

/** One complexity axis (Integration or Software): scored tier + reasons +
 *  not-triggered list + an override control. Local `draftReason` state so
 *  typing a reason doesn't fire a storage write per keystroke — committed
 *  onBlur via `onReasonChange`. */
export const TierBreakdown = memo(function TierBreakdown({
  title,
  result,
  onOverride,
  overrideTier,
  overrideReason,
  onReasonChange,
}: {
  title: string
  result: TierResult
  onOverride: (tier: 1 | 2 | 3 | undefined) => void
  overrideTier: 1 | 2 | 3 | undefined
  overrideReason: string | undefined
  onReasonChange: (reason: string) => void
}) {
  const [draftReason, setDraftReason] = useState(overrideReason ?? '')

  return (
    <div className="rom-sp-tier rom2-hero">
      <div className="rom2-hero-head">{title}</div>
      <div className="rom-sp-tier-figure">
        <span className="rom-sp-tier-badge">Tier {result.tier}</span>
        <span className="rom-sp-tier-score">score {result.score}</span>
      </div>
      {result.flooredBy && (
        <p className="rom-sp-floor-note">Floored by {result.flooredBy} — vehicle&rsquo;s inherent minimum</p>
      )}
      {result.reasons.length > 0 ? (
        <dl className="rom-sp-reasons">
          {result.reasons.map(r => (
            <div key={r.label}><dt>{complexityLabel(r.label)}</dt><dd>+{r.points}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="rom-sp-empty-drivers">No complexity drivers triggered — floor tier only.</p>
      )}
      {result.notTriggered.length > 0 && (
        <details className="rom-sp-not-triggered">
          <summary>{result.notTriggered.length} not triggered</summary>
          <ul>{result.notTriggered.map(k => <li key={k}>{complexityLabel(k)}</li>)}</ul>
        </details>
      )}
      <div className="rom-sp-override">
        <label>
          Override
          <select
            value={overrideTier ?? ''}
            onChange={e => onOverride(e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3))}
          >
            <option value="">Use scored tier</option>
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
          </select>
        </label>
        {overrideTier !== undefined && (
          <input
            type="text"
            placeholder="Reason for override"
            value={draftReason}
            onChange={e => setDraftReason(e.target.value)}
            onBlur={() => onReasonChange(draftReason)}
          />
        )}
      </div>
    </div>
  )
})
