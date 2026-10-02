'use client'

import type { ReactNode } from 'react'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { PricingInputConfidence, PricingGate } from '@/src/lib/romComplexityFromProject'
import type { FleetComplexityBaseline } from '@/src/lib/romSellPriceLine'
import { ADDERS_CONFIG, PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'

import ComplexityAxis, { TierCompact } from './ComplexityAxis'
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
  confidence: PricingInputConfidence
  baseline: FleetComplexityBaseline
  gate: PricingGate
}

/** One quotation category: a header row carrying the category subtotal, with
 *  its sub-lines (or descriptive items) indented underneath. */
function QuoteCategory(
  { name, amount, badge, withheld, children }:
  { name: string; amount: number; badge?: ReactNode; withheld?: string[]; children?: ReactNode },
) {
  const isWithheld = withheld != null && withheld.length > 0
  return (
    <section className={`rom-quote-cat${isWithheld ? ' is-withheld' : ''}`}>
      <div className="rom-quote-cat-head">
        <span className="rom-quote-cat-name">{name}</span>
        {!isWithheld && badge}
        {isWithheld
          ? <WithheldAmount missing={withheld} />
          : <span className="rom-quote-cat-amount mono">{fullUsd(amount)}</span>}
      </div>
      {children && <div className="rom-quote-cat-body">{children}</div>}
    </section>
  )
}

/** Stands in for a category amount that is deliberately not shown. The owner's
 *  rule is that no number beats a bad number, so this renders the blocking
 *  answers by name rather than a figure — a blank to fill, not a price to
 *  quote. */
function WithheldAmount({ missing }: { missing: string[] }) {
  return (
    <span className="rom-quote-withheld">
      Not priced — needs <strong>{missing.join(', ')}</strong> on Step 1
    </span>
  )
}

/** A priced sub-line inside a category (e.g. one chassis's hardware). */
function QuoteLine({ label, qty, amount }: { label: string; qty?: number; amount: number }) {
  return (
    <div className="rom-quote-line">
      <span className="rom-quote-line-label">
        {label}
        {qty !== undefined && <span className="rom-quote-line-qty mono"> × {qty}</span>}
      </span>
      <span className="rom-quote-line-amount mono">{fullUsd(amount)}</span>
    </div>
  )
}

/** ROM Configuration (Step 4), quotation view — the fleet's sell price laid
 *  out the way a quote reads: Hardware · Software · Professional services ·
 *  Adders, each a category with a subtotal and its own sub-lines, closed by
 *  the total project investment. Hardware itemizes per chassis; Software and
 *  Professional services are single fleet-wide lines (Professional services
 *  is genuinely billed once per fleet-manager platform — see
 *  src/calc/fleetSellPrice.ts). Every figure comes from the shared resolver
 *  (src/lib/romSellPriceLine.ts) that the Dashboard and the PPTX appendix
 *  also call, so the three surfaces can't drift. */
export default function RomQuotation({ lines, fleetTotal, selectedAdderIds, confidence, baseline, gate }: Props) {
  const selected = new Set(selectedAdderIds)
  const selectedAdders = ADDERS_CONFIG.adders.filter(a => selected.has(a.id))
  const sharedPlatforms = fleetTotal.integrationByPlatform.filter(g => g.vehicleIds.length > 1)

  const blockedLabels = [
    ...(gate.integrationReady ? [] : ['Professional services']),
    ...(gate.softwareReady ? [] : ['Software']),
  ]

  const intMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(baseline.integration.tier) as '1' | '2' | '3']
  const swMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(baseline.software.tier) as '1' | '2' | '3']

  return (
    <section className="rom-quote">
      <header className="rom-quote-head">
        <h2 className="rom-quote-title">Project investment</h2>
        <p className="rom-quote-sub">
          {fleetTotal.totalQty} unit{fleetTotal.totalQty === 1 ? '' : 's'} across {lines.length}{' '}
          vehicle {lines.length === 1 ? 'type' : 'types'}
        </p>
      </header>

      <QuoteCategory name="Hardware" amount={fleetTotal.hardwareTotal}>
        {lines.map(l => (
          <QuoteLine key={l.vehicleId} label={l.vehicleName} qty={l.qty} amount={l.pricing.hardwareSellTotal} />
        ))}
      </QuoteCategory>

      <QuoteCategory name="Software" amount={fleetTotal.softwareTotal}
        badge={<TierCompact result={baseline.software} />}
        withheld={gate.softwareReady ? undefined : gate.missingSoftware}>
        <p className="rom-quote-note">
          Fleet management software, licensed across all {fleetTotal.totalQty} unit
          {fleetTotal.totalQty === 1 ? '' : 's'}.
        </p>
      </QuoteCategory>

      <QuoteCategory name="Professional services" amount={fleetTotal.integrationTotal}
        badge={<TierCompact result={baseline.integration} />}
        withheld={gate.integrationReady ? undefined : gate.missingIntegration}>
        <ul className="rom-quote-includes">
          {PROFESSIONAL_SERVICES_INCLUDES.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {sharedPlatforms.length > 0 && (
          <p className="rom-quote-note">
            {sharedPlatforms.map(g => g.platform).join(', ')} runs the whole fleet — standing it up
            is one job, so professional services is charged once, not per vehicle type.
          </p>
        )}
      </QuoteCategory>

      <QuoteCategory name="Adders" amount={fleetTotal.addersTotal}>
        {selectedAdders.length > 0 ? (
          selectedAdders.map(a => <QuoteLine key={a.id} label={a.label} amount={a.amount} />)
        ) : (
          <p className="rom-quote-note">None selected — pick options below to add them here.</p>
        )}
      </QuoteCategory>

      {/* Complexity reads as part of the quote, not a separate study: the tier
          chips above answer "what did this cost us" at a glance, and this one
          disclosure carries the whole audit trail for anyone who needs it. */}
      {!gate.blocked && <details className="rom-quote-cx">
        <summary>
          <span className="rom-quote-cx-label">Complexity</span>
          <span className="rom-quote-cx-summary">
            Professional services <strong>{baseline.integration.tier} of 3</strong>
            {' · '}Software <strong>{baseline.software.tier} of 3</strong>
          </span>
          <span className="rom-quote-cx-more">Scoring detail</span>
        </summary>
        <div className="rom-quote-cx-body">
          <p className="rom-quote-cx-intro">
            One score for the whole fleet — complexity comes from the site and the program, not
            from which chassis you picked.
          </p>
          <div className="rom-cx-axes">
            <ComplexityAxis axis="Professional services" result={baseline.integration} multiplier={intMultiplier} />
            <ComplexityAxis axis="Software" result={baseline.software} multiplier={swMultiplier} />
          </div>
        </div>
      </details>}

      {gate.blocked ? (
        <>
          {/* No project total while a category is unpriced. A total that quietly
              omits professional services reads as the whole job and gets quoted
              that way, which is the failure this gate exists to prevent. */}
          <div className="rom-quote-total is-partial">
            <span>Hardware subtotal</span>
            <span className="rom-quote-total-amount mono">{fullUsd(fleetTotal.hardwareTotal)}</span>
          </div>
          <p className="rom-quote-blocked">
            <strong>No project total yet.</strong> {blockedLabels.length === 1
              ? `${blockedLabels[0]} is`
              : `${blockedLabels.join(' and ')} are`}{' '}
            not priced until the inputs above are answered — an unanswered input scores as
            &ldquo;simple&rdquo;, so quoting now would under-price the job.
          </p>
        </>
      ) : (
        <>
          <div className="rom-quote-total">
            <span>Total project investment</span>
            <span className="rom-quote-total-amount mono">{fullUsd(fleetTotal.sellTotal)}</span>
          </div>
          <div className="rom-quote-foot">
            <span>Per unit, blended across {fleetTotal.totalQty} unit{fleetTotal.totalQty === 1 ? '' : 's'}</span>
            <span className="mono">{fullUsd(fleetTotal.sellPerUnit)}</span>
          </div>
          <div className="rom-quote-foot">
            <span>
              Budgetary range
              {fleetTotal.unknownInputCount > 0 && (
                <span className="rom-quote-range-why"> — widened for {fleetTotal.unknownInputCount} unknown
                  {fleetTotal.unknownInputCount === 1 ? '' : 's'}</span>
              )}
            </span>
            <span className="mono">
              {fullUsd(fleetTotal.band.lowTotal)} – {fullUsd(fleetTotal.band.highTotal)}
            </span>
          </div>
        </>
      )}

      {/* While a category is withheld there is no range to widen, so the strip
          reports coverage only — promising a wider range next to a withheld
          price was two different stories about the same blanks. */}
      <div className={`rom-quote-confidence${confidence.missing.length > 0 ? ' is-incomplete' : ''}`}>
        <span className="rom-quote-confidence-score mono">
          {confidence.answered} of {confidence.total}
        </span>
        {confidence.missing.length === 0 ? (
          <span>pricing inputs confirmed — range is as tight as it gets.</span>
        ) : gate.blocked ? (
          <span>
            {'pricing inputs confirmed. Still missing on Step 1: '}
            <strong>{confidence.missing.join(', ')}</strong>
          </span>
        ) : (
          <span>
            {'pricing inputs confirmed. Unknowns price as “simple”, so the range widens. Missing on Step 1: '}
            <strong>{confidence.missing.join(', ')}</strong>
          </span>
        )}
      </div>
    </section>
  )
}
