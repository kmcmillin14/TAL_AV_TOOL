'use client'

import { useEffect } from 'react'
import Icon from '@/src/design-system/components/Icon'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult, TrafficLightStatus } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'
import {
  capacityDisplay, liftDisplay, rampDisplay, speedDisplay,
  batteryDisplay, chargeDisplay, transferDisplay, payloadsDisplay,
} from '@/src/lib/vehicleDisplay'

export interface CompareEntry {
  vehicle: Vehicle
  result: QualificationResult
}

interface Props {
  entries: CompareEntry[]
  unitSystem: UnitSystem
  onClose: () => void
  onRemove: (id: string) => void
}

const STATUS_LABEL: Record<TrafficLightStatus, string> = {
  GREEN: 'Compatible',
  YELLOW: 'Review Required',
  RED: 'Not Compatible',
}

/** One spec row: a label and a value-getter per vehicle. `diff` marks rows
 *  where the values differ across vehicles so they can be highlighted. */
interface SpecRow {
  label: string
  get: (v: Vehicle, unit: UnitSystem) => string
}

const SPEC_ROWS: SpecRow[] = [
  { label: 'Capacity', get: capacityDisplay },
  { label: 'Max Lift', get: liftDisplay },
  { label: 'Max Ramp Grade', get: v => rampDisplay(v) },
  { label: 'Max Speed', get: speedDisplay },
  { label: 'Battery', get: v => batteryDisplay(v) },
  { label: 'Charge Time', get: v => chargeDisplay(v) },
  { label: 'Payloads', get: v => payloadsDisplay(v) },
  { label: 'Transfer', get: v => transferDisplay(v) },
]

export default function ComparisonModal({ entries, unitSystem, onClose, onRemove }: Props) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cmp-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compare vehicles">
      <div className="cmp-modal" onClick={e => e.stopPropagation()}>
        <div className="cmp-head">
          <h2>Compare {entries.length} vehicle{entries.length === 1 ? '' : 's'}</h2>
          <button type="button" className="cmp-close" aria-label="Close comparison" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cmp-scroll">
          <table className="cmp-table">
            <thead>
              <tr>
                <th className="cmp-rowhead" />
                {entries.map(({ vehicle }) => (
                  <th key={vehicle.id} className="cmp-vehhead">
                    <div className="cmp-veh-img">
                      {vehicle.display.heroImage
                        // eslint-disable-next-line @next/next/no-img-element -- small compare thumbnail
                        ? <img src={vehicle.display.heroImage} alt={vehicle.name} />
                        : <div className="cmp-veh-noimg">{vehicle.display.category}</div>}
                    </div>
                    <div className="cmp-veh-name">{vehicle.name}</div>
                    <div className="cmp-veh-mfr">{vehicle.display.manufacturer}</div>
                    <button
                      type="button"
                      className="cmp-veh-remove"
                      aria-label={`Remove ${vehicle.name} from comparison`}
                      onClick={() => onRemove(vehicle.id)}
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Status row */}
              <tr>
                <td className="cmp-rowhead">Status</td>
                {entries.map(({ vehicle, result }) => {
                  const cls = result.status.toLowerCase()
                  return (
                    <td key={vehicle.id} className="cmp-cell">
                      <span className={`cmp-status ${cls}`}>
                        <span className={`tl-dot ${cls}`} />
                        {STATUS_LABEL[result.status]}
                      </span>
                    </td>
                  )
                })}
              </tr>

              {SPEC_ROWS.map(row => {
                const values = entries.map(({ vehicle }) => row.get(vehicle, unitSystem))
                const allSame = values.every(v => v === values[0])
                return (
                  <tr key={row.label}>
                    <td className="cmp-rowhead">{row.label}</td>
                    {values.map((val, i) => (
                      <td
                        key={entries[i].vehicle.id}
                        className={`cmp-cell${allSame ? '' : ' diff'}`}
                      >
                        {val}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="cmp-foot">
          <span className="cmp-foot-note">
            Highlighted cells differ across the selected vehicles.
          </span>
        </div>
      </div>
    </div>
  )
}
