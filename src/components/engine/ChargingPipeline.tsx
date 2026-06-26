'use client'

import type { FleetGroup, Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import DerivTrigger from '@/src/components/step3/DerivTrigger'
import { chargingDerivation } from '@/src/lib/derivation'
import type { EnginePatch } from './types'

/** Days/week ↔ standard operating pattern (the inline days box maps to a pattern). */
const PATTERN_BY_DAYS: Record<number, string> = { 5: 'Mon–Fri', 6: 'Mon–Sat', 7: 'Mon–Sun' }

interface Props {
  flows: Flow[]
  vehicleById: Map<string, Vehicle>
  groupByVehicle: Map<string, FleetGroup>
  derivedByFlowId: Map<string, FlowDerived>
  dailyOpHr: number
  breakHrs: number
  consecutiveOpDays: number
  shiftsPerDay: number
  hoursPerShift: number
  daysPerWeek: number
  onPatch: (patch: EnginePatch) => void
}

const fmtH = (h: number | null | undefined) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtPct = (a: number | null | undefined) => (a == null ? '—' : `${Math.round(a * 100)}%`)
const fmtCycle = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s)}s`)

/**
 * Charging stage of the pipeline — the SAME per-flow rows as Flows, inputs
 * collapsed, now showing each flow's vehicle battery profile + the extra
 * vehicles charging pools in for that vehicle type. Schedule (shifts/hours) and the
 * operating-days pattern are editable here; everything else is computed (read-only).
 */
export default function ChargingPipeline({
  flows, vehicleById, groupByVehicle, derivedByFlowId,
  dailyOpHr, breakHrs, consecutiveOpDays, shiftsPerDay, hoursPerShift, daysPerWeek, onPatch,
}: Props) {
  const rows = flows.filter(f => f.vehicleId)

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
          {' '}h = <strong>{dailyOpHr} h</strong> ×{' '}
          <select
            className="engine-inline-num mono"
            value={String(daysPerWeek)}
            onChange={e => {
              const pat = PATTERN_BY_DAYS[Number(e.target.value)]
              if (pat) onPatch({ operatingDaysPattern: pat })
            }}
            aria-label="Operating days per week"
          >
            {!PATTERN_BY_DAYS[daysPerWeek] && <option value={String(daysPerWeek)}>{daysPerWeek}</option>}
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
          </select>
          {' '}days / week
          {breakHrs > 0 ? ` · ${+breakHrs.toFixed(2)} h breaks` : ''}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to model charging.</div>
      ) : (
        <table className="charge-table">
          <thead>
            <tr>
              <th>Flow</th>
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
                  <td className="num mono">{fmtCycle(d?.cycleSeconds)}</td>
                  <td className="num mono">{d?.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2)}</td>
                  <td className="num mono">{fmtH(c?.runHr)}</td>
                  <td className="num mono">{fmtH(c?.chargeHr)}</td>
                  <td className="num mono">{fmtPct(c?.availability)}</td>
                  <td className="num">
                    <span className={`ct-delta ct-delta-${delta > 0 ? 'warn' : 'good'}`} title={c?.reason}>
                      {delta > 0 ? `+${delta}` : '+0'}
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
        Availability is computed per vehicle type from its battery, the schedule, and the operating
        days — breaks, off-shift hours, and days off all charge (a day off recharges to 100%).
        The <strong>+N</strong> extra vehicles for charging pool per vehicle type at the project level.
      </div>
    </div>
  )
}
