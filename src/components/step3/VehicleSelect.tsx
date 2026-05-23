'use client'

import { useState } from 'react'
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
    <img
      src={vehicle.display.heroImage}
      alt={vehicle.name}
      className={`veh-thumb veh-thumb-${size}`}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  )
}
