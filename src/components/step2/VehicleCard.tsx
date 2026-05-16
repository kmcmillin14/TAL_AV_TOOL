'use client'

import { useEffect, useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import WhyBreakdown from './WhyBreakdown'
import VehicleSpecSheet from './VehicleSpecSheet'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

interface VehicleCardProps {
  vehicle: Vehicle
  result: QualificationResult
  unitSystem: UnitSystem
  filterKey: string
}

type Face = 'front' | 'back'
type BackTab = 'qual' | 'specs'

function isTAL(partnership: string) {
  return partnership === 'TAL Integrated'
}

function integrationDisplay(partnership: string): string {
  if (partnership === 'TAL Integrated') return 'TAL Integrated'
  if (partnership === 'TAL 3rd Party' || partnership === '3rd Party') return '3rd Party'
  return 'OEM'
}

export default function VehicleCard({ vehicle, result, unitSystem, filterKey }: VehicleCardProps) {
  const [face, setFace] = useState<Face>('front')
  const [backTab, setBackTab] = useState<BackTab>('qual')
  const [imgError, setImgError] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  // Reset to front face whenever the filter signature changes,
  // so a card doesn't stay on the back after filter narrows the visible set.
  useEffect(() => {
    setFace('front')
  }, [filterKey])

  const capDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`

  const transfers = vehicle.transferMethods.map(m => m.method).join(' / ')
  const isBack = face === 'back'

  return (
    <div className={`veh-card ${statusCls}`}>
      <div className={`veh-status-bar ${statusCls}`} />
      <div className={`veh-card-inner ${isBack ? 'flipped' : ''}`}>

        {/* ───────── FRONT ───────── */}
        <div className="veh-card-face veh-card-front" aria-hidden={isBack}>
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
              ? <img src="/assets/TAL-Logo-White.png" alt="TAL" className="veh-tal-logo" />
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

            <div className="veh-foot">
              <button
                type="button"
                className="link-btn"
                onClick={() => setFace('back')}
                tabIndex={isBack ? -1 : 0}
              >
                View details →
              </button>
            </div>
          </div>
        </div>

        {/* ───────── BACK ───────── */}
        <div className="veh-card-face veh-card-back" aria-hidden={!isBack}>
          <div className="veh-back-title">
            <span className="bt-name">{vehicle.name}</span>
            <span className="bt-sep" aria-hidden>·</span>
            <span className="bt-mfr">{vehicle.display.manufacturer}</span>
            <span className="bt-status"><TrafficLight status={status} /></span>
          </div>

          <div className="veh-back-tabs" role="tablist" aria-label="Vehicle details">
            <button
              type="button"
              role="tab"
              aria-selected={backTab === 'qual'}
              className={`veh-back-tab ${backTab === 'qual' ? 'on' : ''}`}
              onClick={() => setBackTab('qual')}
              tabIndex={isBack ? 0 : -1}
            >
              Qualification
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={backTab === 'specs'}
              className={`veh-back-tab ${backTab === 'specs' ? 'on' : ''}`}
              onClick={() => setBackTab('specs')}
              tabIndex={isBack ? 0 : -1}
            >
              Specs
            </button>
            <button
              type="button"
              className="veh-back-close"
              aria-label="Back to summary"
              onClick={() => setFace('front')}
              tabIndex={isBack ? 0 : -1}
            >
              ←
            </button>
          </div>

          <div className="veh-back-content" role="tabpanel">
            {backTab === 'qual'
              ? <WhyBreakdown result={result} />
              : <VehicleSpecSheet vehicle={vehicle} unitSystem={unitSystem} />
            }
          </div>
        </div>
      </div>
    </div>
  )
}
