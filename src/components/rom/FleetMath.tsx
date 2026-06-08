'use client'

import { useState } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, Flow, FlowDerived } from '@/src/calc/types'
import { DEFAULT_DOD } from '@/src/calc/types'

interface Props {
  project: StoredProject
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
}

const f2 = (n: number) => n.toFixed(2)
const f1 = (n: number) => n.toFixed(1)
const secs = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s)}s`)
const pct = (a: number | null | undefined) => (a == null ? '—' : `${Math.round(a * 100)}%`)
const route = (f: Flow) => `${f.origin || '—'} → ${f.destination || '—'}`

/**
 * "How we sized the fleet" — the full derivation across the 3 stages (base →
 * charging → buffer), with substituted numbers and a plain-language why. Toggles
 * between the whole system and a single flow. All values come from the pure engine
 * (FlowDerived / FleetGroup); this only narrates them.
 */
export default function FleetMath({ project, flows, derivedByFlowId, fleet, vehicleById }: Props) {
  const buffer = project.bufferPct ?? 0.10
  const assigned = flows.filter(f => f.vehicleId && derivedByFlowId.get(f.id)?.rawVehicles != null)
  const [scope, setScope] = useState<string>('system') // 'system' | flowId

  if (fleet.groups.length === 0) {
    return (
      <section className="rom-card">
        <span className="rom-card-eyebrow">Fleet math — how we sized it</span>
        <div className="rv-empty">Assign vehicles to flows to see the sizing math.</div>
      </section>
    )
  }

  const groupFor = (vehicleId: string) => fleet.groups.find(g => g.vehicleId === vehicleId)
  const vehName = (id: string) => vehicleById.get(id)?.name ?? id

  // ── Step blocks ──────────────────────────────────────────────────────────
  const Step = ({ n, tag, title, why, children }: { n: number; tag: string; title: string; why: string; children: React.ReactNode }) => (
    <div className="fm-step">
      <div className="fm-step-head">
        <span className="fm-step-n mono">{n}</span>
        <span className="fm-step-title">{title}</span>
        <span className="fm-step-tag">{tag}</span>
      </div>
      <div className="fm-step-body">{children}</div>
      <p className="fm-why">{why}</p>
    </div>
  )

  function chargingLine(vehicleId: string) {
    const g = groupFor(vehicleId)
    const veh = vehicleById.get(vehicleId)
    if (!g || !veh) return null
    const c = g.charging
    if (c.runHr == null) return <div className="fm-eq mono">Battery data unavailable — charging not modeled.</div>
    return (
      <div className="fm-eq mono">
        runtime = {veh.calc.ratedAh}Ah × {DEFAULT_DOD} ÷ {veh.calc.dischargeA}A = <strong>{f1(c.runHr)} h</strong> per charge ·
        recharge {f1(c.chargeHr ?? 0)} h → availability <strong>{pct(c.availability)}</strong> →
        <strong> +{c.chargingDelta}</strong> vehicle{c.chargingDelta === 1 ? '' : 's'}
      </div>
    )
  }

  function bufferLine(vehicleId: string) {
    const g = groupFor(vehicleId)
    if (!g) return null
    return (
      <div className="fm-eq mono">
        ({g.baseFleet} base + {g.charging.chargingDelta} charging) × {f2(1 + buffer)} = {f2((g.baseFleet + g.charging.chargingDelta) * (1 + buffer))} → ⌈⌉ = <strong>{g.fleetSold} sold</strong>
      </div>
    )
  }

  // ── SYSTEM scope ─────────────────────────────────────────────────────────
  const renderSystem = () => (
    <>
      <Step n={1} tag="engineering" title="Base fleet" why="Each vehicle completes one round-trip per cycle time; throughput sets how many cycles per hour are required, so raw vehicles = work ÷ capacity. Demand pools per vehicle type, then rounds up.">
        {fleet.groups.map(g => {
          const groupFlows = assigned.filter(f => f.vehicleId === g.vehicleId)
          return (
            <div key={g.vehicleId} className="fm-group">
              <div className="fm-group-name">{vehName(g.vehicleId)}</div>
              <ul className="fm-flowlist">
                {groupFlows.map(f => {
                  const d = derivedByFlowId.get(f.id)!
                  return (
                    <li key={f.id} className="mono">
                      <span className="fm-flow-route">{route(f)}</span>
                      {f.thruPerHr}/hr × {secs(d.cycleSeconds)} ÷ 3600 = <strong>{f2(d.rawVehicles ?? 0)}</strong>
                    </li>
                  )
                })}
              </ul>
              <div className="fm-eq mono">Σ = {f2(g.groupRaw)} → ⌈⌉ = <strong>{g.baseFleet} base</strong></div>
            </div>
          )
        })}
      </Step>

      <Step n={2} tag="physics" title="Charging" why="Batteries deplete in service and need time to recharge, so a vehicle isn't available 100% of the day. We add enough vehicles so the charging rotation never starves the operation.">
        {fleet.groups.map(g => (
          <div key={g.vehicleId} className="fm-group">
            <div className="fm-group-name">{vehName(g.vehicleId)}</div>
            {chargingLine(g.vehicleId)}
          </div>
        ))}
      </Step>

      <Step n={3} tag="policy" title="Buffer" why="A safety margin on top of base + charging absorbs demand variability, maintenance downtime, and ramp-up — then we round up to whole vehicles.">
        {fleet.groups.map(g => (
          <div key={g.vehicleId} className="fm-group">
            <div className="fm-group-name">{vehName(g.vehicleId)}</div>
            {bufferLine(g.vehicleId)}
          </div>
        ))}
      </Step>

      <div className="fm-total mono">
        Total: <strong>{fleet.totalBaseFleet}</strong> base + <strong>{fleet.totalChargingDelta}</strong> charging, ×{f2(1 + buffer)} buffer → <strong className="fm-total-sold">{fleet.totalFleetSold} vehicles sold</strong>
      </div>
    </>
  )

  // ── FLOW scope ───────────────────────────────────────────────────────────
  const renderFlow = (flowId: string) => {
    const f = assigned.find(x => x.id === flowId)
    if (!f || !f.vehicleId) return <div className="rv-empty">Flow not found.</div>
    const d = derivedByFlowId.get(f.id)!
    const g = groupFor(f.vehicleId)
    return (
      <>
        <Step n={1} tag="engineering" title="Base fleet" why="This flow's raw demand is its throughput times its cycle time. It then pools with every other flow that uses the same vehicle type before rounding up.">
          <div className="fm-eq mono">
            {f.thruPerHr}/hr × {secs(d.cycleSeconds)} ÷ 3600 = <strong>{f2(d.rawVehicles ?? 0)}</strong> vehicles for this flow
          </div>
          {g && (
            <div className="fm-eq mono fm-eq-muted">
              pools with all {vehName(f.vehicleId)} flows: Σ {f2(g.groupRaw)} → ⌈⌉ = <strong>{g.baseFleet} base</strong>
            </div>
          )}
        </Step>

        <Step n={2} tag="physics" title="Charging" why="Charging is modeled on the pooled vehicle type, not the single flow — the whole battery rotation shares chargers.">
          {chargingLine(f.vehicleId)}
        </Step>

        <Step n={3} tag="policy" title="Buffer" why="The safety buffer and final rounding apply to the pooled vehicle fleet this flow belongs to.">
          {bufferLine(f.vehicleId)}
        </Step>
      </>
    )
  }

  return (
    <section className="rom-card">
      <span className="rom-card-eyebrow">Fleet math — how we sized it</span>

      <div className="fm-toggle" role="tablist" aria-label="Math scope">
        <button type="button" role="tab" aria-selected={scope === 'system'} className={`fm-tab${scope === 'system' ? ' active' : ''}`} onClick={() => setScope('system')}>Full system</button>
        {assigned.map(f => (
          <button key={f.id} type="button" role="tab" aria-selected={scope === f.id} className={`fm-tab${scope === f.id ? ' active' : ''}`} onClick={() => setScope(f.id)}>
            {route(f)}
          </button>
        ))}
      </div>

      <div className="fm-steps">
        {scope === 'system' ? renderSystem() : renderFlow(scope)}
      </div>
    </section>
  )
}
