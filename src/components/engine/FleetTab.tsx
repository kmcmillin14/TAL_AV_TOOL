'use client'

import type { FleetSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import type { EnginePatch } from './types'

interface Props {
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
  bufferPct: number
  onPatch: (patch: EnginePatch) => void
}

export default function FleetTab({ fleet, vehicleById, bufferPct, onPatch }: Props) {
  const pct = Math.round(bufferPct * 100)
  return (
    <div className="engine-panel">
      <div className="buffer-control">
        <span className="bc-label">Buffer</span>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.05}
          value={bufferPct}
          onChange={e => onPatch({ bufferPct: Number(e.target.value) })}
          aria-label="Fleet buffer percentage"
        />
        <span className="bc-value mono">{pct}%</span>
        <span className="bc-hint">maintenance · training · demand spikes</span>
      </div>

      {fleet.groups.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to size the fleet.</div>
      ) : (
        <table className="waterfall-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th className="num">Base</th>
              <th className="num">+ Charging</th>
              <th className="num">× {(1 + bufferPct).toFixed(2)}</th>
              <th className="num">Fleet</th>
            </tr>
          </thead>
          <tbody>
            {fleet.groups.map(g => {
              const veh = vehicleById.get(g.vehicleId)
              return (
                <tr key={g.vehicleId}>
                  <td><span className="ct-veh"><VehicleDot vehicle={veh} size="sm" />{veh?.name ?? g.vehicleId}</span></td>
                  <td className="num mono">{g.baseFleet}</td>
                  <td className="num mono">{g.charging.chargingDelta > 0 ? `+${g.charging.chargingDelta}` : '—'}</td>
                  <td className="num mono wf-mid">{(g.fleetWithCharging * (1 + bufferPct)).toFixed(2)}</td>
                  <td className="num mono wf-sold">{g.fleetSold}</td>
                </tr>
              )
            })}
            <tr className="wf-total">
              <td>TOTAL</td>
              <td className="num mono">{fleet.totalBaseFleet}</td>
              <td className="num mono">{fleet.totalChargingDelta > 0 ? `+${fleet.totalChargingDelta}` : '—'}</td>
              <td className="num"></td>
              <td className="num mono wf-sold">{fleet.totalFleetSold}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="engine-note">
        Fleet = ⌈(base + charging) × (1 + buffer)⌉ per vehicle. The buffer is the only multiplier in the
        whole pipeline — base fleet is engineering, charging is physics, this is policy.
      </div>
    </div>
  )
}
