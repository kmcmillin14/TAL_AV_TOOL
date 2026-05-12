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

function isTAL(partnership: string) {
  return partnership === 'TAL Integrated'
}

function integrationDisplay(partnership: string): string {
  if (partnership === 'TAL Integrated') return 'TAL Integrated'
  if (partnership === 'TAL 3rd Party' || partnership === '3rd Party') return '3rd Party'
  return 'OEM'
}

export default function VehicleCard({ vehicle, result, unitSystem }: VehicleCardProps) {
  const [showWhy, setShowWhy] = useState(false)
  const [imgError, setImgError] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  const capDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`

  const transfers = vehicle.transferMethods.map(m => m.method).join(' / ')

  return (
    <div className={`veh-card ${statusCls}`}>
      <div className={`veh-status-bar ${statusCls}`} />

      {/* Vehicle image with integration badge overlay */}
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
        {isTAL(vehicle.display.partnership)
          ? <div className="veh-integration int-tal">TAL</div>
          : <div className="veh-integration int-3p">3rd Party</div>
        }
      </div>

      <div className="veh-body">
        <div className="veh-header">
          <div className="veh-name-block">
            <div className="name">{vehicle.name}</div>
            <div className="mfr">{vehicle.display.manufacturer}</div>
          </div>
          <TrafficLight status={status} />
        </div>

        {/* Spec rows */}
        <div className="veh-spec-list">
          <div className="veh-spec-row">
            <span className="spec-k">OEM</span>
            <span className="spec-v">{vehicle.display.manufacturer}</span>
          </div>
          <div className="veh-spec-row">
            <span className="spec-k">Integration</span>
            <span className="spec-v">{integrationDisplay(vehicle.display.partnership)}</span>
          </div>
          <div className="veh-spec-row">
            <span className="spec-k">Fleet Management</span>
            <span className="spec-v">{vehicle.display.fleetSoftware}</span>
          </div>
          <div className="veh-spec-row">
            <span className="spec-k">Weight Capacity</span>
            <span className="spec-v">{capDisplay}</span>
          </div>
          <div className="veh-spec-row">
            <span className="spec-k">Payload Type</span>
            <span className="spec-v">{vehicle.display.typicalLoad}</span>
          </div>
          <div className="veh-spec-row">
            <span className="spec-k">Transfer</span>
            <span className="spec-v">{transfers}</span>
          </div>
        </div>

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
