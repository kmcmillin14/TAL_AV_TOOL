'use client'

import type { ReactNode } from 'react'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { PricingInputConfidence } from '@/src/lib/romComplexityFromProject'
import { ADDERS_CONFIG } from '@/src/lib/pricingContent'
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
}

/** One quotation category: a header row carrying the category subtotal, with
 *  its sub-lines (or descriptive items) indented underneath. */
function QuoteCategory({ name, amount, children }: { name: string; amount: number; children?: ReactNode }) {
  return (
    <section className="rom-quote-cat">
      <div className="rom-quote-cat-head">
        <span className="rom-quote-cat-name">{name}</span>
        <span className="rom-quote-cat-amount mono">{fullUsd(amount)}</span>
      </div>
      {children && <div className="rom-quote-cat-body">{children}</div>}
    </section>
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
export default function RomQuotation({ lines, fleetTotal, selectedAdderIds, confidence }: Props) {
  const selected = new Set(selectedAdderIds)
  const selectedAdders = ADDERS_CONFIG.adders.filter(a => selected.has(a.id))
  const sharedPlatforms = fleetTotal.integrationByPlatform.filter(g => g.vehicleIds.length > 1)

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

      <QuoteCategory name="Software" amount={fleetTotal.softwareTotal}>
        <p className="rom-quote-note">
          Fleet management software, licensed across all {fleetTotal.totalQty} unit
          {fleetTotal.totalQty === 1 ? '' : 's'}.
        </p>
      </QuoteCategory>

      <QuoteCategory name="Professional services" amount={fleetTotal.integrationTotal}>
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

      <div className={`rom-quote-confidence${confidence.missing.length > 0 ? ' is-incomplete' : ''}`}>
        <span className="rom-quote-confidence-score mono">
          {confidence.answered} of {confidence.total}
        </span>
        {confidence.missing.length === 0 ? (
          <span>pricing inputs confirmed — range is as tight as it gets.</span>
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
