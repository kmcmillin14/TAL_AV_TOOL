'use client'

import { useEffect, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
}

/** Lightweight vehicle card data — only what the picker renders. */
interface PickVehicle {
  id: string
  name: string
  category: string
  typicalLoad: string
  heroImage: string
  maxWeightLbs: number
}

function toCard(v: Vehicle): PickVehicle {
  return {
    id: v.id,
    name: v.name,
    category: v.display.category,
    typicalLoad: v.display.typicalLoad,
    heroImage: v.display.heroImage,
    maxWeightLbs: v.calc.maxWeightLbs,
  }
}

/** Visual multi-select of the TAL vehicles. Customer-facing: image + name +
 *  what it is + unit type + max capacity. Self-contained — fetches the public
 *  /api/vehicles endpoint (no storage / Step-1 coupling). */
export default function VehiclePicker({ value, onChange }: Props) {
  const [vehicles, setVehicles] = useState<PickVehicle[] | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/vehicles')
      .then(r => (r.ok ? r.json() : []))
      .then((data: Vehicle[]) => { if (active) setVehicles(Array.isArray(data) ? data.map(toCard) : []) })
      .catch(() => { if (active) setVehicles([]) })
    return () => { active = false }
  }, [])

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])

  if (vehicles === null) return <div className="help">Loading vehicles…</div>
  if (vehicles.length === 0) return <div className="help">Vehicle list unavailable — describe your vehicle in mind below.</div>

  return (
    <div className="veh-pick-grid">
      {vehicles.map(v => {
        const on = value.includes(v.id)
        return (
          <button
            type="button"
            key={v.id}
            className={`veh-pick-card${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(v.id)}
          >
            <span className="veh-pick-check">{on && <Icon name="check" size={12} />}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- static vehicle art */}
            <img className="veh-pick-img" src={v.heroImage} alt={v.name} />
            <span className="veh-pick-name">{v.name}</span>
            <span className="veh-pick-cat">{v.category}</span>
            <span className="veh-pick-meta">{v.typicalLoad} · up to {v.maxWeightLbs.toLocaleString()} lbs</span>
          </button>
        )
      })}
    </div>
  )
}
