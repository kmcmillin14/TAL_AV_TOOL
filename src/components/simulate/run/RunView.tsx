'use client'

// Run mode (CB18 proof of concept; spec v2 §7). One verdict row per vehicle type — fleet stepper,
// Meets / Tight / Falls short / Gridlock, moves/h against target, wait, busy — beside the Fleet
// Engine's figure. The verdict comes from a full shift run off-screen; the map plays a second copy of
// the same run (same seed) at ×1/×10/×100. Details sit one click away (progressive disclosure).
// Nothing here changes the sized fleet or the quote except "Use N in pricing" (D-1, raise-only, confirmed).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSim, DT, step, type SimState } from '@/src/calc/sim/engine'
import { results, VERDICT_LABEL } from '@/src/calc/sim/results'
import { runFleet, simInputsKey, type RunInputs } from '@/src/calc/sim/runInputs'
import { RUN_DEFAULTS } from '@/src/lib/simFields'
import { useByValue } from '@/src/lib/useByValue'
import { engineFleetByType, engineFleetTotal } from '@/src/calc/fleet'
import type { SimResults, SimSettings, Verdict } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import { getProject, patchSimSettings, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutCanvas from '../layout/LayoutCanvas'
import PricingAction from './PricingAction'
import RunDetails, { type Assumptions } from './RunDetails'
import { RunScene, STATES } from './RunScene'

/** Background run slices stay under half a 60 fps frame, so playback keeps its pace. */
const SLICE_MS = 8
const VARIABILITY_RUNS = 10

interface Props {
  project: StoredProject
  /** The vehicle files — for pricing (Use N in pricing), which never sees simulation overrides. */
  vehicles: Vehicle[]
  /** The run's vehicles: the files with the project's overrides (Milestone 6). */
  simVehicles: Vehicle[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
  /** What the run drives — built once by SimulateShell and shared with validation. */
  inputs: RunInputs
  payload: { length: number; width: number } | null
  /** Open the Assumptions drawer — all of it, or one vehicle type's values (Milestone 6). */
  onAssumptions: (focus?: string | null) => void
  /** How many assumptions are overridden (the chip under the verdict). */
  changed: number
  /** Set when the run does not drive Sizing's flows as they are (vehicle switcher): names of the
   *  vehicle simulated and Sizing's. Such a run never saves Sizing's verdict or offers pricing. */
  simulatedAs?: { as: string; sizing: string }
}

const clock = (t: number) => {
  const d = Math.floor(t / 86400) + 1, s = Math.floor(t % 86400)
  return `Day ${d} · ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}

/** Step a simulation off-screen in short slices so the page stays responsive. */
function runInSlices(S: SimState, endT: number, onDone: () => void, alive: () => boolean) {
  const slice = () => {
    if (!alive()) return
    const t0 = performance.now()
    while (S.t < endT && !S.gridlock && performance.now() - t0 < SLICE_MS) for (let i = 0; i < 400 && S.t < endT && !S.gridlock; i++) step(S)
    if (S.t < endT && !S.gridlock) setTimeout(slice, 0); else onDone()
  }
  setTimeout(slice, 0)
}

/** Fit margins for the run map: name pills above, the playback bar below — no tool column. */
const RUN_INSET = { top: 40, right: 24, bottom: 64, left: 24 }

export default function RunView({ onAssumptions, changed, project, vehicles, simVehicles, vehicleById, settings, fleet, unitSystem, inputs, payload, simulatedAs }: Props) {
  const simSettings = project.simSettings ?? {}
  /** The run drives Sizing's flows as they are: it may save Sizing's verdict and offer pricing. */
  const forSizing = !simulatedAs
  const engineFleet = useByValue(useMemo(() => engineFleetByType(fleet), [fleet]))
  // The key hashes the vehicle files (overrides are hashed from simSettings) — as Sizing does, so a
  // result is only "stale" when its inputs really changed.
  const fileVehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
  const inputsKey = useMemo(() => simInputsKey(project, fileVehicleById), [project, fileVehicleById])

  const assume: Assumptions = useMemo(() => ({
    pacePct: simSettings.pacePct ?? RUN_DEFAULTS.pacePct, safetyFt: simSettings.safetyFt ?? RUN_DEFAULTS.safetyFt,
    arrivals: simSettings.arrivals ?? RUN_DEFAULTS.arrivals, demandPct: simSettings.demandPct ?? RUN_DEFAULTS.demandPct, seed: simSettings.seed ?? RUN_DEFAULTS.seed,
  }), [simSettings.pacePct, simSettings.safetyFt, simSettings.arrivals, simSettings.demandPct, simSettings.seed])
  const shiftH = project.hoursPerShift ?? 8
  const stepper = useByValue(simSettings.fleet)
  const fleetBy = useByValue(useMemo(() => runFleet(engineFleet, stepper, inputs.flows.map(f => f.vehicleId)), [engineFleet, stepper, inputs.flows]))
  const simConfig = useCallback((seed: number): SimSettings => ({
    fleet: fleetBy, demandPct: assume.demandPct, seed, arrivals: assume.arrivals, pacePct: assume.pacePct, safetyFt: assume.safetyFt,
    staffedHr: settings.dailyOpHr, targetUtilization: settings.targetUtilization, ...(payload ? { payloadFt: payload } : {}),
  }), [fleetBy, assume, settings.dailyOpHr, settings.targetUtilization, payload])

  // ---- the verdict: one full shift off-screen; restarted whenever an input changes ----
  const [R, setR] = useState<{ res: SimResults; S: SimState } | null>(null)
  const token = useRef(0)
  // Nothing the run can place or drive (e.g. every route blocked): say so instead of "Simulating…".
  const [unrunnable, setUnrunnable] = useState(false)
  // Leaving Run mode stops every off-screen run (verdict, one-fewer checks, variability).
  useEffect(() => () => { token.current++ }, [])
  useEffect(() => {
    const tok = ++token.current
    setR(null)
    const S = createSim(inputs.layout, inputs.flows, simVehicles, simConfig(assume.seed))
    setUnrunnable(!S)
    if (!S) return
    runInSlices(S, shiftH * 3600, () => setR({ res: results(S), S }), () => tok === token.current)
  }, [inputs, simVehicles, simConfig, assume.seed, shiftH])

  // ---- the result is kept for Sizing's verdict chip; an applied fleet it confirms is refreshed ----
  useEffect(() => {
    if (!R || !forSizing) return
    const types = Object.fromEntries(R.res.types.map(t => [t.vehicleId, { fleet: fleetBy[t.vehicleId] ?? 0, verdict: R.res.gridlock ? 'gridlock' as const : t.verdict }]))
    const fresh = getProject(project.id)
    if (!fresh) return
    const ss = fresh.simSettings ?? {}
    const lastRun = { key: inputsKey, types }
    const applied = Object.fromEntries(Object.entries(ss.appliedFleet ?? {}).map(([v, a]) =>
      [v, types[v]?.verdict === 'meets' && types[v].fleet === a.fleet ? { ...a, key: inputsKey } : a]))
    const next = { ...ss, lastRun, ...(ss.appliedFleet ? { appliedFleet: applied } : {}) }
    if (JSON.stringify(next) !== JSON.stringify(ss)) patchSimSettings(project.id, next)
    // Only a new result writes; the project id and key are read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R])

  // ---- "Use N in pricing" needs the smallest fleet that Meets: run one fewer, per type that Meets above the engine ----
  const [lower, setLower] = useState<Record<string, Verdict | 'checking'>>({})
  useEffect(() => {
    setLower({})
    if (!R || R.res.gridlock || !forSizing) return   // only pricing reads it
    const todo = R.res.types.filter(t => t.verdict === 'meets' && (fleetBy[t.vehicleId] ?? 0) > (engineFleet[t.vehicleId] ?? 0)).map(t => t.vehicleId)
    const tok = token.current
    const next = (i: number) => {
      if (i >= todo.length || tok !== token.current) return
      const vid = todo[i]
      setLower(m => ({ ...m, [vid]: 'checking' }))
      const S = createSim(inputs.layout, inputs.flows, simVehicles, { ...simConfig(assume.seed), fleet: { ...fleetBy, [vid]: fleetBy[vid] - 1 } })
      if (!S) { setLower(m => ({ ...m, [vid]: 'short' })); return next(i + 1) }   // one fewer cannot even be placed
      runInSlices(S, shiftH * 3600, () => {
        const r = results(S)
        setLower(m => ({ ...m, [vid]: r.gridlock ? 'gridlock' : r.types.find(t => t.vehicleId === vid)?.verdict ?? 'short' }))
        next(i + 1)
      }, () => tok === token.current)
    }
    next(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R])

  // ---- variability: 10 seeds, ranges and "met in k/10" ----
  const [vari, setVari] = useState<{ k: number; out: SimResults[] } | null>(null)
  useEffect(() => setVari(null), [inputs, simConfig])
  const runVariability = () => {
    const tok = token.current, out: SimResults[] = []
    const next = (k: number) => {
      if (k >= VARIABILITY_RUNS || tok !== token.current) return
      const S = createSim(inputs.layout, inputs.flows, simVehicles, simConfig(assume.seed + k))
      if (!S) return
      runInSlices(S, shiftH * 3600, () => { out.push(results(S)); setVari({ k: k + 1, out: [...out] }); next(k + 1) }, () => tok === token.current)
    }
    setVari({ k: 0, out }); next(0)
  }

  // ---- live playback ----
  const live = useRef<SimState | null>(null)
  const [, frame] = useState(0)
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(10)
  const [follow, setFollow] = useState(-1)
  const [labels, setLabels] = useState(true)
  const [busyFF, setBusyFF] = useState(false)
  const ffToken = useRef(0)
  useEffect(() => () => { ffToken.current++ }, [])
  const restart = useCallback(() => { ffToken.current++; setBusyFF(false); live.current = createSim(inputs.layout, inputs.flows, simVehicles, simConfig(assume.seed)); setRunning(true); frame(n => n + 1) }, [inputs, simVehicles, simConfig, assume.seed])
  useEffect(() => { restart() }, [restart])
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const S = live.current
      if (S && running && !busyFF && !S.gridlock) {
        acc += dt * speed
        let n = 0
        while (acc >= DT && n < 2000) { step(S); acc -= DT; n++ }
        if (n >= 2000) acc = 0
        frame(x => x + 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, busyFF])
  const fastForward = (endT: number) => {
    const S = live.current
    if (!S || busyFF) return
    setBusyFF(true)
    const tok = ++ffToken.current
    runInSlices(S, endT, () => { if (tok === ffToken.current) { setBusyFF(false); frame(x => x + 1) } }, () => tok === ffToken.current)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || (e.target as HTMLElement)?.closest?.('input,select,textarea,button,summary')) return
      e.preventDefault(); setRunning(r => !r)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /** Stable, so the memoized Run details do not re-render every frame. */
  const openAll = useCallback(() => onAssumptions(null), [onAssumptions])

  const setFleet = (vid: string, n: number) => {
    const next = { ...(simSettings.fleet ?? {}), [vid]: Math.max(1, Math.min(500, n)) }
    if (next[vid] === engineFleet[vid]) delete next[vid]
    patchSimSettings(project.id, { fleet: next })
  }

  const S = live.current
  const followed = S && follow >= 0 ? S.veh[follow] : null

  return (
    <div className="sim-run">
      {/* Verdict — the one figure acted on, per vehicle type. */}
      <section className="sim-verdict" aria-label="Verdict">
        {Object.keys(fleetBy).map(vid => {
          const v = vehicleById.get(vid)
          const n = fleetBy[vid] ?? 0
          const res = R?.res.types.find(x => x.vehicleId === vid) ?? null
          return (
            <div key={vid} className="sim-vrow">
              <button type="button" className="sim-vveh" title="Speeds, size and charging used in the run" onClick={() => onAssumptions(vid)}>
                {v?.display.heroImage && <img src={v.display.heroImage} alt="" />}
                <div><div className="nm">{v?.name ?? vid}</div><div className="mf">{v?.display.manufacturer}</div></div>
              </button>
              <div className="sim-stepper" role="group" aria-label={`${v?.name ?? 'Vehicle'} fleet`}>
                <button type="button" aria-label="Fewer vehicles" onClick={() => setFleet(vid, n - 1)}>−</button>
                <span className="num">{n}</span>
                <button type="button" aria-label="More vehicles" onClick={() => setFleet(vid, n + 1)}>+</button>
              </div>
              {R?.res.gridlock
                ? <><span className="sim-chip gridlock">Gridlock</span><span className="sim-vstats">Stopped at <b>{clock(R.res.gridlock.t)}</b> · {R.res.gridlock.where} · {R.res.gridlock.vehicle}{R.res.gridlock.blockedBy ? ` waits on ${R.res.gridlock.blockedBy}` : ''}</span></>
                : res
                  ? <><span className={`sim-chip ${res.verdict}`}>{VERDICT_LABEL[res.verdict]}</span>
                      <span className="sim-vstats"><b className="num">{res.perHr.toFixed(1)}</b> / {res.target.toFixed(0)} moves/h · <b className="num">{Math.round(res.avgWait)} s</b> wait · <b className="num">{Math.round(res.utilization * 100)}%</b> busy</span></>
                  : R
                    ? <><span className="sim-chip short">Not run</span><span className="sim-vstats">{R.res.excluded.map(x => x.why).filter((w, i, a) => a.indexOf(w) === i).join(' · ') || 'No flow of this vehicle could run'}</span></>
                    : unrunnable
                      ? <><span className="sim-chip short">Not run</span><span className="sim-vstats">Nothing the run can place or drive — check Validation in Edit layout</span></>
                      : <><span className="sim-chip">Simulating</span><span className="sim-vstats">Running a full {shiftH} h shift…</span></>}
              {R && forSizing && (
                <PricingAction
                  project={project} vehicles={vehicles} vehicleId={vid} n={n} engineN={engineFleet[vid] ?? 0}
                  verdict={R.res.gridlock ? 'gridlock' : res?.verdict ?? null} lower={lower[vid]} inputsKey={inputsKey}
                  onApplied={appliedFleet => patchSimSettings(project.id, { appliedFleet })}
                  onStepDown={() => setFleet(vid, n - 1)}
                />
              )}
            </div>
          )
        })}
        <div className="sim-vsub">
          {simulatedAs && <span className="sim-as-note">Simulating as <b>{simulatedAs.as}</b> — Sizing and the price use {simulatedAs.sizing || 'no vehicle yet'}</span>}
          <span>{forSizing ? 'Engine sized' : 'Engine would size'} <b className="num">{engineFleetTotal(fleet)}</b>{Object.keys(simSettings.fleet ?? {}).some(vid => vid in fleetBy) && <> · <button type="button" className="link-btn" onClick={() => patchSimSettings(project.id, { fleet: Object.fromEntries(Object.entries(simSettings.fleet ?? {}).filter(([vid]) => !(vid in fleetBy))) })}>Reset to engine</button></>}</span>
          <span>Full {shiftH} h shift · seed {assume.seed} · {assume.arrivals} arrivals · pace {assume.pacePct}%</span>
          <button type="button" className="sim-chip sm sim-assume-chip" onClick={openAll}>Assumptions{changed ? ` · ${changed} changed` : ''}</button>
          <span className="grow" />
          {vari && vari.k < VARIABILITY_RUNS && <span className="sim-busy">Variability {vari.k}/{VARIABILITY_RUNS}…</span>}
          {vari && vari.k >= VARIABILITY_RUNS && <VariabilityChip out={vari.out} arrivals={assume.arrivals} />}
          {!vari && <button type="button" className="btn btn-sm ghost" onClick={runVariability}>Check variability</button>}
        </div>
      </section>

      {/* The map, playing the same run. */}
      <LayoutCanvas
        layout={inputs.layout}
        laneWidths={inputs.laneWidths}
        fitInset={RUN_INSET}
        panAlways
        showLabels={labels}
        follow={followed ? { x: followed.x, y: followed.y } : null}
        scene={S ? (px => <RunScene S={S} follow={follow} labels={labels} px={px} />) : undefined}
      >
        <div className="sim-viewctl" onPointerDown={e => e.stopPropagation()}>
          <button type="button" className={`btn btn-sm${labels ? ' on' : ''}`} onClick={() => setLabels(l => !l)}>{labels ? 'Hide' : 'Show'} labels</button>
          <select className="sim-sel" value={follow} onChange={e => setFollow(Number(e.target.value))} aria-label="Follow a vehicle">
            <option value={-1}>Follow: none</option>
            {S?.veh.map(v => <option key={v.i} value={v.i}>{v.id}</option>)}
          </select>
          {followed && <span className="sim-legs-key"><i className="empty" />Empty to pick<i className="loaded" />Loaded to drop</span>}
        </div>
        <div className="sim-hud" onPointerDown={e => e.stopPropagation()}>
          <button type="button" className="btn primary btn-sm" onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Play'}</button>
          <div className="seg-toggle">
            {[1, 10, 100].map(x => <button key={x} type="button" className={`seg-btn${speed === x ? ' on' : ''}`} onClick={() => { setSpeed(x); setRunning(true) }}>×{x}</button>)}
          </div>
          <button type="button" className="btn btn-sm ghost" disabled={busyFF} onClick={() => S && fastForward(S.t + shiftH * 3600)}>Run shift</button>
          <button type="button" className="btn btn-sm ghost" disabled={busyFF} onClick={() => S && fastForward((Math.floor(S.t / 86400 + 1e-9) + 1) * 86400)}>Run 24 h</button>
          <button type="button" className="btn btn-sm ghost" onClick={restart}>Restart</button>
          <span className="sim-clock num">{S ? clock(S.t) : '—'}</span>
          {S?.gridlock && <span className="sim-chip gridlock">Gridlock — see the red ring</span>}
          <span className="grow" />
          <span className="sim-states">{STATES.map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l}</span>)}</span>
        </div>
      </LayoutCanvas>

      <RunDetails
        R={R?.res ?? null} S={R?.S ?? null} project={project} vehicleById={vehicleById} unitSystem={unitSystem}
        inputs={inputs} assume={assume} onOpenAssumptions={openAll}
      />
    </div>
  )
}

/** "Met in k/10" — the ranges one click away. */
function VariabilityChip({ out, arrivals }: { out: SimResults[]; arrivals: SimSettings['arrivals'] }) {
  const [open, setOpen] = useState(false)
  const rng = (f: (r: SimResults) => number) => [Math.min(...out.map(f)), Math.max(...out.map(f))]
  const met = out.filter(r => r.verdict === 'meets' || r.verdict === 'tight').length
  const gl = out.filter(r => r.verdict === 'gridlock').length
  const ph = rng(r => r.types.reduce((a, t) => a + t.perHr, 0)), wt = rng(r => Math.max(0, ...r.types.map(t => t.avgWait))), bz = rng(r => Math.max(0, ...r.types.map(t => t.utilization)))
  return (
    <span className="sim-vari">
      <button type="button" className={`sim-chip ${met === out.length ? 'meets' : met >= out.length * 0.8 ? 'tight' : 'short'}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Met in {met}/{out.length}{gl ? ` · ${gl} gridlock` : ''}
      </button>
      {open && (
        <span className="sim-vari-detail">
          <b className="num">{ph[0].toFixed(1)}–{ph[1].toFixed(1)}</b> moves/h · <b className="num">{Math.round(wt[0])}–{Math.round(wt[1])} s</b> wait · <b className="num">{Math.round(bz[0] * 100)}–{Math.round(bz[1] * 100)}%</b> busy
          {arrivals === 'regular' && <span className="sim-card-note"> · regular arrivals — set Random in Assumptions for real spread</span>}
        </span>
      )}
    </span>
  )
}
