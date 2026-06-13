'use client'

import { useEffect, useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import Icon from '@/src/design-system/components/Icon'
import VehicleSpecSheet from './VehicleSpecSheet'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'
import {
  capacityDisplay, liftOrRampLabel, liftOrRampDisplay,
  speedDisplay as fmtSpeed, batteryDisplay as fmtBattery, batteryLifeDisplay as fmtBatteryLife,
  transferDisplay, payloadsDisplay,
} from '@/src/lib/vehicleDisplay'

interface VehicleCardProps {
  vehicle: Vehicle
  result: QualificationResult
  unitSystem: UnitSystem
  filterKey: string
}

type Face = 'front' | 'back'

function isTAL(partnership: string) {
  return partnership === 'TAL Integrated' || partnership === 'TAL 3rd Party'
}

export default function VehicleCard({ vehicle, result, unitSystem, filterKey }: VehicleCardProps) {
  const [face, setFace] = useState<Face>('front')
  const [imgError, setImgError] = useState(false)
  const { status } = result
  const statusCls = status.toLowerCase() as 'green' | 'yellow' | 'red'

  // Reset to front face whenever the filter signature changes,
  // so a card doesn't stay on the back after filter narrows the visible set.
  useEffect(() => {
    setFace('front')
  }, [filterKey])

  const isBack = face === 'back'

  // ── Triage derivations (front face) ──────────────────────────────────────
  const allGates = [...result.hardGates, ...result.softPreferences]
  const evaluated = allGates.filter(g => !g.skipped)
  const passedCount = evaluated.filter(g => g.passed).length
  // Per-gate status class for the bar + hover tooltip.
  const gateStatus = (g: typeof allGates[number]) =>
    g.skipped ? 'skip' : g.passed ? 'pass' : g.severity === 'hard' ? 'fail' : 'soft'
  const gateStatusLabel: Record<string, string> = {
    pass: 'Pass', fail: 'Fail', soft: 'Review', skip: 'n/a',
  }
  // Spec display strings — shared with the comparison modal (src/lib/vehicleDisplay.ts)
  const capDisplay = capacityDisplay(vehicle, unitSystem)
  const transfers = transferDisplay(vehicle)
  const row2Label = liftOrRampLabel(vehicle)
  const row2Value = liftOrRampDisplay(vehicle, unitSystem)
  const speedDisplay = fmtSpeed(vehicle, unitSystem)
  const batteryDisplay = fmtBattery(vehicle)
  const batteryLifeDisplay = fmtBatteryLife(vehicle)

  return (
    <div className={`veh-card ${statusCls}`}>
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
              ? <>
                  {/* Theme-aware via CSS (data-theme), so it never desyncs from the live theme */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- static TAL badge sized by CSS */}
                  <img src="/assets/TAL-Logo-White.png" alt="TAL" className="veh-tal-logo is-dark" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- static TAL badge sized by CSS */}
                  <img src="/assets/TAL-Logo-Black.png" alt="" aria-hidden className="veh-tal-logo is-light" />
                </>
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

            {evaluated.length > 0 && (
              <div
                className="veh-gatebar"
                tabIndex={isBack ? -1 : 0}
                aria-label={`${passedCount} of ${evaluated.length} requirement checks pass — hover for detail`}
              >
                <div className="veh-gatebar-top">
                  <span className="veh-gatebar-cap">Requirement checks</span>
                  <span className="veh-gatebar-count mono">{passedCount}/{evaluated.length}</span>
                </div>
                <div className="veh-gatebar-segs">
                  {allGates.map(g => (
                    <span
                      key={g.gateId + g.name}
                      className={`vg-seg ${gateStatus(g)}`}
                    />
                  ))}
                </div>

                {/* Hover/focus tooltip — full pass/fail breakdown at a glance */}
                <div className="veh-gatebar-tip" role="tooltip">
                  {allGates.map(g => {
                    const st = gateStatus(g)
                    return (
                      <div key={g.gateId + g.name} className="vgt-row">
                        <span className={`vgt-dot ${st}`} aria-hidden />
                        <div className="vgt-text">
                          <span className="vgt-name">{g.name}</span>
                          {(st === 'fail' || st === 'soft') && (
                            <span className="vgt-reason">{g.reason}</span>
                          )}
                        </div>
                        <span className={`vgt-badge ${st}`}>{gateStatusLabel[st]}</span>
                      </div>
                    )
                  })}
                </div>
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
                <span className="spec-v">{capDisplay}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">{row2Label}</span>
                <span className="spec-v">{row2Value}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">Max Speed</span>
                <span className="spec-v">{speedDisplay}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">Battery</span>
                <span className="spec-v">{batteryDisplay}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">Battery Life</span>
                <span className="spec-v">{batteryLifeDisplay}</span>
              </div>
              <div className="veh-spec-row">
                <span className="spec-k">Payloads</span>
                <span className="spec-v">{payloadsDisplay(vehicle)}</span>
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
                Full Spec Sheet →
              </button>
            </div>
          </div>
        </div>

        {/* ───────── BACK ───────── */}
        <div className="veh-card-face veh-card-back" aria-hidden={!isBack}>
          <div className="veh-back-title">
            <span className="bt-name">{vehicle.name}</span>
            <div className="veh-back-title-actions">
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
          </div>

          <div className="veh-back-content">
            <VehicleSpecSheet vehicle={vehicle} unitSystem={unitSystem} />
          </div>
        </div>
      </div>
    </div>
  )
}
