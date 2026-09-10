'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { RomPricing } from '@/src/calc/rom'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import { usd, usdRange } from './RomKpis'

interface Props {
  pricing: RomPricing
  vehicleById: Map<string, Vehicle>
}

/** Fleet-total headline (Total ROM CAPEX range + midpoint) leads the card;
 *  the per-vehicle-type line items are collapsed behind a drill-down
 *  <details> below it. Price is ALWAYS a range. */
export default function RomPricingTable({ pricing, vehicleById }: Props) {
  if (pricing.lines.length === 0) {
    return <div className="rom-empty">Size the fleet in the Fleet Engine to see ROM pricing.</div>
  }
  return (
    <div className="rom-price-summary">
      <div className="rom-price-headline">
        <span className="rom-price-headline-lbl">Total ROM CAPEX</span>
        <span className="rom-price-headline-amount mono">{usdRange(pricing.totalMin, pricing.totalMax)}</span>
        <span className="rom-price-headline-mid mono">Midpoint (planning) {usd(pricing.totalMid)}</span>
      </div>

      <details className="rom-price-breakdown">
        <summary>
          <svg className="rom-sp-receipt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 6 15 12 9 18" />
          </svg>
          {pricing.lines.length} vehicle {pricing.lines.length === 1 ? 'type' : 'types'} — click to expand
        </summary>
        <table className="rom-price-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th className="num">Qty</th>
              <th className="num">Unit price (range)</th>
              <th className="num">Line total (range)</th>
            </tr>
          </thead>
          <tbody>
            {pricing.lines.map(l => {
              const veh = vehicleById.get(l.vehicleId)
              return (
                <tr key={l.vehicleId}>
                  <td>
                    <span className="rom-veh">
                      <VehicleDot vehicle={veh} size="sm" />
                      {veh?.name ?? l.vehicleId}
                    </span>
                  </td>
                  <td className="num mono">{l.fleetSold}</td>
                  <td className="num mono">{usdRange(l.unitMin, l.unitMax)}</td>
                  <td className="num mono">{usdRange(l.lineMin, l.lineMax)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}
