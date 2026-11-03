'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { PricingInputConfidence, PricingGate } from '@/src/lib/romComplexityFromProject'
import type { FleetComplexityBaseline } from '@/src/lib/romSellPriceLine'
import { ADDERS_CONFIG, PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import Icon from '@/src/design-system/components/Icon'
import ScrollSection from '@/src/components/ScrollSection'
import ComplexityAxis, { TierMeter } from './ComplexityAxis'

import { fullUsd, TogglePill } from './RomSellPriceParts'

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
  selectedAccessoryIds: string[]
  onToggleAccessory: (id: string) => void
  baseline: FleetComplexityBaseline
  gate: PricingGate
}

/** A section's share of the quote, rounded hard. These are placeholder dollars,
 *  so a decimal would promise precision the inputs do not have. Empty string
 *  for zero or an empty quote — a section carrying nothing should say nothing,
 *  not "0%". */
export function shareOfTotal(amount: number, total: number): string {
  if (!(total > 0) || !(amount > 0)) return ''
  const pct = amount / total * 100
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

/** One section of the ledger.
 *
 *  Four near-identical bordered blocks with grey header bands was the problem:
 *  the repetition WAS the monotony — nothing said which section you were in,
 *  how far down the document you were, or carried the eye from a name across to
 *  its money. Three devices replace the card chrome:
 *
 *  1. a NUMBERED SPINE in the left gutter — one continuous hairline with four
 *     nodes, so the sections read as one document and you always know where you
 *     are. It echoes the `01.` numbering ScrollSection already gives the page;
 *  2. a LEADER RULE from the name across to the amount, the device every
 *     printed quotation uses to carry an eye over a gap;
 *  3. WEIGHT, not colour, for role — Adders is elective and says so with a
 *     dashed leader and dimmer type, before you read a word of it.
 *
 *  Open state is LOCAL, not derived from a prop — it was once, which made
 *  the Adders row slam shut the moment you ticked an adder: the prop
 *  flipped, React re-applied `open={false}`, and the list you were using
 *  collapsed under the cursor.
 *
 *  Initial state is open for the elective section (Adders) — that's the one
 *  row with something to DO on first look — OR when the caller explicitly
 *  says so via `defaultOpen` (Hardware, when this fleet's vehicles carry any
 *  Accessories: those are ALSO something to do, nested a level deeper, and
 *  defaulting Hardware closed regardless would hide them — caught in review,
 *  2026-11-02). Otherwise (Hardware with nothing to pick, Software,
 *  Professional Services) sections start closed — their headline (name,
 *  tier meter, amount, share%) already says what a reader needs; the
 *  breakdown is one click away rather than forced on every page load. */
function Category(
  { num, name, amount, tier, withheld, elective, share, detail, defaultOpen }:
  {
    num: string; name: string; amount: number; tier?: number
    withheld?: boolean; elective?: boolean; share?: string; detail?: ReactNode
    defaultOpen?: boolean
  },
) {
  const [open, setOpen] = useState(defaultOpen ?? elective === true)
  // A withheld section still reads as a money row — $0, in line with the
  // others — so the column stays scannable. WHY it is zero is stated once, in
  // the status line above the section, not repeated on every row.
  const head = (
    <>
      <span className="q-sec-num mono" aria-hidden="true">{num}</span>
      <span className="q-sec-name">{name}</span>
      {tier != null && !withheld && <TierMeter tier={tier} />}
      <span className="q-sec-rule" aria-hidden="true" />
      {withheld
        ? <span className="q-sec-withheld-tag">Not priced</span>
        : <span className="q-sec-amount mono">{fullUsd(amount)}</span>}
      <span className="q-sec-share mono">{share}</span>
      {detail && <Icon name="chevron" size={12} />}
    </>
  )
  const cls = `q-sec${withheld ? ' is-withheld' : ''}${elective ? ' is-elective' : ''}`
    + `${elective && amount > 0 ? ' has-picks' : ''}${open ? ' is-open' : ''}`
  if (!detail) return <section className={cls}><div className="q-sec-head">{head}</div></section>
  return (
    <section className={`${cls} is-expandable`}>
      <button type="button" className="q-sec-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {head}
      </button>
      {open && <div className="q-sec-body">{detail}</div>}
    </section>
  )
}

/** Why an unanswered pricing input is not harmless, and therefore why this
 *  page either widens its range or refuses to price. It is the same fact in
 *  all three states, it is one sentence, and nobody needs it twice — so it
 *  lives on the row as a tooltip rather than on screen as a clause. */
const UNSCORED_WHY =
  'An unanswered pricing input scores as "simple", which under-states complexity: '
  + 'with gaps the range widens, and with a whole axis missing the page refuses to price it.'

/** The one "is this number trustworthy" line. Rendered ABOVE section 01 by
 *  RomFleetSellPrice, not inside it: sitting between the total and the
 *  breakdown it read as a row OF the breakdown. Three states — Not priced /
 *  Placeholder with gaps / Placeholder complete — replacing the three separate
 *  messages this step used to carry (a permanent banner, a blocked warning
 *  under the total, and a confidence strip at the bottom).
 *
 *  Kept to ONE line in every state. It used to run to three sentences, which
 *  made the wordiest thing on the quotation the thing standing between the
 *  total and the money. Nothing was dropped: the state, the count and the
 *  field names are all still here; only the reasoning moved to the tooltip,
 *  per CLAUDE.md "explain through structure, not prose". */
export function RomPricingStatus(
  { confidence, gate }: { confidence: PricingInputConfidence; gate: PricingGate },
) {
  const blocked = gate.blocked
  const partial = !blocked && confidence.missing.length > 0
  return (
    <p
      className={`q-status${blocked ? ' is-blocked' : partial ? ' is-partial' : ''}`}
      role="status" title={UNSCORED_WHY}
    >
      <Icon name={blocked || partial ? 'warn' : 'check'} size={14} />
      <span>
        {blocked ? (
          <>
            <strong>Not priced</strong> — {gate.blockedLabels.join(' and ')} need{' '}
            <strong>{gate.missingAll.join(', ')}</strong> on Step 1.
          </>
        ) : partial ? (
          <>
            <strong>Placeholder pricing</strong> — <span className="mono">{confidence.answered} of {confidence.total}</span>{' '}
            inputs confirmed. Missing on Step 1: <strong>{confidence.missing.join(', ')}</strong>.
          </>
        ) : (
          <>
            <strong>Placeholder pricing</strong> — all{' '}
            <span className="mono">{confidence.total}</span> inputs confirmed.
          </>
        )}
      </span>
    </p>
  )
}

export default function RomQuotation({
  lines, fleetTotal, selectedAdderIds, onToggleAdder, selectedAccessoryIds, onToggleAccessory, baseline, gate,
}: Props) {
  const selected = new Set(selectedAdderIds)
  const selectedAccessories = useMemo(() => new Set(selectedAccessoryIds), [selectedAccessoryIds])
  // Every accessory any vehicle in this fleet defines, de-duplicated by id —
  // one vehicle type per accessory in practice, but a shared id would
  // otherwise double-list it. Keyed on `lines`, which only changes when the
  // assigned fleet itself changes, not on every adder/override tweak.
  const availableAccessories = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; amount: number; note?: string }>()
    for (const l of lines) for (const a of l.vehicle.accessories ?? []) if (!byId.has(a.id)) byId.set(a.id, a)
    return Array.from(byId.values())
  }, [lines])
  const blocked = gate.blocked
  // One denominator for every section. While the gate blocks, the quote IS the
  // hardware subtotal — sharing against a total the page refuses to state would
  // leak it back out.
  const quoteTotal = blocked ? fleetTotal.hardwareTotal : fleetTotal.sellTotal
  // The point tables explain the tier chips a few pixels away, so they live
  // inside the section they multiply rather than in a separate card below.
  const intMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(baseline.integration.tier) as '1' | '2' | '3']
  const swMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(baseline.software.tier) as '1' | '2' | '3']

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
        <Category num="01" name="Hardware" amount={fleetTotal.hardwareTotal}
          defaultOpen={availableAccessories.length > 0}
          share={shareOfTotal(fleetTotal.hardwareTotal, quoteTotal)} detail={
          <>
            <ul className="q-lines">
              {lines.map(l => (
                <li key={l.vehicleId}>
                  <span>{l.vehicleName} <span className="q-qty mono">× {l.qty}</span></span>
                  <span className="mono">{fullUsd(l.pricing.hardwareSellTotal)}</span>
                </li>
              ))}
            </ul>
            {/* Accessories — vehicle-specific optional equipment (e.g. ML2's
                conveyor). Hidden entirely when no vehicle in this fleet
                defines any, so most projects see no change here at all. */}
            {availableAccessories.length > 0 && (
              <ul className="q-adders q-accessories">
                {availableAccessories.map(a => (
                  <li key={a.id}>
                    <TogglePill {...a} on={selectedAccessories.has(a.id)} onToggle={onToggleAccessory} />
                  </li>
                ))}
              </ul>
            )}
          </>
        } />

        <Category num="02" name="Software" amount={fleetTotal.softwareTotal}
          tier={baseline.software.tier} withheld={!gate.softwareReady}
          share={shareOfTotal(gate.softwareReady ? fleetTotal.softwareTotal : 0, quoteTotal)} detail={
            <>
              <ul className="q-chips">
                {softwareIncludes(lines).map(i => <li key={i}>{i}</li>)}
              </ul>
              {gate.softwareReady && (
                <ComplexityAxis axis="software" result={baseline.software} multiplier={swMultiplier} />
              )}
            </>
          } />

        <Category num="03" name="Professional services" amount={fleetTotal.integrationTotal}
          tier={baseline.integration.tier} withheld={!gate.integrationReady}
          share={shareOfTotal(gate.integrationReady ? fleetTotal.integrationTotal : 0, quoteTotal)} detail={
            <>
              <ul className="q-chips">
                {PROFESSIONAL_SERVICES_INCLUDES.map(i => <li key={i}>{i}</li>)}
              </ul>
              {gate.integrationReady && (
                <ComplexityAxis axis="integration" result={baseline.integration} multiplier={intMultiplier} />
              )}
            </>
          } />

        {/* Adders used to live in TWO places — a $0 row here pointing at
            "options below", and a checkbox grid in a second card. Ticking a box
            now moves the subtotal directly above it. */}
        <Category num="04" name="Adders" elective amount={fleetTotal.addersTotal}
          share={shareOfTotal(fleetTotal.addersTotal, quoteTotal)} detail={
            <ul className="q-adders">
              {ADDERS_CONFIG.adders.map(a => (
                <li key={a.id}>
                  <TogglePill {...a} on={selected.has(a.id)} onToggle={onToggleAdder} />
                </li>
              ))}
            </ul>
          } />
      </div>
    </ScrollSection>
  )
}
