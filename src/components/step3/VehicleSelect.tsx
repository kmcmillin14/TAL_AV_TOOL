'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { vehicleColor } from './vehicleColor'

interface Props {
  vehicles: Vehicle[]
  value?: string
  onChange: (vehicleId: string | undefined) => void
}

export default function VehicleSelect({ vehicles, value, onChange }: Props) {
  return (
    <select
      className="flow-veh-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
    >
      <option value="">— pick vehicle —</option>
      {vehicles.map(v => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
    </select>
  )
}

export function VehicleDot({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return <span className="veh-dot veh-dot-empty" />
  return <span className="veh-dot" style={{ background: vehicleColor(vehicleId) }} />
}
