'use client'

// Run details, one click away (proof of concept; spec §7 "More data"): engine vs simulated per flow,
// where the time went, battery, hour by hour, per location, the B56.5 effect, and the assumptions
// with the vehicle data behind them. Fallbacks the engine used for missing data are listed — nothing
// is silently invented.

import { memo, type ReactNode } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_STROKE, ChartCaption, ChartFrame, ChartTooltip, GRID_STROKE, pct, TICK } from '@/src/components/charts/ChartKit'
import DataTable, { type Cell, type Col } from './DataTable'
import type { SimState } from '@/src/calc/sim/engine'
import { gradeOrders } from '@/src/calc/sim/grades'
import { withHighways } from '@/src/calc/sim/highways'
import type { RunInputs } from '@/src/calc/sim/runInputs'
import type { SimLayout, SimResults, SimSettings, TimeSplit } from '@/src/calc/sim/types'
import { flowDerived } from '@/src/calc/flowMetrics'
import type { StoredProject } from '@/src/lib/storage'
import { fmtLength, type UnitSystem } from '@/src/lib/utils/units'
import { STATES } from './RunScene'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface Assumptions { pacePct: number; trafficPct: number; safetyFt: number; demandPct: number; arrivals: SimSettings['arrivals']; seed: number }

interface Props {
  R: SimResults | null
  S: SimState | null
  project: StoredProject
  vehicleById: Map<string, Vehicle>
  unitSystem: UnitSystem
  inputs: RunInputs
  assume: Assumptions
  /** Open the Assumptions drawer (Milestone 6) — where run assumptions are set. */
  onOpenAssumptions: () => void
  /** The Data tab shown. */
  tab: DataTab
  /** More cards for the Setup tab (Sizing's static estimate). */
  extra?: ReactNode
}

export type DataTab = 'overview' | 'flows' | 'vehicles' | 'locations' | 'battery' | 'setup'
export const DATA_TABS: { id: DataTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'flows', label: 'Material flows' }, { id: 'vehicles', label: 'Vehicles' },
  { id: 'locations', label: 'Locations' }, { id: 'battery', label: 'Battery' }, { id: 'setup', label: 'Setup' },
]

/** A dashboard card: a title, one line of context, then its chart or table. `wide` spans the row; `side`
 *  takes the right column's full height (a long list beside short cards). */
function Card({ title, meta, wide, side, children }: { title: string; meta?: ReactNode; wide?: boolean; side?: boolean; children: ReactNode }) {
  return (
    <section className={`sim-dash-card${wide ? ' is-wide' : side ? ' is-side' : ''}`}>
      <header><h3>{title}</h3>{meta && <span className="meta">{meta}</span>}</header>
      {children}
    </section>
  )
}

const SPLIT = STATES as [keyof TimeSplit, string][]
/** Seconds in a shown state — repositioning at a pick/drop counts as "Pick / drop", so shares add to 100%. */
const inState = (t: TimeSplit, k: keyof TimeSplit) => (k === 'handle' ? t.handle + t.reposition : t[k])
/** Where the time went: a legend with shares and one stacked bar (Run details; the vehicle card). */
export function TimeSplitBar({ time }: { time: TimeSplit }) {
  const tot = SPLIT.reduce((a, [k]) => a + inState(time, k), 0) || 1
  return (
    <div className="sim-split-wrap">
      <div className="sim-splitleg">{SPLIT.map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l} {pct(inState(time, k) / tot)}</span>)}</div>
      <div className="sim-split">{SPLIT.map(([k]) => <span key={k} className={`st-${k}`} style={{ width: `${(inState(time, k) / tot) * 100}%` }} />)}</div>
    </div>
  )
}

const FLOW_COLS: Col[] = [
  { label: 'Material flow', left: true }, { label: 'Moves/h target' }, { label: 'Sizing distance' }, { label: 'Driven' }, { label: 'Engine cycle' },
  { label: 'Engine demand (veh)' }, { label: 'Sim moves/h', band: true }, { label: 'Sim mission', band: true }, { label: 'Avg wait', band: true },
]
const TYPE_COLS: Col[] = [
  { label: 'Vehicle type', left: true }, { label: 'Fleet' }, { label: 'Moves' }, { label: 'Moves/h' }, { label: 'Target/h' },
  { label: 'Busy' }, { label: 'Avg order wait' }, { label: 'Battery avg / lowest' }, { label: 'Charge trips' },
]
const VEH_COLS: Col[] = [
  { label: 'Vehicle', left: true }, { label: 'Type', left: true }, { label: 'Moves' }, { label: 'Moves/h' }, { label: 'Busy' },
  ...SPLIT.map(([, l]) => ({ label: l })), { label: 'Battery end' }, { label: 'Lowest' }, { label: 'Charge trips' },
]
const LOC_COLS: Col[] = [
  { label: 'Location', left: true }, { label: 'Type', left: true }, { label: 'Visits' }, { label: 'Occupied' }, { label: 'Max queue' }, { label: 'Avg wait / visit' },
]
const secs = (s: number | null | undefined) => (s == null || !isFinite(s) ? '—' : `${Math.round(s)} s`)

export default memo(function RunDetails({ R, S, project, vehicleById, unitSystem, inputs, assume, onOpenAssumptions, tab, extra }: Props) {
  const len = (ft?: number) => fmtLength(ft, unitSystem)
  const total = R ? R.types.reduce((a, t) => a + t.target, 0) : 0
  const flows = project.flows ?? []
  const linked = flows.filter(f => f.fromPointId && f.toPointId)
  // Highways' routes are derived: they are found (and named) on the expanded layout.
  const net = project.simLayout && withHighways<SimLayout>(project.simLayout)
  const name = (id?: string) => net?.points.find(p => p.id === id)?.name ?? '—'
  const time = R ? R.types.reduce((acc, t) => { for (const k of Object.keys(acc) as (keyof TimeSplit)[]) acc[k] += t.time[k]; return acc },
    { travel: 0, handle: 0, reposition: 0, wait: 0, charge: 0, idle: 0 } as TimeSplit) : null

  const flowsTable = (
    <DataTable label="Material flows" cols={FLOW_COLS} rows={linked.map(f => {
      const sim = R?.flows.find(x => x.flowId === f.id)
      const why = R?.excluded.find(x => x.flowId === f.id)?.why
      const e = flowDerived(f, f.vehicleId ? vehicleById.get(f.vehicleId) : undefined)
      const target = f.thruPerHr * assume.demandPct / 100
      const head: Cell[] = [`${name(f.fromPointId)} → ${name(f.toPointId)}`, Math.round(target), len(f.distanceFt)]
      if (why) return [...head, { v: `Left out of the run — ${why.toLowerCase()}`, cls: 'dim l' }, null, null, null, null, null]
      return [...head, len(sim?.measuredFt), secs(e.cycleSeconds), e.rawVehicles == null ? null : e.rawVehicles.toFixed(2),
        { v: sim ? sim.perHr.toFixed(1) : null, cls: sim && target > 0 && gradeOrders(Math.max(0, (1 - sim.perHr / target) * 100)) === 'bad' ? 'bad' : '' }, secs(sim?.mission), secs(sim?.wait)]
    })} />
  )
  const blocked = inputs.clearances.filter(c => c.status === 'capped' || c.status === 'violation')
  const waiting = <p className="sim-card-note">Simulating…</p>

  // Data as a dashboard (owner, 2026-11-26; the app's own style): one tab at a time, each a grid of cards —
  // a title, one line of context, then the chart or table.
  return (
    <div className={`sim-dash-grid is-${tab}`}>
      {tab === 'overview' && <>
        <Card title="Moves delivered, hour by hour" meta={R ? `${total.toFixed(0)} needed each hour` : null}>{S && R ? <HourChart S={S} target={total} hours={Math.ceil(R.t / 3600)} /> : waiting}</Card>
        <Card title="Where the time went" meta={R ? `${R.orders.delivered.toLocaleString()} moves · ${R.orders.waiting} waiting at the end` : null}>
          {time ? <TimeSplitBar time={time} /> : waiting}
          {R && (
            <dl className="sim-kv">
              <dt>Battery at the end (avg / lowest)</dt><dd>{R.types.map(t => `${Math.round(t.socAvg)}% / ${Math.round(t.socMin)}%`).join(' · ')}</dd>
              <dt>Trips to charge</dt><dd>{R.types.reduce((a, t) => a + t.chargeTrips, 0)}</dd>
            </dl>
          )}
        </Card>
      </>}
      {tab === 'flows' && <Card wide title="Material flows — engine vs simulated" meta={R ? flowSummary(R, linked.length, assume.demandPct, flows) : null}>{flowsTable}</Card>}
      {tab === 'vehicles' && (R ? <>
        <Card wide title="By vehicle type" meta={`${R.vehicles.length} vehicle${R.vehicles.length === 1 ? '' : 's'} · ${R.orders.delivered.toLocaleString()} moves`}>
          <DataTable label="By vehicle type" cols={TYPE_COLS} rows={R.types.map(t => [
            vehicleById.get(t.vehicleId)?.name ?? t.vehicleId, t.fleet, t.done, t.perHr.toFixed(1), t.target.toFixed(0),
            pct(t.utilization), secs(t.avgWait), `${Math.round(t.socAvg)}% / ${Math.round(t.socMin)}%`, t.chargeTrips,
          ])} />
        </Card>
        <Card wide title="By vehicle" meta="Where each vehicle's time went">
          <DataTable label="By vehicle" cols={VEH_COLS} rows={R.vehicles.map(v => {
            const all = Object.values(v.time).reduce((a, b) => a + b, 0) || 1
            return [v.id, vehicleById.get(v.vehicleId)?.name ?? v.vehicleId, v.done, v.perHr.toFixed(1), pct(v.utilization),
              ...SPLIT.map(([k]) => pct(inState(v.time, k) / all)), `${Math.round(v.soc)}%`, `${Math.round(v.socMin)}%`, v.chargeTrips]
          })} foot={(() => {
            const sum = (f: (v: SimResults['vehicles'][number]) => number) => R.vehicles.reduce((a, v) => a + f(v), 0)
            const all = sum(v => Object.values(v.time).reduce((a, b) => a + b, 0)) || 1
            return ['Total', '', sum(v => v.done), sum(v => v.perHr).toFixed(1), '',
              ...SPLIT.map(([k]) => pct(sum(v => inState(v.time, k)) / all)), '', '', sum(v => v.chargeTrips)]
          })()} />
        </Card>
      </> : <Card wide title="Vehicles">{waiting}</Card>)}
      {tab === 'locations' && <>
        <Card title="Locations" meta={`${S?.zoneStats.size ?? 0} — visits, time occupied, queues`}>
          <DataTable label="Locations" cols={LOC_COLS} rows={S && R ? [...S.zoneStats].map(([z, st]) => {
            const p = S.G.points[S.G.zoneNode.get(z) ?? -1]
            return [p?.name ?? z, p?.type ?? '', st.visits, pct(st.occT / Math.max(1, R.t)), st.maxQ, st.visits ? secs(st.waitT / st.visits) : null]
          }) : []} />
        </Card>
        <Card title="B56.5 clearance" meta={`${inputs.clearances.filter(c => c.status === 'capped').length} slowed · ${inputs.clearances.filter(c => c.status === 'violation').length} blocked`}>
          {blocked.length
            // One line per place and reason — a route's segments share one, with how many it covers.
            ? <ul className="sim-list">{[...blocked.reduce((m, c) => {
                const seg = net?.segments.find(s => s.id === c.segId)
                const where = seg?.highwayId ? project.simLayout?.highways?.find(h => h.id === seg.highwayId)?.name || 'Route' : `${name(seg?.a)} – ${name(seg?.b)}`
                const line = `${where}: ${c.tightestIn?.toFixed(1)} in · ${c.reason}`
                return m.set(line, (m.get(line) ?? 0) + 1)
              }, new Map<string, number>())].map(([line, n]) => <li key={line}>{line}{n > 1 ? ` · ${n} segments` : ''}</li>)}</ul>
            : <p className="sim-card-note">No route is slowed or blocked.</p>}
        </Card>
      </>}
      {tab === 'battery' && (
        <Card wide title="Battery over the run" meta={R ? R.types.map(t => `${vehicleById.get(t.vehicleId)?.name ?? t.vehicleId}: lowest ${Math.round(t.socMin)}% · ${t.chargeTrips} charges`).join(' · ') : null}>
          {S && R ? <BatteryChart S={S} vehicleById={vehicleById} /> : waiting}
        </Card>
      )}
      {tab === 'setup' && <>
        <Card title="Assumptions" meta={`pace ${assume.pacePct}% · ${assume.trafficPct ? `traffic ${assume.trafficPct}% · ` : ''}safety ${fmtLength(assume.safetyFt, unitSystem, 1)} · demand ${assume.demandPct}%`}>
          <p className="sim-readout"><button type="button" className="link-btn" onClick={onOpenAssumptions}>Open assumptions</button></p>
          {S && [...S.profiles.values()].map(p => {
            const c = p.vehicle.calc, b = p.battery
            return (
              <div key={p.vehicle.id} className="sim-vehdata">
                <h4>Vehicle data · {p.vehicle.name}</h4>
                <dl className="sim-kv">
                  <dt>Speed loaded / empty (rated)</dt><dd>{c.speedLoadedFps ?? '—'} / {c.speedUnloadedFps ?? '—'} ft/s</dd>
                  <dt>Lift speed · max lift</dt><dd>{c.liftSpeedFps ?? '—'} ft/s · {c.maxLiftHeightFt ?? '—'} ft</dd>
                  <dt>Width · overall length</dt><dd>{c.widthFt} · {p.lengthFt.toFixed(2)} ft</dd>
                  <dt>Turning radius</dt><dd>{c.turningRadiusFt ?? '—'} ft</dd>
                  <dt>Charging</dt><dd>{b ? `below ${b.chargeBelowPct}% until ${b.chargeUntilPct}% · ${b.chargerKw} kW charger` : 'no battery data — charging off'}</dd>
                </dl>
              </div>
            )
          })}
        </Card>
        {R && R.flags.length > 0 && (
          <Card side title="Missing data — fallbacks used" meta={`${new Set(R.flags.map(f => f.field + f.message)).size} used`}>
            <ul className="sim-list">{[...new Map(R.flags.map(f => [f.field + f.message, f])).values()].map((f, i) => <li key={i}>{f.message}</li>)}</ul>
          </Card>
        )}
        {extra}
      </>}
    </div>
  )
})

/** "4 flows · all within 2% of target" — the line under the collapsed flows table. */
function flowSummary(R: SimResults, n: number, demandPct: number, flows: { id: string; thruPerHr: number }[]): string {
  const short = R.flows.filter(x => { const f = flows.find(q => q.id === x.flowId); return f && x.perHr < f.thruPerHr * demandPct / 100 * 0.98 }).length
  return `${n} flow${n === 1 ? '' : 's'} · ${short ? `${short} below target` : 'all within 2% of target'} · ${R.orders.delivered} moves`
}


/** Moves delivered per hour (bars) against the target (dashed), and the most orders waiting in that
 *  hour (line, right axis) — on the app's shared chart kit. */
function HourChart({ S, target, hours }: { S: SimState; target: number; hours: number }) {
  const ser = [...S.series.values()].flat()
  const data = Array.from({ length: Math.max(1, hours) }, (_, i) => ({
    hour: `${i + 1}h`,
    moves: S.hourly[i] ?? 0,
    waiting: Math.max(0, ...ser.filter(([t]) => t > i * 3600 && t <= (i + 1) * 3600).map(([, n]) => n)),
  }))
  const short = data.filter(d => target > 0 && gradeOrders(Math.max(0, (1 - d.moves / target) * 100)) === 'bad').length
  return (
    <>
      <ChartFrame height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="hour" tick={TICK} stroke={AXIS_STROKE} />
          <YAxis yAxisId="m" tick={TICK} stroke={AXIS_STROKE} width={36} allowDecimals={false} />
          <YAxis yAxisId="w" orientation="right" tick={TICK} stroke={AXIS_STROKE} width={28} allowDecimals={false} />
          <Tooltip content={<ChartTooltip fmt={n => String(Math.round(n))} />} cursor={{ fill: 'var(--bg-hover)' }} />
          <Bar isAnimationActive={false} yAxisId="m" dataKey="moves" name="Moves delivered" fill="var(--tal-classic-blue)" maxBarSize={28} radius={[3, 3, 0, 0]} />
          <ReferenceLine yAxisId="m" y={target} stroke="var(--text-secondary)" strokeDasharray="5 4" label={{ value: `Target ${Math.round(target)}/h`, position: 'insideTopLeft', fill: 'var(--text-secondary)', fontSize: 10 }} />
          <Line isAnimationActive={false} yAxisId="w" dataKey="waiting" name="Orders waiting (most)" stroke="var(--warn)" strokeWidth={2} dot={false} type="monotone" />
        </ComposedChart>
      </ChartFrame>
      <ChartCaption>{short === 0 ? 'Every hour met the target.' : `${short} of ${data.length} hours below the target.`} Bars: moves delivered · dashed: target · line: most orders waiting (right axis).</ChartCaption>
    </>
  )
}

/** Battery over the run, per vehicle type: the lowest and the average charge every 5 minutes, against
 *  the level where a vehicle must charge (dashed). Off-shift stretches show the fleet charging back up. */
function BatteryChart({ S, vehicleById }: { S: SimState; vehicleById: Map<string, Vehicle> }) {
  const types = [...S.socSeries.keys()].filter(vid => (S.socSeries.get(vid) ?? []).length)
  if (!types.length) return <p className="sim-card-note">No battery data for these vehicles — charging is off.</p>
  const days = S.t > 86400
  const rows = new Map<number, Record<string, number>>()
  for (const vid of types) for (const [t, min, avg] of S.socSeries.get(vid)!) {
    const r = rows.get(t) ?? { t: t / 3600 }
    r[`${vid}:min`] = Math.round(min); r[`${vid}:avg`] = Math.round(avg); rows.set(t, r)
  }
  const data = [...rows.values()]
  const below = S.profiles.get(types[0])?.battery?.chargeBelowPct
  return (
    <>
      <ChartFrame height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tick={TICK} stroke={AXIS_STROKE}
            ticks={days ? Array.from({ length: Math.floor(S.t / 86400) + 1 }, (_, i) => i * 24) : undefined}
            tickFormatter={h => (days ? `Day ${Math.floor(h / 24) + 1}` : `${Math.round(h)}h`)} />
          <YAxis domain={[0, 100]} tick={TICK} stroke={AXIS_STROKE} width={36} unit="%" />
          <Tooltip content={<ChartTooltip fmt={n => `${Math.round(n)}%`} />} labelFormatter={h => `${Math.floor(Number(h) / 24) ? `Day ${Math.floor(Number(h) / 24) + 1} · ` : ''}${(Number(h) % 24).toFixed(1)} h`} />
          {below != null && <ReferenceLine y={below} stroke="var(--bad)" strokeDasharray="5 4" label={{ value: `Charges below ${below}%`, position: 'insideBottomLeft', fill: 'var(--bad)', fontSize: 10 }} />}
          {types.flatMap((vid, i) => [
            <Line key={`${vid}:avg`} isAnimationActive={false} dataKey={`${vid}:avg`} name={`${vehicleById.get(vid)?.name ?? vid} — average`} stroke={i ? 'var(--tal-teal, var(--good))' : 'var(--tal-classic-blue)'} strokeWidth={2} dot={false} />,
            <Line key={`${vid}:min`} isAnimationActive={false} dataKey={`${vid}:min`} name={`${vehicleById.get(vid)?.name ?? vid} — lowest`} stroke={i ? 'var(--tal-teal, var(--good))' : 'var(--tal-classic-blue)'} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />,
          ])}
        </ComposedChart>
      </ChartFrame>
      <ChartCaption>Solid: average charge · dashed: the lowest vehicle · red: where a vehicle must charge. Idle vehicles wait on chargers; off-shift they charge back up.</ChartCaption>
    </>
  )
}
