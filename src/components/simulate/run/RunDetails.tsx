'use client'

// Run details, one click away (proof of concept; spec §7 "More data"): engine vs simulated per flow,
// where the time went, battery, hour by hour, per location, the B56.5 effect, and the assumptions
// with the vehicle data behind them. Fallbacks the engine used for missing data are listed — nothing
// is silently invented.

import type { SimState } from '@/src/calc/sim/engine'
import type { RunInputs } from '@/src/calc/sim/runInputs'
import type { SimResults, SimSettings, TimeSplit } from '@/src/calc/sim/types'
import { flowDerived } from '@/src/calc/flowMetrics'
import type { StoredProject } from '@/src/lib/storage'
import { lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
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
  total: number
  onAssume: (patch: Partial<Assumptions>) => void
}

const SPLIT: [keyof TimeSplit, string][] = [['travel', 'Travelling'], ['handle', 'Pick / drop'], ['wait', 'Waiting'], ['charge', 'Charging'], ['idle', 'Idle']]
const pct = (x: number) => `${Math.round(x * 100)}%`
const secs = (s: number | null | undefined) => (s == null || !isFinite(s) ? '—' : `${Math.round(s)} s`)

export default function RunDetails({ R, S, project, vehicleById, unitSystem, inputs, assume, shiftH, total, onAssume }: Props) {
  const unit = units.distance.label(unitSystem)
  const len = (ft?: number) => (ft == null || !isFinite(ft) ? '—' : `${lengthToDisplay(ft, unitSystem).toFixed(0)} ${unit}`)
  const flows = project.flows ?? []
  const name = (id?: string) => project.simLayout?.points.find(p => p.id === id)?.name ?? '—'
  const time = R ? R.types.reduce((acc, t) => { for (const [k] of SPLIT) acc[k] += t.time[k]; acc.reposition += t.time.reposition; return acc },
    { travel: 0, handle: 0, reposition: 0, wait: 0, charge: 0, idle: 0 } as TimeSplit) : null
  const tot = time ? Object.values(time).reduce((a, b) => a + b, 0) || 1 : 1

  return (
    <section className="sim-below">
      <details className="sim-disc" open>
        <summary>Flows — engine vs simulated<span className="meta">{R ? `${(R.t / 3600).toFixed(0)} h · ${R.orders.delivered} moves` : 'simulating…'}</span></summary>
        <div className="sim-disc-body">
          <div className="sim-tbl-wrap">
            <table className="sim-tbl">
              <thead><tr><th className="l">Flow</th><th>Moves/h target</th><th>Sizing distance</th><th>Driven</th><th>Engine cycle</th><th>Engine demand (veh)</th><th className="band">Sim moves/h</th><th className="band">Sim mission</th><th className="band">Avg wait</th></tr></thead>
              <tbody>
                {flows.filter(f => f.fromPointId && f.toPointId).map(f => {
                  const sim = R?.flows.find(x => x.flowId === f.id)
                  const why = R?.excluded.find(x => x.flowId === f.id)?.why
                  const e = flowDerived(f, f.vehicleId ? vehicleById.get(f.vehicleId) : undefined)
                  const target = f.thruPerHr * assume.demandPct / 100
                  return (
                    <tr key={f.id}>
                      <td className="l">{name(f.fromPointId)} → {name(f.toPointId)}</td>
                      <td>{target.toFixed(0)}</td>
                      <td>{len(f.distanceFt)}</td>
                      {why ? <td className="dim l" colSpan={6}>Left out of the run — {why.toLowerCase()}</td> : <>
                        <td>{len(sim?.measuredFt)}</td>
                        <td>{secs(e.cycleSeconds)}</td>
                        <td>{e.rawVehicles == null ? '—' : e.rawVehicles.toFixed(2)}</td>
                        <td className={`band${sim && sim.perHr < target * 0.98 ? ' bad' : ''}`}>{sim ? sim.perHr.toFixed(1) : '—'}</td>
                        <td className="band">{secs(sim?.mission)}</td>
                        <td className="band">{secs(sim?.wait)}</td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="sim-card-note">Engine cycle is Sizing’s: Sizing distance and route tier, a full loaded-out, empty-back cycle. Sim mission runs the driven routes at {assume.pacePct}% pace with traffic, stations and charging, from dispatch to drop-off — its empty leg starts wherever the vehicle is.</p>
          {time && (
            <div className="sim-split-wrap">
              <div className="sim-splitleg">{SPLIT.map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l} {pct(time[k] / tot)}</span>)}</div>
              <div className="sim-split">{SPLIT.map(([k]) => <span key={k} className={`st-${k}`} style={{ width: `${(time[k] / tot) * 100}%` }} />)}</div>
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
        <summary>Hour by hour</summary>
        <div className="sim-disc-body">{S && R ? <HourChart S={S} target={total} hours={Math.ceil(R.t / 3600)} /> : <p className="sim-card-note">Simulating…</p>}</div>
      </details>

      <details className="sim-disc">
        <summary>Locations<span className="meta">{S?.zoneStats.size ?? 0}</span></summary>
        <div className="sim-disc-body">
          <div className="sim-tbl-wrap">
            <table className="sim-tbl">
              <thead><tr><th className="l">Location</th><th className="l">Type</th><th>Visits</th><th>Occupied</th><th>Max queue</th><th>Avg wait / visit</th></tr></thead>
              <tbody>
                {S && R && [...S.zoneStats].map(([z, st]) => {
                  const p = S.G.points[S.G.zoneNode.get(z) ?? -1]
                  return (
                    <tr key={z}>
                      <td className="l">{p?.name ?? z}</td><td className="l">{p?.type ?? ''}</td><td>{st.visits}</td>
                      <td>{pct(st.occT / Math.max(1, R.t))}</td><td>{st.maxQ}</td><td>{st.visits ? secs(st.waitT / st.visits) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
            : <p className="sim-card-note">No route is slowed or blocked. Draw walls, columns and rack faces as objects for the rule to measure against.</p>}
        </div>
      </details>

      <details className="sim-disc">
        <summary>Assumptions<span className="meta">pace {assume.pacePct}% · safety {lengthToDisplay(assume.safetyFt, unitSystem).toFixed(1)} {unit} · demand {assume.demandPct}%</span></summary>
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

/** Moves delivered per hour (bars) against the target (dashed), and orders waiting (line, right axis). */
function HourChart({ S, target, hours }: { S: SimState; target: number; hours: number }) {
  const n = Math.max(1, hours), vals = Array.from({ length: n }, (_, i) => S.hourly[i] ?? 0)
  const ser = [...S.series.values()].flat()
  const W = 760, H = 220, pad = { l: 40, r: 40, t: 10, b: 24 }
  const ymax = Math.max(10, Math.ceil(Math.max(target * 1.25, ...vals) / 10) * 10)
  const pmax = Math.max(4, ...ser.map(p => p[1])) * 1.15
  const bw = (W - pad.l - pad.r) / n
  const Y = (v: number) => H - pad.b - ((H - pad.t - pad.b) * v) / ymax
  const Y2 = (v: number) => H - pad.b - ((H - pad.t - pad.b) * v) / pmax
  return (
    <>
      <div className="sim-chartleg"><span><i className="bar" />Moves delivered</span><span><i className="tgt" />Target</span><span><i className="wait" />Orders waiting (right axis)</span></div>
      <svg className="sim-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Moves per hour">
        {Array.from({ length: 6 }, (_, i) => (ymax * i) / 5).map(v => (
          <g key={v}><line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className="grid" /><text x={pad.l - 6} y={Y(v) + 4} className="ax l">{Math.round(v)}</text></g>
        ))}
        {vals.map((v, i) => (
          <g key={i}><rect x={pad.l + i * bw + bw * 0.18} y={Y(v)} width={bw * 0.64} height={Y(0) - Y(v)} className="bar" /><text x={pad.l + i * bw + bw / 2} y={H - 6} className="ax">{i + 1}h</text></g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={Y(target)} y2={Y(target)} className="tgt" />
        {ser.length > 1 && <path d={ser.map((p, i) => `${i ? 'L' : 'M'}${pad.l + (p[0] / 3600) * bw} ${Y2(p[1])}`).join('')} className="wait" />}
        {Array.from({ length: 5 }, (_, q) => (pmax * q) / 4).map(v => <text key={v} x={W - pad.r + 6} y={Y2(v) + 4} className="ax r">{Math.round(v)}</text>)}
      </svg>
    </>
  )
}
