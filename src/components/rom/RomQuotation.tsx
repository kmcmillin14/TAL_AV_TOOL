'use client'

import type { ReactNode } from 'react'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { PricingInputConfidence, PricingGate } from '@/src/lib/romComplexityFromProject'
import type { FleetComplexityBaseline } from '@/src/lib/romSellPriceLine'
import { ADDERS_CONFIG } from '@/src/lib/pricingContent'
import Icon from '@/src/design-system/components/Icon'
import ScrollSection from '@/src/components/ScrollSection'

import { fullUsd } from './RomSellPriceParts'

/** What the single Professional Services figure covers. Descriptive only —
 *  there is ONE underlying amount (each vehicle's `romInputs`
 *  .baseIntegrationSellPrice, charged once per fleet-manager platform), not
 *  four separately-priced lines, so these render without their own amounts.
 *  When real pricing lands, that one number has to be sized for all four. */
const PROFESSIONAL_SERVICES_INCLUDES = [
  'Integration',
  'Commissioning',
  'Startup support',
  'Project management',
]

interface Props {
  lines: RomSellPriceLine[]
  fleetTotal: FleetSellPriceTotal
  selectedAdderIds: string[]
  onToggleAdder: (id: string) => void
  confidence: PricingInputConfidence
  baseline: FleetComplexityBaseline
  gate: PricingGate
}

/** One line of the breakdown: name · optional tier chip · amount, with its
 *  detail behind a disclosure. Every category is this ONE shape — the four
 *  used to carry four different layouts (sub-lines / nothing / a chip list /
 *  an italic note), which is most of what made the card read as clutter. */
function Category(
  { name, amount, tier, withheld, detail, defaultOpen }:
  { name: string; amount: number; tier?: number; withheld?: boolean; detail?: ReactNode; defaultOpen?: boolean },
) {
  // A withheld category still reads as a money row — $0, in line with the
  // others — so the column stays scannable. WHY it is zero is stated once, in
  // the status line beside the total, not repeated on every row.
  const head = (
    <>
      <span className="q-row-name">{name}</span>
      {tier != null && !withheld && (
        <span className="q-row-tier" title={`Complexity tier ${tier} of 3 — the multiplier applied to this category`}>
          {tier} of 3
        </span>
      )}
      <span className="q-row-amount mono">{fullUsd(withheld ? 0 : amount)}</span>
    </>
  )
  if (!detail) return <div className={`q-row${withheld ? ' is-withheld' : ''}`}>{head}</div>
  return (
    <details className={`q-row is-expandable${withheld ? ' is-withheld' : ''}`} open={defaultOpen}>
      <summary>
        {head}
        <Icon name="chevron" size={13} />
      </summary>
      <div className="q-row-detail">{detail}</div>
    </details>
  )
}

/** ROM Configuration (Step 4) — the fleet's sell price.
 *
 *  Rebuilt 2026-10-09 against the rest of the app: it uses the shared
 *  `ScrollSection` that Steps 1 and 3 use, instead of the bespoke card it had
 *  invented. The layout now LEADS with the total — it used to sit 762px down,
 *  below four categories and a disclosure, styled identically to a category
 *  subtotal — and the three separate "this might be incomplete" messages
 *  (placeholder banner, blocked warning, confidence strip) are one status line
 *  attached to the figure people actually screenshot.
 *
 *  Every figure comes from the shared resolver (src/lib/romSellPriceLine.ts)
 *  that the Dashboard (via src/lib/fleetModel.ts) and the PPTX appendix also
 *  call, so the three surfaces can't drift. Adders are a project-wide,
 *  once-only cost and professional services is charged once per fleet-manager
 *  platform — both handled in src/calc/fleetSellPrice.ts, never per vehicle. */
export default function RomQuotation({
  lines, fleetTotal, selectedAdderIds, onToggleAdder, confidence, baseline, gate,
}: Props) {
  const selected = new Set(selectedAdderIds)
  const blocked = gate.blocked

  return (
    <ScrollSection
      id="rom-investment"
      num="01"
      title="Project investment"
      sub={`${fleetTotal.totalQty} unit${fleetTotal.totalQty === 1 ? '' : 's'} across ${lines.length} vehicle ${lines.length === 1 ? 'type' : 'types'}`}
    >
      {/* ── the figure, first ── */}
      <div className={`q-headline${blocked ? ' is-blocked' : ''}`}>
        <div className="q-headline-main">
          <span className="q-headline-label">
            {blocked ? 'Hardware subtotal — not the project total' : 'Total project investment'}
          </span>
          <span className="q-headline-amount mono">
            {fullUsd(blocked ? fleetTotal.hardwareTotal : fleetTotal.sellTotal)}
          </span>
        </div>
        {!blocked && (
          <div className="q-headline-side">
            <span>
              <em>Budgetary range</em>
              <span className="mono">{fullUsd(fleetTotal.band.lowTotal)} – {fullUsd(fleetTotal.band.highTotal)}</span>
            </span>
            <span>
              <em>Per unit, blended</em>
              <span className="mono">{fullUsd(fleetTotal.sellPerUnit)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── ONE status line. Was three: a permanent placeholder banner at the
             top of the step, a blocked warning under the total, and a
             confidence strip at the bottom — three voices saying "incomplete".
             This has three states and sits against the number it qualifies. ── */}
      <p className={`q-status${blocked ? ' is-blocked' : confidence.missing.length > 0 ? ' is-partial' : ''}`} role="status">
        <Icon name={blocked ? 'warn' : confidence.missing.length > 0 ? 'warn' : 'check'} size={14} />
        <span>
          {blocked ? (
            <>
              <strong>Not priced.</strong>{' '}
              {gate.blockedLabels.join(' and ')} show <span className="mono">$0</span>{' '}because the answers
              that set their complexity are missing — an unanswered input scores as
              &ldquo;simple&rdquo;, so pricing now would under-quote the job.
              {' '}Answer on Step 1: <strong>{gate.missingAll.join(', ')}</strong>.
            </>
          ) : confidence.missing.length > 0 ? (
            <>
              <strong>Placeholder pricing</strong> — all dollar values and multipliers are pending real
              pricing input. <span className="mono">{confidence.answered} of {confidence.total}</span>{' '}
              pricing inputs confirmed; unknowns price as &ldquo;simple&rdquo;, so the range widens.
              {' '}Missing on Step 1: <strong>{confidence.missing.join(', ')}</strong>.
            </>
          ) : (
            <>
              <strong>Placeholder pricing</strong> — all dollar values and multipliers are pending real
              pricing input. All <span className="mono">{confidence.total}</span> pricing inputs
              confirmed, so the range is as tight as it gets.
            </>
          )}
        </span>
      </p>

      {/* ── the breakdown, four rows of one shape ── */}
      <div className="q-breakdown">
        <Category name="Hardware" amount={fleetTotal.hardwareTotal} detail={
          <ul className="q-lines">
            {lines.map(l => (
              <li key={l.vehicleId}>
                <span>{l.vehicleName} <span className="q-qty mono">× {l.qty}</span></span>
                <span className="mono">{fullUsd(l.pricing.hardwareSellTotal)}</span>
              </li>
            ))}
          </ul>
        } />

        <Category name="Software" amount={fleetTotal.softwareTotal}
          tier={baseline.software.tier} withheld={!gate.softwareReady} />

        <Category name="Professional services" amount={fleetTotal.integrationTotal}
          tier={baseline.integration.tier} withheld={!gate.integrationReady} detail={
            <>
              <p className="q-detail-note">
                Charged once per fleet-manager platform, not per vehicle. Covers:
              </p>
              <ul className="q-chips">
                {PROFESSIONAL_SERVICES_INCLUDES.map(i => <li key={i}>{i}</li>)}
              </ul>
            </>
          } />

        {/* Adders used to live in TWO places — a $0 row here pointing at
            "options below", and a checkbox grid in a second card. Ticking a box
            now moves the subtotal directly above it. */}
        <Category name="Adders" amount={fleetTotal.addersTotal}
          defaultOpen={selected.size === 0} detail={
            <ul className="q-adders">
              {ADDERS_CONFIG.adders.map(a => (
                <li key={a.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggleAdder(a.id)} />
                    <span>{a.label}</span>
                    <span className="mono">{fullUsd(a.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          } />
      </div>
    </ScrollSection>
  )
}
