'use client'

import { useState, type ReactNode } from 'react'
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
 *  five separately-priced lines, so these render without their own amounts.
 *  When real pricing lands, that one number has to be sized for all five.
 *
 *  `Training` here is the base handover training that ships with the project.
 *  The `Extended Training Session` adder is additional sessions ON TOP of it —
 *  they are not the same line billed twice. */
const PROFESSIONAL_SERVICES_INCLUDES = [
  'Integration',
  'Commissioning',
  'Startup support',
  'Project management',
  'Training',
]

/** The fleet-management software the Software figure licenses, derived from the
 *  fleet actually being quoted. Descriptive only: there is one amount, not one
 *  per platform, so these render without their own figures.
 *
 *  Derived, not hardcoded. A static list claimed T-One on any fleet — including
 *  one made entirely of non-BlueBotics vehicles, which do not have it. T-One
 *  ships with BlueBotics (see Vehicle.display.tOne), so it appears exactly when
 *  the fleet contains a vehicle that runs it. */
function softwareIncludes(lines: RomSellPriceLine[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const platform = l.vehicle.display.fleetSoftware
    if (platform && !out.includes(platform)) out.push(platform)
  }
  if (lines.some(l => l.vehicle.display.tOne) && !out.includes('T-One')) out.push('T-One')
  return out
}

interface Props {
  lines: RomSellPriceLine[]
  fleetTotal: FleetSellPriceTotal
  selectedAdderIds: string[]
  onToggleAdder: (id: string) => void
  baseline: FleetComplexityBaseline
  gate: PricingGate
}

/** One category of the breakdown: a header band carrying name · tier · amount,
 *  with its detail beneath. Every category is this ONE shape — the four used to
 *  carry four different internal layouts (sub-lines / nothing / a chip list /
 *  an italic note), which is most of what made the card read as clutter.
 *
 *  Open state is LOCAL, initialised open. It was derived from a prop, which
 *  made the Adders row slam shut the moment you ticked an adder: the prop
 *  flipped, React re-applied `open={false}`, and the list you were using
 *  collapsed under the cursor. */
function Category(
  { name, amount, tier, withheld, detail }:
  { name: string; amount: number; tier?: number; withheld?: boolean; detail?: ReactNode },
) {
  const [open, setOpen] = useState(true)
  // A withheld category still reads as a money row — $0, in line with the
  // others — so the column stays scannable. WHY it is zero is stated once, in
  // the status line above the section, not repeated on every row.
  const head = (
    <>
      <span className="q-cat-name">{name}</span>
      {tier != null && !withheld && (
        <span className="q-cat-tier" title={`Complexity tier ${tier} of 3 — the multiplier applied to this category`}>
          {tier} of 3
        </span>
      )}
      <span className="q-cat-amount mono">{fullUsd(withheld ? 0 : amount)}</span>
    </>
  )
  if (!detail) {
    return (
      <section className={`q-cat${withheld ? ' is-withheld' : ''}`}>
        <div className="q-cat-head">{head}</div>
      </section>
    )
  }
  return (
    <section className={`q-cat is-expandable${withheld ? ' is-withheld' : ''}${open ? ' is-open' : ''}`}>
      <button type="button" className="q-cat-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {head}
        <Icon name="chevron" size={13} />
      </button>
      {open && <div className="q-cat-body">{detail}</div>}
    </section>
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
/** The one "is this number trustworthy" line. Rendered ABOVE section 01 by
 *  RomFleetSellPrice, not inside it: sitting between the total and the
 *  breakdown it read as a row OF the breakdown. Three states — Not priced /
 *  Placeholder with gaps / Placeholder complete — replacing the three separate
 *  messages this step used to carry (a permanent banner, a blocked warning
 *  under the total, and a confidence strip at the bottom). */
export function RomPricingStatus(
  { confidence, gate }: { confidence: PricingInputConfidence; gate: PricingGate },
) {
  const blocked = gate.blocked
  const partial = !blocked && confidence.missing.length > 0
  return (
    <p className={`q-status${blocked ? ' is-blocked' : partial ? ' is-partial' : ''}`} role="status">
      <Icon name={blocked || partial ? 'warn' : 'check'} size={14} />
      <span>
        {blocked ? (
          <>
            <strong>Not priced.</strong>{' '}
            {gate.blockedLabels.join(' and ')} show <span className="mono">$0</span>{' '}because the answers
            that set their complexity are missing — an unanswered input scores as
            &ldquo;simple&rdquo;, so pricing now would under-quote the job.
            {' '}Answer on Step 1: <strong>{gate.missingAll.join(', ')}</strong>.
          </>
        ) : partial ? (
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
  )
}

export default function RomQuotation({
  lines, fleetTotal, selectedAdderIds, onToggleAdder, baseline, gate,
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
          tier={baseline.software.tier} withheld={!gate.softwareReady} detail={
            <>
              <p className="q-detail-note">Fleet-management software licensed with the project:</p>
              <ul className="q-chips">
                {softwareIncludes(lines).map(i => <li key={i}>{i}</li>)}
              </ul>
            </>
          } />

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
        <Category name="Adders" amount={fleetTotal.addersTotal} detail={
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
