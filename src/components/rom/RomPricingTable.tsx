'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { RomPricing } from '@/src/calc/rom'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import { usd, usdRange } from './RomKpis'

interface Props {
  pricing: RomPricing
  vehicleById: Map<string, Vehicle>
}

/** Per-vehicle ROM line items → total CAPEX range. Price is ALWAYS a range. */
export default function RomPricingTable({ pricing, vehicleById }: Props) {
  if (pricing.lines.length === 0) {
    return <div className="rom-empty">Size the fleet in the Fleet Engine to see ROM pricing.</div>
  }
  return (
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
      <tfoot>
        <tr>
          <td colSpan={3} className="rom-price-total-lbl">Total ROM CAPEX</td>
          <td className="num mono rom-price-total">{usdRange(pricing.totalMin, pricing.totalMax)}</td>
        </tr>
        <tr>
          <td colSpan={3} className="rom-price-mid-lbl">Midpoint (planning)</td>
          <td className="num mono rom-price-mid">{usd(pricing.totalMid)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
