'use client'

// Run details, one click away (proof of concept; spec §7 "More data"): engine vs simulated per flow,
// where the time went, battery, hour by hour, per location, the B56.5 effect, and the assumptions
// with the vehicle data behind them. Fallbacks the engine used for missing data are listed — nothing
// is silently invented.

import { memo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_STROKE, ChartCaption, ChartFrame, ChartTooltip, GRID_STROKE, pct, TICK } from '@/src/components/charts/ChartKit'
import DataTable, { type Cell, type Col } from './DataTable'
import type { SimState } from '@/src/calc/sim/engine'
import type { RunInputs } from '@/src/calc/sim/runInputs'
import type { SimResults, SimSettings, TimeSplit } from '@/src/calc/sim/types'
import { flowDerived } from '@/src/calc/flowMetrics'
import type { StoredProject } from '@/src/lib/storage'
import { fmtLength, lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import { STATES } from './RunScene'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface Assumptions { pacePct: number; safetyFt: number; demandPct: number; arrivals: SimSettings['arrivals']; seed: number }

interface Props {
  R: SimResults | null
  S: SimState | null
  project: StoredProject
  vehicleById: Map<string, Vehicle>
  unitSystem: UnitSystem
  inputs: RunInputs
  assume: Assumptions
  shiftH: number
  onAssume: (patch: Partial<Assumptions>) => void
}

const SPLIT = STATES as [keyof TimeSplit, string][]
/** Seconds in a shown state — repositioning at a pick/drop counts as "Pick / drop", so shares add to 100%. */
const inState = (t: TimeSplit, k: keyof TimeSplit) => (k === 'handle' ? t.handle + t.reposition : t[k])
const FLOW_COLS: Col[] = [
  { label: 'Flow', left: true }, { label: 'Moves/h target' }, { label: 'Sizing distance' }, { label: 'Driven' }, { label: 'Engine cycle' },
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

export default memo(function RunDetails({ R, S, project, vehicleById, unitSystem, inputs, assume, shiftH, onAssume }: Props) {
  const unit = units.distance.label(unitSystem)
  const len = (ft?: number) => fmtLength(ft, unitSystem)
  const total = R ? R.types.reduce((a, t) => a + t.target, 0) : 0
  const flows = project.flows ?? []
  const linked = flows.filter(f => f.fromPointId && f.toPointId)
  const name = (id?: string) => project.simLayout?.points.find(p => p.id === id)?.name ?? '—'
  const time = R ? R.types.reduce((acc, t) => { for (const k of Object.keys(acc) as (keyof TimeSplit)[]) acc[k] += t.time[k]; return acc },
    { travel: 0, handle: 0, reposition: 0, wait: 0, charge: 0, idle: 0 } as TimeSplit) : null
  const tot = time ? Object.values(time).reduce((a, b) => a + b, 0) || 1 : 1

  return (
    <section className="sim-below">
      <details className="sim-disc">
        <summary>Flows — engine vs simulated<span className="meta">{R ? flowSummary(R, linked.length, assume.demandPct, flows) : 'simulating…'}</span></summary>
        <div className="sim-disc-body">
          <DataTable label="Flows" cols={FLOW_COLS} rows={linked.map(f => {
            const sim = R?.flows.find(x => x.flowId === f.id)
            const why = R?.excluded.find(x => x.flowId === f.id)?.why
            const e = flowDerived(f, f.vehicleId ? vehicleById.get(f.vehicleId) : undefined)
            const target = f.thruPerHr * assume.demandPct / 100
            const head: Cell[] = [`${name(f.fromPointId)} → ${name(f.toPointId)}`, Math.round(target), len(f.distanceFt)]
            if (why) return [...head, { v: `Left out of the run — ${why.toLowerCase()}`, cls: 'dim l' }, null, null, null, null, null]
            return [...head, len(sim?.measuredFt), secs(e.cycleSeconds), e.rawVehicles == null ? null : e.rawVehicles.toFixed(2),
              { v: sim ? sim.perHr.toFixed(1) : null, cls: sim && sim.perHr < target * 0.98 ? 'bad' : '' }, secs(sim?.mission), secs(sim?.wait)]
          })} />
          {time && (
            <div className="sim-split-wrap">
              <div className="sim-splitleg">{SPLIT.map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l} {pct(inState(time, k) / tot)}</span>)}</div>
              <div className="sim-split">{SPLIT.map(([k]) => <span key={k} className={`st-${k}`} style={{ width: `${(inState(time, k) / tot) * 100}%` }} />)}</div>
            </div>
          )}
          {R && (
            <dl className="sim-kv">
              <dt>Battery at end of shift (avg / lowest)</dt><dd>{R.types.map(t => `${Math.round(t.socAvg)}% / ${Math.round(t.socMin)}%`).join(' · ')}</dd>
              <dt>Trips to charge</dt><dd>{R.types.reduce((a, t) => a + t.chargeTrips, 0)}</dd>
              <dt>Orders waiting at the end</dt><dd>{R.orders.waiting}</dd>
            </dl>
          )}
        </div>
      </details>

      <details className="sim-disc">
        <summary>Vehicles<span className="meta">{R ? `${R.vehicles.length} vehicle${R.vehicles.length === 1 ? '' : 's'} · ${R.orders.delivered} moves` : 'simulating…'}</span></summary>
        <div className="sim-disc-body">
          {R && <>
            <DataTable label="By vehicle type" cols={TYPE_COLS} rows={R.types.map(t => [
              vehicleById.get(t.vehicleId)?.name ?? t.vehicleId, t.fleet, t.done, t.perHr.toFixed(1), t.target.toFixed(0),
              pct(t.utilization), secs(t.avgWait), `${Math.round(t.socAvg)}% / ${Math.round(t.socMin)}%`, t.chargeTrips,
            ])} />
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
          </>}
        </div>
      </details>

      <details className="sim-disc">
        <summary>Hour by hour</summary>
        <div className="sim-disc-body">{S && R ? <HourChart S={S} target={total} hours={Math.ceil(R.t / 3600)} /> : <p className="sim-card-note">Simulating…</p>}</div>
      </details>

      <details className="sim-disc">
        <summary>Locations<span className="meta">{S?.zoneStats.size ?? 0}</span></summary>
        <div className="sim-disc-body">
          <DataTable label="Locations" cols={LOC_COLS} rows={S && R ? [...S.zoneStats].map(([z, st]) => {
            const p = S.G.points[S.G.zoneNode.get(z) ?? -1]
            return [p?.name ?? z, p?.type ?? '', st.visits, pct(st.occT / Math.max(1, R.t)), st.maxQ, st.visits ? secs(st.waitT / st.visits) : null]
          }) : []} />
        </div>
      </details>

      <details className="sim-disc">
        <summary>B56.5 clearance<span className="meta">{inputs.clearances.filter(c => c.status === 'capped').length} slowed · {inputs.clearances.filter(c => c.status === 'violation').length} blocked</span></summary>
        <div className="sim-disc-body">
          {inputs.clearances.some(c => c.status === 'capped' || c.status === 'violation')
            ? <ul className="sim-list">{inputs.clearances.filter(c => c.status === 'capped' || c.status === 'violation').map(c => {
                const seg = project.simLayout?.segments.find(s => s.id === c.segId)
                return <li key={c.segId}>{name(seg?.a)} – {name(seg?.b)}: {c.tightestIn?.toFixed(1)} in · {c.reason}</li>
              })}</ul>
            : <p className="sim-card-note">No route is slowed or blocked.</p>}
        </div>
      </details>

      <details className="sim-disc">
        <summary>Assumptions<span className="meta">pace {assume.pacePct}% · safety {fmtLength(assume.safetyFt, unitSystem, 1)} · demand {assume.demandPct}%</span></summary>
        <div className="sim-disc-body">
          <div className="sim-assume">
            <Num label="Pace (% of rated speed)" unit="%" value={assume.pacePct} min={10} max={100} step={5} onChange={v => onAssume({ pacePct: v })} />
            <Num label="Safety distance" unit={unit} value={+lengthToDisplay(assume.safetyFt, unitSystem).toFixed(1)} min={0.5} max={30} step={0.5} onChange={v => onAssume({ safetyFt: lengthFromDisplay(v, unitSystem) })} />
            <Num label="Demand (% of Sizing moves/h)" unit="%" value={assume.demandPct} min={10} max={300} step={5} onChange={v => onAssume({ demandPct: v })} />
            <label className="sim-field"><span>Arrivals</span>
              <select value={assume.arrivals} onChange={e => onAssume({ arrivals: e.target.value as SimSettings['arrivals'] })}>
                <option value="regular">Regular</option><option value="random">Random (Poisson)</option>
              </select>
            </label>
            <Num label="Seed" unit="" value={assume.seed} min={1} max={99999} step={1} onChange={v => onAssume({ seed: Math.round(v) })} />
            <div className="sim-field"><span>Shift (Step 1)</span><b className="num">{project.shiftsPerDay ?? 1} × {shiftH} h</b></div>
          </div>
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
          {R && R.flags.length > 0 && (
            <>
              <h4 className="sim-h4">Missing data — fallbacks used</h4>
              <ul className="sim-list">{[...new Map(R.flags.map(f => [f.field + f.message, f])).values()].map((f, i) => <li key={i}>{f.message}</li>)}</ul>
            </>
          )}
        </div>
      </details>
    </section>
  )
})

/** "4 flows · all within 2% of target" — the line under the collapsed flows table. */
function flowSummary(R: SimResults, n: number, demandPct: number, flows: { id: string; thruPerHr: number }[]): string {
  const short = R.flows.filter(x => { const f = flows.find(q => q.id === x.flowId); return f && x.perHr < f.thruPerHr * demandPct / 100 * 0.98 }).length
  return `${n} flow${n === 1 ? '' : 's'} · ${short ? `${short} below target` : 'all within 2% of target'} · ${R.orders.delivered} moves`
}

function Num({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="sim-field"><span>{label}</span>
      <span className="sim-input-unit">
        <input type="number" min={min} max={max} step={step} defaultValue={value} key={value}
          onBlur={e => { const v = Number(e.target.value); if (isFinite(v)) onChange(Math.max(min, Math.min(max, v))) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        {unit && <span>{unit}</span>}
      </span>
    </label>
  )
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
  const short = data.filter(d => d.moves < target * 0.98).length
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
          <ReferenceLine yAxisId="m" y={target} stroke="var(--accent)" strokeDasharray="5 4" label={{ value: `Target ${Math.round(target)}/h`, position: 'insideTopLeft', fill: 'var(--accent)', fontSize: 10 }} />
          <Line isAnimationActive={false} yAxisId="w" dataKey="waiting" name="Orders waiting (most)" stroke="var(--warn)" strokeWidth={2} dot={false} type="monotone" />
        </ComposedChart>
      </ChartFrame>
      <ChartCaption>{short === 0 ? 'Every hour met the target.' : `${short} of ${data.length} hours below the target.`} Bars: moves delivered · dashed: target · line: most orders waiting (right axis).</ChartCaption>
    </>
  )
}
