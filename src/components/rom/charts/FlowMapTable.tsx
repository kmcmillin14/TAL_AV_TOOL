'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  vehicleById: Map<string, Vehicle>
}

const secs = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s)}s`)

/** Industrial data table that backs the operation map — the precise figures the
 *  diagram visualizes. Read-only; mirrors the same flows + derived values. */
export default function FlowMapTable({ flows, derivedByFlowId, vehicleById }: Props) {
  const rows = flows.filter(f => f.origin || f.destination || f.vehicleId)
  if (rows.length === 0) return null
  return (
    <table className="rv-fdt">
      <thead>
        <tr>
          <th>Route</th>
          <th>Vehicle</th>
          <th className="num">Throughput</th>
          <th className="num">Round trip</th>
          <th className="num">Cycle</th>
          <th className="num">Vehicles</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(f => {
          const d = derivedByFlowId.get(f.id)
          const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
          return (
            <tr key={f.id}>
              <td>{f.origin || '—'} <span className="rv-fdt-arrow">→</span> {f.destination || '—'}</td>
              <td>{veh?.name ?? <span className="rv-fdt-muted">Unassigned</span>}</td>
              <td className="num mono">{f.thruPerHr || 0}/hr</td>
              <td className="num mono">{Math.round(f.distanceFt || 0)} ft</td>
              <td className="num mono">{secs(d?.cycleSeconds)}</td>
              <td className="num mono">{d?.rawVehicles != null ? d.rawVehicles.toFixed(2) : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
