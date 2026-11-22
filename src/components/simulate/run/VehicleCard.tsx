'use client'

// The followed vehicle as a drill-down card (owner, 2026-11-22 — Flighty-style): its name and what it is
// doing, the leg it is on as a bar (empty to the pick, loaded to the drop), and battery, moves and the share of
// time working as tiles. Back stops following. Read from the live state each frame.

import type { SimState } from '@/src/calc/sim/engine'
import { fmtLength, type UnitSystem } from '@/src/lib/utils/units'
import { Inspector, Tile, Tiles, type Tone } from '../inspector/InspectorParts'
import { STATES, vehicleState } from './RunScene'

const TONE: Record<ReturnType<typeof vehicleState>, Tone> = { travel: 'sel', handle: 'sel', wait: 'warn', charge: 'good', idle: 'sel' }

export default function VehicleCard({ S, i, unitSystem, onBack }: { S: SimState; i: number; unitSystem: UnitSystem; onBack: () => void }) {
  const v = S.veh[i]
  const name = (node?: number) => (node == null ? '—' : S.G.points[node]?.name || '—')
  const st = vehicleState(v)
  const total = v.edges.reduce((t, e) => t + e.length, 0)
  const done = Math.min(total, v.edges.slice(0, v.pi).reduce((t, e) => t + e.length, 0) + v.s)
  const to = v.nodes[v.nodes.length - 1]
  const working = S.t > 0 ? (v.tm.travel + v.tm.handle + v.tm.reposition) / S.t : 0
  return (
    <Inspector title={v.id} back="Fleet" onBack={onBack} chip={{ label: STATES.find(([k]) => k === st)![1], tone: TONE[st] }}
      sub={`${v.prof.vehicle.name} · ${v.loaded ? 'Loaded' : 'Empty'}`}>
      {v.job && (
        <div className="sim-route">
          <span className="sim-route-ends"><span>{name(v.job.F.from)}<small>pick</small></span><span>{name(v.job.F.to)}<small>drop</small></span></span>
          <span className="sim-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
          <span className="sim-bar-meta num"><span>{v.loaded ? 'Loaded to' : 'Empty to'} {name(to)}</span><span>{fmtLength(Math.max(0, total - done), unitSystem)} to go</span></span>
        </div>
      )}
      <Tiles>
        <Tile label="battery" value={v.prof.battery ? `${Math.round(v.soc)}%` : '—'} />
        <Tile label="moves" value={v.done} />
        <Tile label="working" value={`${Math.round(working * 100)}%`} />
      </Tiles>
    </Inspector>
  )
}
