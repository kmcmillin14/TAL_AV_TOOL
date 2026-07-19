'use client'

import { useState } from 'react'
import type { TrafficLightStatus } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { sortByQualification } from '@/src/lib/vehicleOrder'
import { vehicleColor } from './vehicleColor'

interface Props {
  vehicles: Vehicle[]
  value?: string
  onChange: (vehicleId: string | undefined) => void
  statusById?: Map<string, TrafficLightStatus>
}

export default function VehicleSelect({ vehicles, value, onChange, statusById }: Props) {
  const ordered = statusById ? sortByQualification(vehicles, statusById) : vehicles
  return (
    <select
      className="flow-veh-select"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
    >
      <option value="">— pick vehicle —</option>
      {ordered.map(v => {
        const s = statusById?.get(v.id)
        return (
          <option key={v.id} value={v.id}>
            {v.name}{s === 'RED' ? ' — not qualified' : s === 'YELLOW' ? ' — review' : ''}
          </option>
        )
      })}
    </select>
  )
}

interface ThumbProps {
  vehicle?: Vehicle
  /** 'sm' = 32×18 (table row); 'lg' = 40×22 (summary strip). */
  size?: 'sm' | 'lg'
}

/**
 * Thumbnail-aware vehicle marker. When a vehicle is provided, renders the
 * vehicle's hero image at the configured size. On image error (missing or
 * broken file), falls back to the deterministic colored dot. Without a
 * vehicle, renders an empty dashed dot placeholder.
 */
export function VehicleDot({ vehicle, size = 'sm' }: ThumbProps) {
  const [imgError, setImgError] = useState(false)

  if (!vehicle) {
    return <span className="veh-dot veh-dot-empty" />
  }

  if (imgError || !vehicle.display.heroImage) {
    return (
      <span
        className="veh-dot"
        style={{ background: vehicleColor(vehicle.id) }}
        title={vehicle.name}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- design-system-sized thumbnail; CSS controls dimensions
    <img
      src={vehicle.display.heroImage}
      alt={vehicle.name}
      className={`veh-thumb veh-thumb-${size}`}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  )
}
