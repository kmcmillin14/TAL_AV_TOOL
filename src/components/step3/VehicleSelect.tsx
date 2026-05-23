'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { vehicleColor } from './vehicleColor'

interface Props {
  vehicles: Vehicle[]
  value?: string
  flowWeightLbs: number
  onChange: (vehicleId: string | undefined) => void
}

export default function VehicleSelect({ vehicles, value, flowWeightLbs, onChange }: Props) {
  return (
    <select
      className="flow-veh-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
    >
      <option value="">— pick vehicle —</option>
      {vehicles.map(v => {
        const overweight = flowWeightLbs > v.calc.maxWeightLbs
        return (
          <option
            key={v.id}
            value={v.id}
            disabled={overweight}
            title={overweight
              ? `Exceeds ${v.calc.maxWeightLbs.toLocaleString()} lb max load`
              : undefined}
          >
            {v.name}{overweight ? '  (over max load)' : ''}
          </option>
        )
      })}
    </select>
  )
}

export function VehicleDot({ vehicleId }: { vehicleId?: string }) {
  if (!vehicleId) return <span className="veh-dot veh-dot-empty" />
  return <span className="veh-dot" style={{ background: vehicleColor(vehicleId) }} />
}
