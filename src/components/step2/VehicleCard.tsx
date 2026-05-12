'use client'

import { useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import WhyBreakdown from './WhyBreakdown'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

interface VehicleCardProps {
  vehicle: Vehicle
  result: QualificationResult
  unitSystem: UnitSystem
}

function formatPrice(minUsd: number, maxUsd: number): string {
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`
  return `${fmt(minUsd)} – ${fmt(maxUsd)}`
}

function PartnershipBadge({ partnership }: { partnership: Vehicle['display']['partnership'] }) {
  const cls = partnership === 'TAL Integrated' ? 'tal-integrated'
    : partnership === 'TAL 3rd Party' ? 'tal-3p'
    : 'oem'
  return <span className={`badge ${cls}`}>{partnership}</span>
}

export default function VehicleCard({ vehicle, result, unitSystem }: VehicleCardProps) {
  const [showWhy, setShowWhy] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  const capDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`

  const liftDisplay = vehicle.calc.maxLiftHeightFt > 0
    ? (unitSystem === 'metric'
        ? `${(vehicle.calc.maxLiftHeightFt * 0.3048).toFixed(1)} m`
        : `${vehicle.calc.maxLiftHeightFt} ft`)
    : 'Floor level'

  const widthDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.widthFt * 0.3048).toFixed(1)} m`
    : `${vehicle.calc.widthFt} ft`

  return (
    <div className={`veh-card ${statusCls}`}>
      <div className={`veh-status-bar ${statusCls}`} />

      <div className="veh-body">
        {/* Header: name + traffic light */}
        <div className="veh-header">
          <div className="veh-name-block">
            <div className="veh-category-tag">{vehicle.display.category}</div>
            <div className="name">{vehicle.name}</div>
            <div className="mfr">{vehicle.display.manufacturer}</div>
          </div>
          <TrafficLight status={status} />
        </div>

        {/* Badges */}
        <div className="veh-badges">
          <PartnershipBadge partnership={vehicle.display.partnership} />
          {vehicle.display.tHive && (
            <span className="badge thive">T-Hive</span>
          )}
        </div>

        {/* Key specs */}
        <div className="kv-list">
          <div className="kv">
            <span className="k">Capacity</span>
            <span className="v">{capDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Lift Height</span>
            <span className="v">{liftDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Width</span>
            <span className="v">{widthDisplay}</span>
          </div>
          <div className="kv">
            <span className="k">Software</span>
            <span className="v">{vehicle.display.fleetSoftware}</span>
          </div>
          <div className="kv full">
            <span className="k">Transfer</span>
            <span className="v">{vehicle.transferMethods.map(m => m.method).join(', ')}</span>
          </div>
          <div className="kv full">
            <span className="k">Price Range</span>
            <span className="v">{formatPrice(vehicle.calc.priceRange.minUsd, vehicle.calc.priceRange.maxUsd)}</span>
          </div>
        </div>

        {/* Typical load */}
        <div className="veh-typical">{vehicle.display.typicalLoad}</div>

        {/* Footer: Why? */}
        <div className="veh-foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowWhy(v => !v)}
          >
            {showWhy ? 'Hide details' : 'View qualification details'}
          </button>
        </div>

        {showWhy && <WhyBreakdown result={result} />}
      </div>
    </div>
  )
}
