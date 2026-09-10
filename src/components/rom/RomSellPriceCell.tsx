'use client'

import { memo, type ReactNode, useMemo, useState } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary } from '@/src/calc/types'
import { updateProject } from '@/src/lib/storage'
import { complexityAnswersFromProject } from '@/src/lib/romComplexityFromProject'
import { resolveRomSellPriceLine, type RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { GAP_FIELDS } from '@/src/calc/complexityInputs'
import type { TierResult } from '@/src/calc/scoreTier'
import { getValidRomInputs } from '@/src/lib/romPricingValidation'
import { vehiclePricingMidpoint } from '@/src/calc/sellPriceRom'
import { ADDERS_CONFIG, PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import { complexityLabel } from '@/src/lib/romComplexityLabels'

interface Props {
  project: StoredProject
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
}

/** Full-precision USD ("$770,000") — deliberately NOT the shared compact
 *  `money` from vehicleDisplay.ts ("$1.25M"/"$50K"): this internal line-item
 *  table wants exact figures, the compact form is for customer-facing tiles.
 *  Formatter hoisted to module scope — constructing Intl.NumberFormat is not
 *  free and this renders a dozen+ times per render. */
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
function fullUsd(n: number): string {
  return usdFormatter.format(n)
}

/** One receipt line: label + amount, expandable (native <details>, no extra
 *  state) to reveal the substituted math behind the figure. */
function ReceiptRow({ label, amount, detail }: { label: string; amount: string; detail: ReactNode }) {
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

const TierBreakdown = memo(function TierBreakdown({
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
  // Local draft so typing a reason doesn't fire a storage write per keystroke;
  // committed onBlur.
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

/** Internal ROM — sell price: Hardware + Integration + Software + Adders,
 *  per engineer-assigned chassis. ALL dollar figures are placeholder pricing
 *  (see content/pricing/global-assumptions.json). Additive Step 4 cell — does
 *  not touch the existing customer-facing ROM economics (src/calc/rom.ts).
 *  Scoring/pricing is resolved by the shared src/lib/romSellPriceLine.ts —
 *  the PPTX export (src/lib/pptx/romSellPrice.ts) uses the same resolver so
 *  the two surfaces can't drift. Mounted with key={project.id} by RomBento so
 *  switching projects remounts this cell cleanly instead of leaking state. */
export default function RomSellPriceCell({ project, fleet, vehicleById }: Props) {
  const assignedGroups = useMemo(() => fleet.groups.filter(g => g.fleetSold > 0), [fleet.groups])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(assignedGroups[0]?.vehicleId)
  const [selectedAdderIds, setSelectedAdderIds] = useState<string[]>(project.romSellPriceSelectedAdderIds ?? [])
  const [overrides, setOverrides] = useState(project.romSellPriceOverrides ?? {})

  const persist = (next: { selectedAdderIds?: string[]; overrides?: typeof overrides }) => {
    updateProject(project.id, {
      romSellPriceSelectedAdderIds: next.selectedAdderIds ?? selectedAdderIds,
      romSellPriceOverrides: next.overrides ?? overrides,
    })
  }

  const answers = useMemo(() => complexityAnswersFromProject(project), [project])

  const group = assignedGroups.find(g => g.vehicleId === selectedVehicleId) ?? assignedGroups[0]
  const vehicleOverride: RomSellPriceOverride | undefined = group ? overrides[group.vehicleId] : undefined

  const line = useMemo(
    () => {
      if (!group) return null
      const vehicle = vehicleById.get(group.vehicleId)
      if (!vehicle) return null
      return resolveRomSellPriceLine(vehicle, group, fleet.totalFleetSold, answers, vehicleOverride, selectedAdderIds)
    },
    [group, vehicleById, fleet.totalFleetSold, answers, vehicleOverride, selectedAdderIds]
  )

  const setOverride = (patch: Partial<RomSellPriceOverride>) => {
    const next = { ...overrides, [group.vehicleId]: { ...vehicleOverride, ...patch } }
    setOverrides(next)
    persist({ overrides: next })
  }
  const onIntegrationOverride = (tier: 1 | 2 | 3 | undefined) => setOverride({ integrationTierOverride: tier })
  const onIntegrationReason = (reason: string) => setOverride({ integrationOverrideReason: reason })
  const onSoftwareOverride = (tier: 1 | 2 | 3 | undefined) => setOverride({ softwareTierOverride: tier })
  const onSoftwareReason = (reason: string) => setOverride({ softwareOverrideReason: reason })

  const toggleAdder = (id: string) => {
    const next = selectedAdderIds.includes(id) ? selectedAdderIds.filter(a => a !== id) : [...selectedAdderIds, id]
    setSelectedAdderIds(next)
    persist({ selectedAdderIds: next })
  }

  if (!group) {
    return <p className="rom-sp-empty">No vehicle assigned to any flow yet — sell-price ROM appears once the engineer assigns a vehicle in the Fleet Engine.</p>
  }

  const vehicle = vehicleById.get(group.vehicleId)
  const romInputs = vehicle ? getValidRomInputs(vehicle) : null
  const integrationMultiplier = line ? PRICING_ASSUMPTIONS.integrationMultipliers[String(line.integrationResult.tier) as '1' | '2' | '3'] : 0
  const softwareMultiplier = line ? PRICING_ASSUMPTIONS.softwareMultipliers[String(line.softwareResult.tier) as '1' | '2' | '3'] : 0
  const selectedAdders = ADDERS_CONFIG.adders.filter(a => selectedAdderIds.includes(a.id))

  return (
    <div className="rom-sp">
      <p className="rom-sp-placeholder-warning">
        ROM — budgetary estimate, placeholder pricing. All dollar values and multipliers are
        pending real pricing input.
      </p>

      <p className="rom-sp-gap-flag">
        Complexity may be understated — not yet collected by the questionnaire:{' '}
        {GAP_FIELDS.join(', ')}.
      </p>

      {assignedGroups.length > 1 && (
        <label className="rom-sp-vehicle-picker">
          Chassis
          <select value={group.vehicleId} onChange={e => setSelectedVehicleId(e.target.value)}>
            {assignedGroups.map(g => (
              <option key={g.vehicleId} value={g.vehicleId}>
                {vehicleById.get(g.vehicleId)?.name ?? g.vehicleId} (qty {g.fleetSold})
              </option>
            ))}
          </select>
        </label>
      )}

      {!line && (
        <p className="rom-sp-empty">
          {vehicle?.name ?? group.vehicleId}: pricing not configured — missing romInputs or
          calc.priceRange.
        </p>
      )}

      {line && (
        <>
          <div className="rom-sp-breakdowns">
            <TierBreakdown
              key={`integration-${group.vehicleId}`}
              title="Integration Complexity"
              result={line.integrationResult}
              overrideTier={vehicleOverride?.integrationTierOverride}
              overrideReason={vehicleOverride?.integrationOverrideReason}
              onOverride={onIntegrationOverride}
              onReasonChange={onIntegrationReason}
            />
            <TierBreakdown
              key={`software-${group.vehicleId}`}
              title="Software Complexity"
              result={line.softwareResult}
              overrideTier={vehicleOverride?.softwareTierOverride}
              overrideReason={vehicleOverride?.softwareOverrideReason}
              onOverride={onSoftwareOverride}
              onReasonChange={onSoftwareReason}
            />
          </div>

          <section className="rom-sp-pricing rom2-hero">
            <div className="rom2-hero-head">
              Sell price — {group.fleetSold} unit{group.fleetSold === 1 ? '' : 's'}
            </div>
            <div className="rom-sp-receipt">
              <ReceiptRow
                label="Hardware"
                amount={fullUsd(line.pricing.hardwareSellTotal)}
                detail={vehicle && (
                  <div className="rom-sp-receipt-detail-row">
                    <span>{fullUsd(vehiclePricingMidpoint(vehicle))} vehicle midpoint × {group.fleetSold} units</span>
                    <span className="mono">{fullUsd(line.pricing.hardwareSellTotal)}</span>
                  </div>
                )}
              />
              <ReceiptRow
                label="Integration"
                amount={fullUsd(line.pricing.integrationSellTotal)}
                detail={romInputs && (
                  <div className="rom-sp-receipt-detail-row">
                    <span>{fullUsd(romInputs.baseIntegrationSellPrice)} base (incl. commissioning) × {integrationMultiplier}× (Tier {line.integrationResult.tier})</span>
                    <span className="mono">{fullUsd(line.pricing.integrationSellTotal)}</span>
                  </div>
                )}
              />
              <ReceiptRow
                label="Software"
                amount={fullUsd(line.pricing.softwareSellTotal)}
                detail={romInputs && (
                  <div className="rom-sp-receipt-detail-row">
                    <span>{fullUsd(romInputs.baseSoftwareSellPrice)} base × {softwareMultiplier}× (Tier {line.softwareResult.tier})</span>
                    <span className="mono">{fullUsd(line.pricing.softwareSellTotal)}</span>
                  </div>
                )}
              />
              <ReceiptRow
                label="Adders"
                amount={fullUsd(line.pricing.addersTotal)}
                detail={selectedAdders.length > 0 ? (
                  <>
                    {selectedAdders.map(a => (
                      <div key={a.id} className="rom-sp-receipt-detail-row">
                        <span>{a.label}</span>
                        <span className="mono">{fullUsd(a.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : 'No adders selected.'}
              />
              <div className="rom-sp-receipt-total">
                <span>Total ({group.fleetSold} unit{group.fleetSold === 1 ? '' : 's'})</span>
                <span className="rom-sp-receipt-amount mono">{fullUsd(line.pricing.sellTotal)}</span>
              </div>
              <div className="rom-sp-receipt-foot">
                <span>Per unit</span>
                <span className="mono">{fullUsd(line.pricing.sellPerUnit)}</span>
              </div>
              <div className="rom-sp-receipt-foot">
                <span>Program range</span>
                <span className="mono">{fullUsd(line.pricing.band.lowTotal)} – {fullUsd(line.pricing.band.highTotal)}</span>
              </div>
            </div>
          </section>

          <section className="rom-sp-adders">
            <span className="rom-card-eyebrow">Adders</span>
            <div className="rom-sp-adder-grid">
              {ADDERS_CONFIG.adders.map(a => (
                <label key={a.id} className="rom-sp-adder-row">
                  <input
                    type="checkbox"
                    checked={selectedAdderIds.includes(a.id)}
                    onChange={() => toggleAdder(a.id)}
                  />
                  {a.label} <span className="mono">{fullUsd(a.amount)}</span>
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
