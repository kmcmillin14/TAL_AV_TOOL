'use client'

import { useState } from 'react'
import { bufferFromUtilization, utilizationFromBuffer, type FleetGroup, type Flow } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import DerivTrigger from '@/src/components/step3/DerivTrigger'
import { bufferDerivation } from '@/src/lib/derivation'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  vehicleById: Map<string, Vehicle>
  groupByVehicle: Map<string, FleetGroup>
  bufferPct: number
  onPatch: (patch: EnginePatch) => void
}

/** Named target-utilization policies. AMR fleets are sized to a peak utilization;
 *  past ~85% queueing/blocking wait climbs non-linearly, so 80% is the standard.
 *  A stored value matching none (a legacy buffer) shows as Custom automatically. */
const UTIL_PRESETS = [
  { key: 'conservative', label: 'Conservative', util: 0.70 },
  { key: 'standard',     label: 'Standard',     util: 0.80 },
  { key: 'aggressive',   label: 'Aggressive',   util: 0.85 },
] as const

const presetFor = (bufferPct: number) =>
  UTIL_PRESETS.find(p => Math.abs(bufferFromUtilization(p.util) - bufferPct) < 0.001)

const clampUtilPct = (v: number) => Math.min(100, Math.max(50, v))   // 50% keeps buffer ≤ 1.0 (schema max)

/**
 * Target-utilization section — the per-flow vehicle waterfall base → +charging →
 * ×headroom → fleet (sold). The engineer sets a target utilization (default 80%);
 * it's stored as the equivalent buffer multiplier the calc applies. Per-flow
 * figures are the vehicle group's (pooled per vehicle type at the project level).
 */
export default function BufferPipeline({ flows, vehicleById, groupByVehicle, bufferPct, onPatch }: Props) {
  const rows = flows.filter(f => f.vehicleId)
  const utilPct = Math.round(utilizationFromBuffer(bufferPct) * 100)
  const preset = presetFor(bufferPct)
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
              onPatch({ bufferPct: bufferFromUtilization(choice.util) })
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
                if (Number.isFinite(v) && v > 0) onPatch({ bufferPct: bufferFromUtilization(clampUtilPct(v) / 100) })
              }}
              aria-label="Custom target utilization percentage"
            />
            <span className="unit">%</span>
          </span>
        )}
        <span className="bc-value mono">×{(1 + bufferPct).toFixed(2)}</span>
        <span className="bc-hint">headroom for variability, maintenance &amp; demand spikes</span>
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
              <th className="num">× {(1 + bufferPct).toFixed(2)}</th>
              <th className="num">Fleet</th>
              <th className="pl-math-col" aria-label="Fleet math"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const g = groupByVehicle.get(f.vehicleId!)
              const veh = vehicleById.get(f.vehicleId!)
              const delta = g?.charging.chargingDelta ?? 0
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
                  <td className="num mono wf-mid" data-label={`× ${(1 + bufferPct).toFixed(2)}`}>{g ? ((g.charging.availability != null ? g.groupRaw / g.charging.availability : g.groupRaw) * (1 + bufferPct)).toFixed(2) : '—'}</td>
                  <td className="num mono wf-sold" data-label="Fleet">{g?.fleetSold ?? '—'}</td>
                  <td className="pl-math-cell" data-label="Fleet math">
                    {g && (
                      <DerivTrigger
                        derivation={() => bufferDerivation(g, bufferPct)}
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
      <div className="engine-note">
        Sizing to a target utilization leaves headroom for demand variability, maintenance, and
        ramp-up — 80% is the AMR industry standard (past ~85% queueing and blocking wait climbs
        non-linearly). It applies as the ×{(1 + bufferPct).toFixed(2)} multiplier on availability-adjusted
        demand. Per-flow figures are the vehicle group&apos;s; the fleet pools per vehicle type.
      </div>
    </div>
  )
}
