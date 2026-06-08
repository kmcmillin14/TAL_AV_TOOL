'use client'

import type { FleetGroup, Flow } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  vehicleById: Map<string, Vehicle>
  groupByVehicle: Map<string, FleetGroup>
  bufferPct: number
  onPatch: (patch: EnginePatch) => void
}

/**
 * Buffer stage — the same per-flow rows, now showing each flow's vehicle
 * waterfall: base → +charging → ×buffer → fleet (sold). The project buffer is
 * the single slider up top; per-flow figures are the vehicle group's (pooled
 * per vehicle type at the project level).
 */
export default function BufferPipeline({ flows, vehicleById, groupByVehicle, bufferPct, onPatch }: Props) {
  const rows = flows.filter(f => f.vehicleId)
  const pct = Math.round(bufferPct * 100)
  return (
    <div className="engine-panel pipeline-wrap">
      <div className="buffer-control">
        <span className="bc-label">Buffer</span>
        <input
          type="range" min={0} max={0.5} step={0.05} value={bufferPct}
          onChange={e => onPatch({ bufferPct: Number(e.target.value) })}
          aria-label="Fleet buffer percentage"
        />
        <span className="bc-value mono">{pct}%</span>
        <span className="bc-hint">maintenance · training · demand spikes</span>
      </div>

      {rows.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to size the fleet.</div>
      ) : (
        <table className="waterfall-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th className="num">Base</th>
              <th className="num">+ Charging</th>
              <th className="num">× {(1 + bufferPct).toFixed(2)}</th>
              <th className="num">Fleet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const g = groupByVehicle.get(f.vehicleId!)
              const veh = vehicleById.get(f.vehicleId!)
              const delta = g?.charging.chargingDelta ?? 0
              return (
                <tr key={f.id}>
                  <td>
                    <span className="ct-veh">
                      <VehicleDot vehicle={veh} size="sm" />
                      {veh?.name ?? f.vehicleId}
                      <span className="pl-route mono">{f.origin || '—'} → {f.destination || '—'}</span>
                    </span>
                  </td>
                  <td className="num mono">{g?.baseFleet ?? '—'}</td>
                  <td className="num mono">{delta > 0 ? `+${delta}` : '—'}</td>
                  <td className="num mono wf-mid">{g ? (g.fleetWithCharging * (1 + bufferPct)).toFixed(2) : '—'}</td>
                  <td className="num mono wf-sold">{g?.fleetSold ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="engine-note">
        Buffer is the only multiplier in the pipeline — it covers maintenance, training, and demand
        spikes. Per-flow figures are the vehicle group&apos;s; the fleet pools per vehicle type.
      </div>
    </div>
  )
}
