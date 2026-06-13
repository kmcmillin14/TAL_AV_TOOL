'use client'

import { useEffect, useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import Icon from '@/src/design-system/components/Icon'
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
  return partnership === 'TAL Integrated' || partnership === 'TAL 3rd Party'
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

  // ── Triage derivations (front face) ──────────────────────────────────────
  const allGates = [...result.hardGates, ...result.softPreferences]
  const evaluated = allGates.filter(g => !g.skipped)
  const passedCount = evaluated.filter(g => g.passed).length
  const hardFails = result.hardGates.filter(g => !g.skipped && !g.passed)
  const softFails = result.softPreferences.filter(g => !g.skipped && !g.passed)
  // The one-liner that answers "what killed it?" without flipping the card.
  const verdict =
    hardFails.length > 0 ? hardFails[0].reason
    : softFails.length > 0 ? softFails[0].reason
    : evaluated.length > 0 ? `Meets all ${evaluated.length} evaluated requirement${evaluated.length === 1 ? '' : 's'}`
    : 'No requirements entered yet — fill the qualification tier in Step 1'
  // Capacity headroom vs the entered load (weight gate carries the numerics).
  const weightGate = result.hardGates.find(g => g.gateId === 'weight' && !g.skipped)
  const headroom = weightGate?.vehicleNumeric && weightGate?.requiredNumeric
    ? weightGate.vehicleNumeric / weightGate.requiredNumeric
    : null
  const liftFt = vehicle.calc.maxLiftHeightFt
  const canLift = liftFt != null && liftFt > 0
  const liftDisplay = canLift
    ? (unitSystem === 'metric' ? `${(liftFt! * 0.3048).toFixed(1)} m` : `${liftFt} ft`)
    : '—'
  // Vehicles without lift (tuggers/tow class) show max loaded speed instead.
  const speedMph = vehicle.calc.speedLoadedFps * 0.6818
  const speedDisplay = unitSystem === 'metric'
    ? `${(vehicle.calc.speedLoadedFps * 1.0973).toFixed(1)} km/h`
    : `${speedMph.toFixed(1)} mph`

  return (
    <div className={`veh-card ${statusCls}`}>
      <div className={`veh-status-bar ${statusCls}`} />
      <div className={`veh-card-inner ${isBack ? 'flipped' : ''}`}>

        {/* ───────── FRONT ───────── */}
        <div className="veh-card-face veh-card-front" aria-hidden={isBack}>
          <div className="veh-img-area">
            {vehicle.display.heroImage && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element -- 16:9 card photo sized via CSS object-fit
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
              // eslint-disable-next-line @next/next/no-img-element -- static TAL badge sized by CSS
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

            <div className={`veh-verdict ${statusCls}`}>{verdict}</div>
            {evaluated.length > 0 && (
              <div className="veh-gatebar" aria-label={`${passedCount} of ${evaluated.length} evaluated gates pass`}>
                <div className="veh-gatebar-segs">
                  {allGates.map(g => (
                    <span
                      key={g.gateId + g.name}
                      title={`${g.name}: ${g.reason}`}
                      className={`vg-seg ${g.skipped ? 'skip' : g.passed ? 'pass' : g.severity === 'hard' ? 'fail' : 'soft'}`}
                    />
                  ))}
                </div>
                <span className="veh-gatebar-count mono">{passedCount}/{evaluated.length}</span>
              </div>
            )}

            {result.perLoad && result.perLoad.length > 1 && (
              <div className="veh-load-chips" aria-label="Per-load compatibility">
                {result.perLoad.map(l => (
                  <span key={l.loadId} className={`veh-load-chip ${l.passed ? 'pass' : 'fail'}`}>
                    <span className="dot" aria-hidden />
                    {l.unitType || 'Load'}
                  </span>
                ))}
              </div>
            )}

            <div className="veh-spec-list">
              <div className="veh-spec-row">
                <span className="spec-k">Capacity</span>
                <span className="spec-v">
                  {capDisplay}
                  {headroom != null && (
                    <span className={`spec-headroom ${headroom >= 1 ? 'ok' : 'short'}`}>
                      {' '}· {headroom >= 1 ? `${headroom.toFixed(1)}× your load` : `${Math.round(headroom * 100)}% of your load`}
                    </span>
                  )}
                </span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">{canLift ? 'Max Lift' : 'Max Speed'}</span>
                <span className="spec-v">{canLift ? liftDisplay : speedDisplay}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">Payloads</span>
                <span className="spec-v">{vehicle.payloadTypes.join(', ')}</span>
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
          {vehicle.display.cutsheet && (
            <a
              className="veh-back-download"
              href={vehicle.display.cutsheet}
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Download spec sheet (PDF)"
              onClick={e => e.stopPropagation()}
            >
              <Icon name="download" size={12} /> Spec sheet
            </a>
          )}
          <div className="veh-back-title">
            <span className="bt-name">{vehicle.name}</span>
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
