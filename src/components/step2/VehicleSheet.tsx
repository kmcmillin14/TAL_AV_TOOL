'use client'

import { createPortal } from 'react-dom'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import Icon from '@/src/design-system/components/Icon'
import VehicleSpecSheet from './VehicleSpecSheet'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult, GateResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'
import {
  capacityDisplay, liftValue, speedDisplay as fmtSpeed,
  batteryDisplay as fmtBattery, transferDisplay,
} from '@/src/lib/vehicleDisplay'

interface Props {
  vehicle: Vehicle
  result: QualificationResult
  unitSystem: UnitSystem
  compared: boolean
  compareDisabled: boolean
  onToggleCompare: () => void
  onClose: () => void
}

const GATE_STATUS_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', soft: 'Review', skip: 'Not set' }
function gateStatus(g: GateResult): 'pass' | 'fail' | 'soft' | 'skip' {
  return g.skipped ? 'skip' : g.passed ? 'pass' : g.severity === 'hard' ? 'fail' : 'soft'
}

/**
 * Full-screen phone detail for one vehicle: live verdict pinned at top, then the
 * gate-by-gate requirement breakdown (the desktop card's hover tooltip made
 * tappable), quick specs, and the full spec sheet. Mirrors the Step-3 FlowSheet
 * shell so the two steps feel identical on a phone.
 */
export default function VehicleSheet({ vehicle, result, unitSystem, compared, compareDisabled, onToggleCompare, onClose }: Props) {
  const { status } = result
  const barGates = [...result.hardGates, ...result.softPreferences.filter(g => !g.skipped)]
  const passedCount = barGates.filter(g => !g.skipped && g.passed).length
  const evalInProcess = status !== 'RED' && result.hardGates.some(g => g.skipped)

  const specs: [string, string][] = [
    ['Capacity', capacityDisplay(vehicle, unitSystem)],
    ['Lift', liftValue(vehicle, unitSystem)],
    ['Max Speed', fmtSpeed(vehicle, unitSystem)],
    ['Battery', fmtBattery(vehicle)],
    ['Transfer', transferDisplay(vehicle)],
  ]

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="m-fullsheet" role="dialog" aria-modal="true" aria-label={vehicle.name}>
      <div className="m-fs-head">
        <button type="button" className="m-fs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <span className="m-fs-title">{vehicle.name}</span>
        <button
          type="button"
          className={`m-fs-cmp${compared ? ' is-on' : ''}`}
          onClick={onToggleCompare}
          disabled={!compared && compareDisabled}
        >
          {compared ? '✓ Compare' : 'Compare'}
        </button>
      </div>

      <div className="m-outbar">
        <div className="m-outcell m-out-accent">
          {evalInProcess
            ? <><b className="m-out-wip"><Icon name="warn" size={15} /></b><span>Eval in process</span></>
            : <><b className="m-out-tl"><TrafficLight status={status} /></b><span>{vehicle.display.manufacturer}</span></>}
        </div>
        <div className="m-outcell"><b>{passedCount}/{barGates.length}</b><span>Checks pass</span></div>
      </div>

      <div className="m-fs-body">
        {barGates.length > 0 && (
          <>
            <div className="m-group">Requirement checks</div>
            <div className="m-gatelist">
              {barGates.map(g => {
                const st = gateStatus(g)
                return (
                  <div key={g.gateId + g.name} className="m-gaterow">
                    <span className={`vgt-dot ${st}`} aria-hidden />
                    <div className="m-gaterow-text">
                      <span className="m-gaterow-name">{g.name}</span>
                      {(st === 'fail' || st === 'soft') && <span className="m-gaterow-reason">{g.reason}</span>}
                    </div>
                    <span className={`vgt-badge ${st}`}>{GATE_STATUS_LABEL[st]}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="m-group">Quick specs</div>
        <div className="m-gatelist">
          {specs.map(([k, v]) => (
            <div key={k} className="m-specrow">
              <span className="m-specrow-k">{k}</span>
              <span className="m-specrow-v">{v}</span>
            </div>
          ))}
        </div>

        <div className="m-group">Full spec sheet</div>
        <VehicleSpecSheet vehicle={vehicle} unitSystem={unitSystem} />

        {vehicle.display.cutsheet && (
          <a className="m-fs-cutsheet" href={vehicle.display.cutsheet} download target="_blank" rel="noopener noreferrer">
            <Icon name="download" size={13} /> Download spec sheet (PDF)
          </a>
        )}
      </div>

      <div className="m-fs-foot">
        <button type="button" className="btn primary m-fs-done" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  )
}
