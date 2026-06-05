'use client'

import type { ChargeMethod, ChargeRegime, FleetSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import type { EnginePatch } from './types'

interface Props {
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
  regime: ChargeRegime
  dailyOpHr: number
  shiftsPerDay: number
  hoursPerShift: number
  chargeMethods: Record<string, ChargeMethod>
  onPatch: (patch: EnginePatch) => void
}

const fmtH = (h: number | null) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtPct = (a: number | null) => (a == null ? '—' : `${Math.round(a * 100)}%`)

export default function ChargingTab({
  fleet, vehicleById, regime, dailyOpHr, shiftsPerDay, hoursPerShift, chargeMethods, onPatch,
}: Props) {
  const setMethod = (vehicleId: string, method: ChargeMethod) =>
    onPatch({ chargeMethods: { ...chargeMethods, [vehicleId]: method } })

  return (
    <div className="engine-panel">
      <div className="engine-row">
        <div className="engine-context mono">
          Schedule: {shiftsPerDay} {shiftsPerDay === 1 ? 'shift' : 'shifts'} × {hoursPerShift} h
          = <strong>{dailyOpHr} h</strong> operating / day
        </div>
        <div className="cr-toggle" role="tablist" aria-label="Recharge window">
          <span className="cr-label">Recharge window</span>
          <button
            type="button"
            className={`cr-opt${regime === 'overnight' ? ' active' : ''}`}
            aria-selected={regime === 'overnight'}
            onClick={() => onPatch({ chargeRegime: 'overnight' })}
          >Overnight</button>
          <button
            type="button"
            className={`cr-opt${regime === 'continuous' ? ' active' : ''}`}
            aria-selected={regime === 'continuous'}
            onClick={() => onPatch({ chargeRegime: 'continuous' })}
          >Continuous 24/7</button>
        </div>
      </div>

      {fleet.groups.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to model charging.</div>
      ) : (
        <table className="charge-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Charge method</th>
              <th className="num">Runtime</th>
              <th className="num">Recharge</th>
              <th className="num">Availability</th>
              <th className="num">Charging</th>
            </tr>
          </thead>
          <tbody>
            {fleet.groups.map(g => {
              const veh = vehicleById.get(g.vehicleId)
              const c = g.charging
              const tone = c.chargingDelta > 0 ? 'warn' : 'good'
              return (
                <tr key={g.vehicleId}>
                  <td>
                    <span className="ct-veh"><VehicleDot vehicle={veh} size="sm" />{veh?.name ?? g.vehicleId}</span>
                  </td>
                  <td>
                    <div className="ct-method">
                      {(['opportunity', 'plugged'] as ChargeMethod[]).map(m => (
                        <button
                          key={m}
                          type="button"
                          className={`ct-method-opt${c.method === m ? ' active' : ''}`}
                          onClick={() => setMethod(g.vehicleId, m)}
                        >{m === 'opportunity' ? 'Opportunity' : 'Plugged'}</button>
                      ))}
                    </div>
                  </td>
                  <td className="num mono">{fmtH(c.runHr)}</td>
                  <td className="num mono">{fmtH(c.chargeHr)}</td>
                  <td className="num mono">{fmtPct(c.availability)}</td>
                  <td className="num">
                    <span className={`ct-delta ct-delta-${tone}`} title={c.reason}>
                      {c.chargingDelta > 0 ? `+${c.chargingDelta}` : (c.availability === 1 ? 'fits' : '+0')}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="engine-note">
        Runtime = usable Ah ÷ discharge A. A vehicle whose runtime covers the day recharges off-shift
        (Overnight) and adds nothing. Otherwise extra vehicles cover charging downtime —
        Plugged uses runtime vs. recharge time; Opportunity tops up during idle.
      </div>
    </div>
  )
}
