'use client'

import type { RomSellPriceLine, RomSellPriceOverride } from '@/src/lib/romSellPriceLine'
import { getValidRomInputs } from '@/src/lib/romPricingValidation'
import { vehiclePricingMidpoint } from '@/src/calc/sellPriceRom'
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import { fullUsd, ReceiptRow, TierBreakdown } from './RomSellPriceParts'

interface Props {
  line: RomSellPriceLine
  override: RomSellPriceOverride | undefined
  onOverride: (patch: Partial<RomSellPriceOverride>) => void
}

/** One engineer-assigned chassis's ROM sell-price block: both complexity
 *  breakdowns + a Hardware/Integration/Software receipt closed by a
 *  Subtotal — never "Total": adders are fleet-wide only, shown once in
 *  RomFleetSellPrice's Fleet total section. */
export default function VehicleSellPriceBlock({ line, override, onOverride }: Props) {
  const romInputs = getValidRomInputs(line.vehicle)
  const integrationMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(line.integrationResult.tier) as '1' | '2' | '3']
  const softwareMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(line.softwareResult.tier) as '1' | '2' | '3']

  return (
    <section className="rom-sp-vehicle-block">
      <h3 className="rom-sp-vehicle-name">
        {line.vehicleName} <span className="mono">× {line.qty}</span>
      </h3>

      <div className="rom-sp-breakdowns">
        <TierBreakdown
          title="Integration Complexity"
          result={line.integrationResult}
          overrideTier={override?.integrationTierOverride}
          overrideReason={override?.integrationOverrideReason}
          onOverride={tier => onOverride({ integrationTierOverride: tier })}
          onReasonChange={reason => onOverride({ integrationOverrideReason: reason })}
        />
        <TierBreakdown
          title="Software Complexity"
          result={line.softwareResult}
          overrideTier={override?.softwareTierOverride}
          overrideReason={override?.softwareOverrideReason}
          onOverride={tier => onOverride({ softwareTierOverride: tier })}
          onReasonChange={reason => onOverride({ softwareOverrideReason: reason })}
        />
      </div>

      <div className="rom-sp-receipt">
        <ReceiptRow
          label="Hardware"
          amount={fullUsd(line.pricing.hardwareSellTotal)}
          detail={
            <div className="rom-sp-receipt-detail-row">
              <span>{fullUsd(vehiclePricingMidpoint(line.vehicle))} vehicle midpoint × {line.qty} units</span>
              <span className="mono">{fullUsd(line.pricing.hardwareSellTotal)}</span>
            </div>
          }
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
        <div className="rom-sp-receipt-total">
          <span>Subtotal ({line.qty} unit{line.qty === 1 ? '' : 's'})</span>
          <span className="rom-sp-receipt-amount mono">{fullUsd(line.pricing.lineSubtotal)}</span>
        </div>
        <div className="rom-sp-receipt-foot">
          <span>Per unit</span>
          <span className="mono">{fullUsd(line.pricing.sellPerUnit)}</span>
        </div>
      </div>
    </section>
  )
}
