'use client'

// The followed vehicle as a drill-down card (owner, 2026-11-22 — Flighty-style): its name and what it is
// doing, the leg it is on as a bar with the time to arrive, one line on why when it is not driving
// (waiting for whom, charging until when, parked with nothing to do), and battery, moves and working
// share as tiles. Folds: where its time went, and the order it carries. Back stops following. Read from
// the live state each frame.

import type { SimState } from '@/src/calc/sim/engine'
import { fmtLength, type UnitSystem } from '@/src/lib/utils/units'
import { Folds, Inspector, Section, Tile, Tiles, type Tone } from '../inspector/InspectorParts'
import { TimeSplitBar } from './RunDetails'
import { STATES, vehicleState } from './RunScene'

type V = SimState['veh'][number]
/** The map legend's colours. */
const TONE: Record<ReturnType<typeof vehicleState>, Tone> = { travel: 'good', handle: 'warn', wait: 'bad', charge: 'info', idle: 'mute' }

/** "1 min 40 s", "45 s", "2 h 5 min". */
function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60), h = Math.floor(m / 60)
  return h ? `${h} h ${m % 60} min` : s % 60 && m < 10 ? `${m} min ${s % 60} s` : `${m} min`
}

/** The day's clock time `sec` from now, "14:20". */
const at = (S: SimState, sec: number) => { const t = (S.t + sec) % 86400; return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}` }

/** One line on what the vehicle is doing when it is not simply driving a job — null when it is. */
function vehicleWhy(S: SimState, v: V): string | null {
  const name = (node: number) => S.G.points[node]?.name || 'a junction'
  const b = v.prof.battery
  if (v.mode === 'charging' && b) {
    const perSec = (b.chargerKw - b.idleKw) * b.pctPerKwSec
    return perSec > 0 ? `Charging · ${Math.round(v.soc)}% · done about ${at(S, (b.chargeUntilPct - v.soc) / perSec)}` : `Charging · ${Math.round(v.soc)}%`
  }
  if (v.mode === 'toCharge') return `Going to charge · ${Math.round(v.soc)}%`
  if (v.mustCharge && v.mode === 'home') return `Needs a charge · no charger free (waited ${duration(v.chargeWaitT)} in all)`
  const st = vehicleState(v)
  if (st === 'wait') {
    if (v.blockedBy) return `Waiting for ${v.blockedBy.id}${v.headOn ? ' · head-on on a single lane' : ''}`
    if (v.waitZone) return `Queued for ${S.G.points[S.G.zoneNode.get(v.waitZone) ?? -1]?.name ?? 'a station'}`
    return 'Waiting for the way ahead'
  }
  if (st === 'idle') return `Parked at ${name(v.node)} · ${S.waiting ? `${S.waiting} order${S.waiting === 1 ? '' : 's'} waiting` : 'no orders waiting'}`
  return null
}

export default function VehicleCard({ S, i, unitSystem, onBack }: { S: SimState; i: number; unitSystem: UnitSystem; onBack: () => void }) {
  const v = S.veh[i]
  const name = (node?: number) => (node == null ? '—' : S.G.points[node]?.name || '—')
  const st = vehicleState(v)
  const driving = v.mode === 'toPick' || v.mode === 'toDrop'
  const total = v.edges.reduce((t, e) => t + e.length, 0)
  const done = Math.min(total, v.edges.slice(0, v.pi).reduce((t, e) => t + e.length, 0) + v.s)
  const left = Math.max(0, total - done)
  const cruise = v.loaded ? v.prof.speedLoaded : v.prof.speedEmpty
  const working = S.t > 0 ? (v.tm.travel + v.tm.handle + v.tm.reposition) / S.t : 0
  const b = v.prof.battery
  const low: Tone | undefined = !b ? undefined : v.soc <= b.minSocPct + 1e-9 ? 'bad' : v.soc < b.chargeBelowPct ? 'warn' : undefined
  const why = vehicleWhy(S, v)
  const job = v.job
  return (
    <Inspector title={v.id} back="Fleet" onBack={onBack} chip={{ label: STATES.find(([k]) => k === st)![1], tone: TONE[st] }}
      sub={`${v.prof.vehicle.name} · ${v.loaded ? 'Loaded' : 'Empty'}`}>
      {/* The leg it is on: empty from where it set off to the pick, or loaded from the pick to the drop. */}
      {driving && (
        <div className="sim-route">
          <span className="sim-route-ends">
            <span>{S.G.points[v.nodes[0]]?.name || 'Start'}<small>{v.loaded ? 'pick' : 'from'}</small></span>
            <span>{name(v.nodes[v.nodes.length - 1])}<small>{v.loaded ? 'drop' : 'pick'}</small></span>
          </span>
          <span className="sim-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
          <span className="sim-bar-meta num">
            <span>{fmtLength(left, unitSystem)} to go</span>
            {cruise > 0 && <span>arrives in about {duration(left / cruise)}</span>}
          </span>
        </div>
      )}
      {why && <p className={`sim-why${st === 'wait' || low ? ' is-warn' : ''}`}>{why}</p>}
      <Tiles>
        <Tile label="battery" value={b ? `${Math.round(v.soc)}%` : '—'} tone={low} />
        <Tile label="moves" value={v.done} />
        <Tile label="working" value={`${Math.round(working * 100)}%`} />
      </Tiles>
      <Folds>
        <Section fold title="So far" status={`${fmtLength(v.distFt, unitSystem)} · ${v.chargeTrips} charge${v.chargeTrips === 1 ? '' : 's'}`}>
          <TimeSplitBar time={v.tm} />
          <dl className="sim-kv">
            <dt>Driven</dt><dd className="num">{fmtLength(v.distFt, unitSystem)}</dd>
            <dt>Trips to charge</dt><dd className="num">{v.chargeTrips}</dd>
            {b && <><dt>Lowest battery</dt><dd className="num">{Math.round(v.socMin)}%</dd></>}
          </dl>
        </Section>
        {job && (
          <Section fold title="This order" status={`waited ${duration(job.td - job.t0)}`}>
            <dl className="sim-kv">
              <dt>Material flow</dt><dd>{name(job.F.from)} → {name(job.F.to)}</dd>
              <dt>Raised</dt><dd className="num">{at(S, job.t0 - S.t)}</dd>
              <dt>Waited for a vehicle</dt><dd className="num">{duration(job.td - job.t0)}</dd>
              <dt>Under way for</dt><dd className="num">{duration(S.t - job.td)}</dd>
            </dl>
          </Section>
        )}
      </Folds>
    </Inspector>
  )
}
