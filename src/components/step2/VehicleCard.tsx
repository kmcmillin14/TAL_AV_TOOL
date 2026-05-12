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

function integrationLabel(partnership: string): { label: string; cls: string } {
  if (partnership === 'TAL Integrated') return { label: 'TAL Integrated', cls: 'int-tal' }
  if (partnership === 'TAL 3rd Party') return { label: '3rd Party', cls: 'int-3p' }
  return { label: 'OEM', cls: 'int-oem' }
}

export default function VehicleCard({ vehicle, result, unitSystem }: VehicleCardProps) {
  const [showWhy, setShowWhy] = useState(false)
  const [imgError, setImgError] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  const capDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`

  const integration = integrationLabel(vehicle.display.partnership)
  const transfers = vehicle.transferMethods.map(m => m.method).join(' / ')

  return (
    <div className={`veh-card ${statusCls}`}>
      <div className={`veh-status-bar ${statusCls}`} />

      {/* Vehicle image */}
      <div className="veh-img-area">
        {vehicle.display.heroImage && !imgError ? (
          <img
            src={vehicle.display.heroImage}
            alt={vehicle.name}
            className="veh-photo"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="veh-no-img">{vehicle.display.category}</div>
        )}
        <div className={`veh-integration ${integration.cls}`}>{integration.label}</div>
      </div>

      <div className="veh-body">
        {/* Name + status */}
        <div className="veh-header">
          <div className="veh-name-block">
            <div className="name">{vehicle.name}</div>
            <div className="mfr">{vehicle.display.manufacturer}</div>
          </div>
          <TrafficLight status={status} />
        </div>

        {/* Specs grid */}
        <div className="veh-specs">
          <div className="veh-spec">
            <div className="spec-label">Weight Capacity</div>
            <div className="spec-value">{capDisplay}</div>
          </div>
          <div className="veh-spec">
            <div className="spec-label">Payload Type</div>
            <div className="spec-value">{vehicle.display.typicalLoad}</div>
          </div>
          <div className="veh-spec">
            <div className="spec-label">Transfer</div>
            <div className="spec-value">{transfers}</div>
          </div>
          <div className="veh-spec">
            <div className="spec-label">Fleet Software</div>
            <div className="spec-value">{vehicle.display.fleetSoftware}</div>
          </div>
        </div>

        {/* T-Hive badge if applicable */}
        {vehicle.display.tHive && (
          <div className="veh-thive-badge">T-Hive Compatible</div>
        )}

        {/* Footer */}
        <div className="veh-foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowWhy(v => !v)}
          >
            {showWhy ? 'Hide details' : 'Qualification details'}
          </button>
        </div>

        {showWhy && <WhyBreakdown result={result} />}
      </div>
    </div>
  )
}
