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
  bufferPct: number
  onPatch: (patch: EnginePatch) => void
}

/** Named buffer policies. A stored bufferPct matching none of these (legacy
 *  slider values like 0.15) displays as Custom automatically. */
const BUFFER_PRESETS = [
  { key: 'standard',     label: 'Standard',     pct: 0.10 },
  { key: 'medium',       label: 'Medium',       pct: 0.20 },
  { key: 'conservative', label: 'Conservative', pct: 0.25 },
] as const

const presetFor = (pct: number) =>
  BUFFER_PRESETS.find(p => Math.abs(p.pct - pct) < 0.0001)

/**
 * Buffer section — the same per-flow rows, showing each flow's vehicle
 * waterfall: base → +charging → ×buffer → fleet (sold). The project buffer is
 * a named-policy dropdown (with a Custom escape hatch); per-flow figures are
 * the vehicle group's (pooled per vehicle type at the project level).
 */
export default function BufferPipeline({ flows, vehicleById, groupByVehicle, bufferPct, onPatch }: Props) {
  const rows = flows.filter(f => f.vehicleId)
  const pct = Math.round(bufferPct * 100)
  const preset = presetFor(bufferPct)
  // Once the user picks "Custom…" the input stays visible even if they type a
  // value that happens to equal a preset.
  const [customOpen, setCustomOpen] = useState(false)
  const showCustom = customOpen || !preset
  return (
    <div className="engine-panel pipeline-wrap">
      <div className="buffer-control">
        <span className="bc-label">Buffer</span>
        <select
          className="buffer-select"
          value={showCustom ? 'custom' : preset!.key}
          onChange={e => {
            const choice = BUFFER_PRESETS.find(p => p.key === e.target.value)
            if (choice) {
              setCustomOpen(false)
              onPatch({ bufferPct: choice.pct })
            } else {
              setCustomOpen(true)
            }
          }}
          aria-label="Fleet buffer policy"
        >
          {BUFFER_PRESETS.map(p => (
            <option key={p.key} value={p.key}>{p.label} ({Math.round(p.pct * 100)}%)</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {showCustom && (
          <span className="buffer-custom input-with-unit">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="mono"
              value={pct}
              onChange={e => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) onPatch({ bufferPct: Math.min(100, Math.max(0, v)) / 100 })
              }}
              aria-label="Custom buffer percentage"
            />
            <span className="unit">%</span>
          </span>
        )}
        <span className="bc-value mono">×{(1 + bufferPct).toFixed(2)}</span>
        <span className="bc-hint">maintenance · training · demand spikes</span>
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
                  <td className="num mono">{g?.baseFleet ?? '—'}</td>
                  <td className="num mono">{delta > 0 ? `+${delta}` : '—'}</td>
                  <td className="num mono wf-mid">{g ? (g.fleetWithCharging * (1 + bufferPct)).toFixed(2) : '—'}</td>
                  <td className="num mono wf-sold">{g?.fleetSold ?? '—'}</td>
                  <td className="pl-math-cell">
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
        Buffer is the only multiplier in the pipeline — it covers maintenance, training, and demand
        spikes. Per-flow figures are the vehicle group&apos;s; the fleet pools per vehicle type.
      </div>
    </div>
  )
}
