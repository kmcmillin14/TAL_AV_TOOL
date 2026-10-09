'use client'

import { useState } from 'react'
import type { FleetGroup, Flow } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import DerivTrigger from '@/src/components/step3/DerivTrigger'
import { bufferDerivation } from '@/src/lib/derivation'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  vehicleById: Map<string, Vehicle>
  groupByVehicle: Map<string, FleetGroup>
  targetUtilization: number
  onPatch: (patch: EnginePatch) => void
}

/** Named target-utilization policies. AMR fleets are sized to a peak utilization;
 *  past ~85% queueing/blocking wait climbs non-linearly. Standard moved to 90%
 *  on 2026-10-09: the entered throughput is PEAK, so the fleet already carries a
 *  spike allowance and 80% bought the same insurance twice. The queueing effect
 *  is congestion and belongs in the route layout factor, not in fleet count.
 *  A stored value matching none (a legacy buffer) shows as Custom automatically. */
const UTIL_PRESETS = [
  { key: 'conservative', label: 'Conservative', util: 0.80 },
  { key: 'standard',     label: 'Standard',     util: 0.90 },
  { key: 'aggressive',   label: 'Aggressive',   util: 0.95 },
] as const

const presetFor = (targetUtilization: number) =>
  UTIL_PRESETS.find(p => Math.abs(p.util - targetUtilization) < 0.001)

const clampUtilPct = (v: number) => Math.min(100, Math.max(50, v))   // 50% keeps buffer ≤ 1.0 (schema max)

/**
 * Target-utilization section — the per-flow vehicle waterfall
 * base → +charging → +headroom → fleet (sold). The three stages ADD exactly.
 * One vocabulary: the engineer sets a target utilization and that is what is
 * stored; v4 retired the inverse "buffer multiplier" that used to appear beside
 * it. "Headroom" now names only the +N vehicles, never the dial.
 * Per-flow figures are the vehicle group's (pooled per vehicle type).
 */
export default function BufferPipeline({ flows, vehicleById, groupByVehicle, targetUtilization, onPatch }: Props) {
  const rows = flows.filter(f => f.vehicleId)
  const utilPct = Math.round(targetUtilization * 100)
  const preset = presetFor(targetUtilization)
  // Once the user picks "Custom…" the input stays visible even if they type a
  // value that happens to equal a preset.
  const [customOpen, setCustomOpen] = useState(false)
  const showCustom = customOpen || !preset
  return (
    <div className="engine-panel pipeline-wrap">
      <div className="buffer-control">
        <span className="bc-label">Target utilization</span>
        <select
          className="buffer-select"
          value={showCustom ? 'custom' : preset!.key}
          onChange={e => {
            const choice = UTIL_PRESETS.find(p => p.key === e.target.value)
            if (choice) {
              setCustomOpen(false)
              onPatch({ targetUtilization: choice.util })
            } else {
              setCustomOpen(true)
            }
          }}
          aria-label="Target fleet utilization"
        >
          {UTIL_PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label} ({Math.round(p.util * 100)}%)</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {showCustom && (
          <span className="buffer-custom input-with-unit">
            {/* Uncontrolled — clamping a controlled value fights typing (a first
                digit < 50 would snap the field to 50). Clamp for storage only. */}
            <input
              type="number"
              min={50}
              max={100}
              step={1}
              className="mono"
              defaultValue={utilPct}
              onChange={e => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v > 0) onPatch({ targetUtilization: clampUtilPct(v) / 100 })
              }}
              aria-label="Custom target utilization percentage"
            />
            <span className="unit">% util</span>
          </span>
        )}
        <span className="bc-readout">
          <span className="bc-hint">of AVAILABLE working time — charging downtime is counted separately</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="fs-empty">Assign vehicles to flows to size the fleet.</div>
      ) : (
        <table className="waterfall-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th className="num">Base</th>
              <th className="num">+ Charging</th>
              <th className="num">Sized demand</th>
              <th className="num">Fleet</th>
              <th className="pl-math-col" aria-label="Fleet math"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const g = groupByVehicle.get(f.vehicleId!)
              const veh = vehicleById.get(f.vehicleId!)
              const delta = g?.chargingDelta ?? 0
              return (
                <tr key={f.id}>
                  <td>
                    <span className="ct-veh">
                      <VehicleDot vehicle={veh} size="sm" />
                      {veh?.name ?? f.vehicleId}
                      <span className="pl-route mono">{f.origin || '—'} → {f.destination || '—'}</span>
                    </span>
                  </td>
                  <td className="num mono" data-label="Base">{g?.baseFleet ?? '—'}</td>
                  <td className="num mono" data-label="+ Charging">{delta > 0 ? `+${delta}` : '—'}</td>
                  <td className="num mono wf-mid" data-label="Sized demand">{g ? g.demand.toFixed(2) : '—'}</td>
                  <td className="num mono wf-sold" data-label="Fleet">
                    {g?.fleetSold ?? '—'}
                    {g && <span className="wf-binding mono">{g.binding}</span>}
                  </td>
                  <td className="pl-math-cell" data-label="Fleet math">
                    {g && (
                      <DerivTrigger
                        derivation={() => bufferDerivation(g, targetUtilization)}
                        route={`${f.origin || '—'} → ${f.destination || '—'}`}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
