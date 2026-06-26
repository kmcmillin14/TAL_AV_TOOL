'use client'

import type { ChargeMethod, ChargeRegime, FleetGroup, Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import DerivTrigger from '@/src/components/step3/DerivTrigger'
import { chargingDerivation } from '@/src/lib/derivation'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  vehicleById: Map<string, Vehicle>
  groupByVehicle: Map<string, FleetGroup>
  derivedByFlowId: Map<string, FlowDerived>
  regime: ChargeRegime
  dailyOpHr: number
  breakHrs: number
  consecutiveOpDays: number
  shiftsPerDay: number
  hoursPerShift: number
  chargeMethods: Record<string, ChargeMethod>
  onPatch: (patch: EnginePatch) => void
}

const fmtH = (h: number | null | undefined) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtPct = (a: number | null | undefined) => (a == null ? '—' : `${Math.round(a * 100)}%`)
const fmtCycle = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s)}s`)

/**
 * Charging stage of the pipeline — the SAME per-flow rows as Flows, inputs
 * collapsed, now showing each flow's vehicle battery profile + the extra
 * vehicles charging pools in for that vehicle type. Charge regime (project) and
 * per-vehicle method are editable here; the rest is computed (read-only).
 */
export default function ChargingPipeline({
  flows, vehicleById, groupByVehicle, derivedByFlowId,
  regime, dailyOpHr, breakHrs, consecutiveOpDays, shiftsPerDay, hoursPerShift, chargeMethods, onPatch,
}: Props) {
  const rows = flows.filter(f => f.vehicleId)
  const setMethod = (vehicleId: string, method: ChargeMethod) =>
    onPatch({ chargeMethods: { ...chargeMethods, [vehicleId]: method } })

  return (
    <div className="engine-panel pipeline-wrap">
      <div className="engine-row">
        <div className="engine-context mono">
          Schedule:{' '}
          <input
            type="number"
            className="engine-inline-num mono"
            min={1}
            max={3}
            value={shiftsPerDay}
            onChange={e => {
              const v = Number(e.target.value)
              if (Number.isInteger(v) && v >= 1 && v <= 3) onPatch({ shiftsPerDay: v })
            }}
            aria-label="Shifts per day"
          />
          {' '}{shiftsPerDay === 1 ? 'shift' : 'shifts'} ×{' '}
          <input
            type="number"
            className="engine-inline-num mono"
            min={4}
            max={12}
            step={0.5}
            value={hoursPerShift}
            onChange={e => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 4 && v <= 12) onPatch({ hoursPerShift: v })
            }}
            aria-label="Hours per shift"
          />
          {' '}h = <strong>{dailyOpHr} h</strong> operating / day
        </div>
        <div className="cr-toggle">
          <span className="cr-label">Recharge window</span>
          <button type="button" className={`cr-opt${regime === 'overnight' ? ' active' : ''}`} onClick={() => onPatch({ chargeRegime: 'overnight' })}>Overnight</button>
          <button type="button" className={`cr-opt${regime === 'continuous' ? ' active' : ''}`} onClick={() => onPatch({ chargeRegime: 'continuous' })}>Continuous 24/7</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to model charging.</div>
      ) : (
        <table className="charge-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Charge method</th>
              <th className="num">Cycle</th>
              <th className="num">Vehicles</th>
              <th className="num">Runtime</th>
              <th className="num">Recharge</th>
              <th className="num">Availability</th>
              <th className="num">Charging</th>
              <th className="pl-math-col" aria-label="Fleet math"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const g = groupByVehicle.get(f.vehicleId!)
              const c = g?.charging
              const d = derivedByFlowId.get(f.id)
              const veh = vehicleById.get(f.vehicleId!)
              const delta = c?.chargingDelta ?? 0
              return (
                <tr key={f.id}>
                  <td>
                    <span className="ct-veh">
                      <VehicleDot vehicle={veh} size="sm" />
                      {veh?.name ?? f.vehicleId}
                      <span className="pl-route mono">{f.origin || '—'} → {f.destination || '—'}</span>
                    </span>
                  </td>
                  <td>
                    <div className="ct-method">
                      {(['opportunity', 'plugged'] as ChargeMethod[]).map(m => (
                        <button key={m} type="button" className={`ct-method-opt${c?.method === m ? ' active' : ''}`} onClick={() => setMethod(f.vehicleId!, m)}>
                          {m === 'opportunity' ? 'Opportunity' : 'Plugged'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="num mono">{fmtCycle(d?.cycleSeconds)}</td>
                  <td className="num mono">{d?.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2)}</td>
                  <td className="num mono">{fmtH(c?.runHr)}</td>
                  <td className="num mono">{fmtH(c?.chargeHr)}</td>
                  <td className="num mono">{fmtPct(c?.availability)}</td>
                  <td className="num">
                    <span className={`ct-delta ct-delta-${delta > 0 ? 'warn' : 'good'}`} title={c?.reason}>
                      {delta > 0 ? `+${delta}` : (c?.availability === 1 ? 'fits' : '+0')}
                    </span>
                  </td>
                  <td className="pl-math-cell">
                    {g && veh && (
                      <DerivTrigger
                        derivation={() => chargingDerivation(g, veh, { dailyOpHr, breakHrs, consecutiveOpDays })}
                        route={`${f.origin || '—'} → ${f.destination || '—'}`}
                        disabled={!c?.sustainable}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="engine-note">
        Method &amp; recharge window are inputs; runtime/availability are computed per the flow&apos;s vehicle.
        The <strong>+N</strong> extra vehicles for charging pool per vehicle type at the project level.
      </div>
    </div>
  )
}
