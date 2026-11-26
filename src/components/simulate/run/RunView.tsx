'use client'

// Run mode (CB18 proof of concept; spec v2 §7). One verdict row per vehicle type — fleet stepper,
// Meets / Falls short / Gridlock, moves/h against target, wait, busy — beside the Fleet
// Engine's figure. The verdict comes from a full shift run off-screen; the map plays a second copy of
// the same run (same seed) at ×1/×10/×100. Details sit one click away (progressive disclosure).
// Nothing here changes the sized fleet or the quote except "Use N in pricing" (D-1, raise-only, confirmed).

import Icon from '@/src/design-system/components/Icon'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSim, DT, step, type SimState } from '@/src/calc/sim/engine'
import { chargerStats, results, VERDICT_LABEL } from '@/src/calc/sim/results'
import { runHeadline, type Headline, type Outcome, type Tone } from '@/src/calc/sim/headline'
import { checkScale, fleetNeeds, mayPassUtilization, verdictPasses as passes, type Grade } from '@/src/calc/sim/grades'
import { nextRightSize, type OneFewer, type Tried } from '@/src/calc/sim/rightSize'
import { simInputsKey, type RunInputs } from '@/src/calc/sim/runInputs'
import { RUN_DEFAULTS, step1DaysPerWeek } from '@/src/lib/simFields'
import KebabMenu from '../ui/KebabMenu'
import { engineFleetTotal } from '@/src/calc/fleet'
import type { BatteryCause, SimResults, SimSettings, Verdict } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import { getProject, patchSimSettings, type StoredProject } from '@/src/lib/storage'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutCanvas from '../layout/LayoutCanvas'
import PricingAction from './PricingAction'
import RunDetails, { DATA_TABS, type Assumptions, type DataTab } from './RunDetails'
import { RunScene, STATES } from './RunScene'
import { clock } from './time'
import { SimSidebar, type StepsProps } from '../ui/Guide'
import VehicleCard from './VehicleCard'

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
  /** Each vehicle type's payload, ft, by vehicle id (simulation vehicles). */
  payloads: Record<string, { length: number; width: number }>
  /** Open the Assumptions drawer — all of it, or one vehicle type's values (Milestone 6). */
  onAssumptions: (focus?: string | null) => void
  /** How many assumptions are overridden (the chip under the verdict). */
  changed: number
  /** Some flow runs on a vehicle other than its Sizing one (simulation vehicles): the run then never
   *  speaks for Sizing or the price. */
  differs: boolean
  /** Set a type's simulated count (the page's one writer of the stepper). */
  onFleet: (vehicleId: string, n: number | undefined) => void
  /** The static calc per type (the Fleet Engine for the flows as simulated) and the fleet the run
   *  places — worked out once by the page, shared with the chips and validation. */
  onResetFleet: (vehicleIds: string[]) => void
  engineFleet: Record<string, number>
  fleetBy: Record<string, number>
  /** The stage (Simulate or Results, 2026-11-18): the map playing the run, or the run's
   *  data (charts and tables). Both share this run and its verdict tiles. */
  view: 'sim' | 'data'
  /** The steps, for the one sidebar. */
  steps: StepsProps
  /** Sizing's static estimate (how the fleet operates), shown under Results beside the run's data. */
  estimate: ReactNode
}

/** A type's right-size search: the counts tried, and where it is — trying a count, done (the smallest that
 *  passes; null: none up to the limit, or gridlock), or stopped at the run limit. */
interface RightSize { tried: Tried; at: { next: number } | { done: number | null } | 'stopped' }
/** Each try is a full week; stop after this many and say so. */
const RIGHT_SIZE_MAX_RUNS = 8

/** Under a type in the fleet card: the search going on, then the right size — with one tap to try it. */
function RightSizeLine({ z, n, onTry }: { z: RightSize | undefined; n: number; onTry: (k: number) => void }) {
  if (!z) return null
  if (z.at === 'stopped') return <span className="sim-rightsize sim-busy">Stopped after {RIGHT_SIZE_MAX_RUNS} runs — try a count with the stepper</span>
  if ('next' in z.at) return <span className="sim-rightsize sim-busy">Finding the right size · trying {z.at.next}…</span>
  const k = z.at.done
  if (k === n) return <span className="sim-rightsize is-good" title={`${n - 1} does not pass all three checks`}>✓ {n} is the right size</span>
  if (k != null) {
    return (
      <span className="sim-rightsize is-warn">
        <span title="The smallest count that passes all three checks">Right size <b className="num">{k}</b> · {k > n ? `${k - n} more` : `${n - k} fewer`}</span>
        <button type="button" className="btn btn-sm ghost" onClick={() => onTry(k)}>Try {k}</button>
      </span>
    )
  }
  return <span className="sim-rightsize is-bad">{z.tried[n] === 'gridlock' ? 'Gridlock — fix the layout before sizing' : 'No count tried passes — check the layout and the flows'}</span>
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
const NO_LOADS: NonNullable<StoredProject['loads']> = []
const RUN_INSET = { top: 40, right: 24, bottom: 64, left: 24 }

export default function RunView({ onAssumptions, changed, project, vehicles, simVehicles, vehicleById, settings, fleet, unitSystem, inputs, payloads, differs, onFleet: setFleet, onResetFleet, engineFleet, fleetBy, view, estimate, steps }: Props) {
  const simSettings = project.simSettings ?? {}
  /** The run drives Sizing's flows as they are: it may save Sizing's verdict and offer pricing. */
  const ownConditions = ownConditionsOf(simSettings), forSizing = !differs && !ownConditions
  // The key hashes the vehicle files (overrides are hashed from simSettings) — as Sizing does, so a
  // result is only "stale" when its inputs really changed.
  const fileVehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
  const inputsKey = useMemo(() => simInputsKey(project, fileVehicleById), [project, fileVehicleById])

  const assume: Assumptions = useMemo(() => ({
    pacePct: simSettings.pacePct ?? RUN_DEFAULTS.pacePct, trafficPct: simSettings.trafficPct ?? RUN_DEFAULTS.trafficPct, safetyFt: simSettings.safetyFt ?? RUN_DEFAULTS.safetyFt,
    arrivals: simSettings.arrivals ?? RUN_DEFAULTS.arrivals, demandPct: simSettings.demandPct ?? RUN_DEFAULTS.demandPct, seed: simSettings.seed ?? RUN_DEFAULTS.seed,
  }), [simSettings.pacePct, simSettings.trafficPct, simSettings.safetyFt, simSettings.arrivals, simSettings.demandPct, simSettings.seed])
  // Shift coverage — days a week, shifts a day, shift length: simulation overrides, else Step 1. The
  // verdict run is a week, so the battery is judged over days; variability judges one shift.
  const step1 = { shiftH: project.hoursPerShift ?? 8, shiftsPerDay: project.shiftsPerDay ?? 1, daysPerWeek: step1DaysPerWeek(project) }
  const shiftH = simSettings.shiftH ?? step1.shiftH
  const shifts = simSettings.shiftsPerDay ?? step1.shiftsPerDay
  const daysPerWeek = simSettings.daysPerWeek ?? step1.daysPerWeek
  const staffedHr = Math.min(24, shiftH * shifts)
  // The utilization target the run is judged against: a simulation override, else Sizing's.
  const targetU = simSettings.targetUtilization ?? settings.targetUtilization
  const runSec = 7 * 86400
  const simConfig = useCallback((seed: number): SimSettings => ({
    fleet: fleetBy, demandPct: assume.demandPct, seed, arrivals: assume.arrivals, pacePct: assume.pacePct, trafficPct: assume.trafficPct, safetyFt: assume.safetyFt,
    staffedHr, daysPerWeek, shiftHr: shiftH, targetUtilization: targetU, ...(Object.keys(payloads).length ? { payloadFt: payloads } : {}),
  }), [fleetBy, assume, staffedHr, daysPerWeek, shiftH, targetU, payloads])
  /** A shift-coverage change: back to Step 1's value clears the override. */
  const setCoverage = (k: 'shiftH' | 'shiftsPerDay' | 'daysPerWeek', v: number) =>
    patchSimSettings(project.id, { [k]: v === step1[k] ? undefined : v })


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
    runInSlices(S, runSec, () => setR({ res: results(S), S }), () => tok === token.current)
  }, [inputs, simVehicles, simConfig, assume.seed, runSec])

  // ---- "Use N" needs the smallest fleet that Meets (the right-size search below finds it) ----
  /** Could one vehicle fewer still reach the target utilization? If not, it is not worth running. */
  const oneFewerMayMeet = (t: { utilization: number }, n: number) => n > 1 && mayPassUtilization(t.utilization, n, n - 1, targetU)
  /** Records on the stored run whether this type's count is the smallest that meets (Sizing's Use N). */
  function markSmallest(vid: string, smallest: boolean) {
    const fresh = getProject(project.id), run = fresh?.simSettings?.lastRun
    const t = run?.types[vid]
    if (!fresh || !run || run.key !== inputsKey || !t || t.fleet !== fleetBy[vid] || t.smallest === smallest) return
    patchSimSettings(project.id, { lastRun: { ...run, types: { ...run.types, [vid]: { ...t, smallest } } } })
  }

  // ---- the result is kept for Sizing's verdict chip; an applied fleet it confirms is refreshed ----
  useEffect(() => {
    if (!R || !forSizing) return
    // `smallest`: one fewer cannot meet. Known now when one fewer could not reach the target utilization
    // (it is not run); otherwise written when the one-fewer run below finishes.
    const types = Object.fromEntries(R.res.types.map(t => {
      const n = fleetBy[t.vehicleId] ?? 0, verdict = R.res.gridlock ? 'gridlock' as const : t.verdict
      return [t.vehicleId, { fleet: n, verdict, ...(passes(verdict) && !oneFewerMayMeet(t, n) ? { smallest: true } : {}) }]
    }))
    const fresh = getProject(project.id)
    if (!fresh) return
    const ss = fresh.simSettings ?? {}
    const lastRun = { key: inputsKey, types, chargers: chargerStats(R.S) }
    const applied = Object.fromEntries(Object.entries(ss.appliedFleet ?? {}).map(([v, a]) =>
      [v, passes(types[v]?.verdict) && types[v].fleet === a.fleet ? { ...a, key: inputsKey } : a]))
    const next = { ...ss, lastRun, ...(ss.appliedFleet ? { appliedFleet: applied } : {}) }
    if (JSON.stringify(next) !== JSON.stringify(ss)) patchSimSettings(project.id, next)
    // Only a new result writes; the project id and key are read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R])

  // ---- the right size (owner, 2026-11-22): per type, the smallest count that passes all three checks ----
  // Down from a count that passes, up from one that does not (the other types held); `nextRightSize` picks
  // each count to try. Its answer is also the "one fewer" pricing and the verdict read (`lower`).
  const [sizes, setSizes] = useState<Record<string, RightSize>>({})
  useEffect(() => {
    setSizes({})
    if (!R) return
    const tok = token.current
    // Only what the search needs from the run (the closure would otherwise keep the whole run alive).
    const gridlock = !!R.res.gridlock
    const types = R.res.types.filter(t => (fleetBy[t.vehicleId] ?? 0) > 0)
      .map(t => ({ vid: t.vehicleId, verdict: t.verdict, perHr: t.perHr, target: t.target, utilization: t.utilization, grades: t.grades }))
    const one = (i: number) => {
      if (i >= types.length || tok !== token.current) return
      const t = types[i], vid = t.vid, n = fleetBy[vid]
      const tried: Tried = { [n]: gridlock ? 'gridlock' : t.verdict }
      // About how many the failing checks need — the first count tried going up.
      const estimate = fleetNeeds(n, { perHr: t.perHr, demand: t.target, util: t.utilization, target: targetU,
        fails: { orders: t.grades.orders === 'bad', utilization: t.grades.utilization === 'bad' } })[0]?.n ?? n + 1
      // Below n, a count that could not reach the target utilization with the same work cannot pass.
      const cannotPass = (k: number) => k < n && !mayPassUtilization(t.utilization, n, k, targetU)
      let runs = 0
      const step = () => {
        if (tok !== token.current) return
        const at = nextRightSize(n, tried, estimate, cannotPass)
        if ('done' in at || runs >= RIGHT_SIZE_MAX_RUNS) {
          setSizes(m => ({ ...m, [vid]: { tried: { ...tried }, at: 'done' in at ? at : 'stopped' } }))
          if (passes(tried[n])) markSmallest(vid, 'done' in at && at.done === n)
          return one(i + 1)
        }
        runs++
        setSizes(m => ({ ...m, [vid]: { tried: { ...tried }, at } }))
        const S = createSim(inputs.layout, inputs.flows, simVehicles, { ...simConfig(assume.seed), fleet: { ...fleetBy, [vid]: at.next } })
        if (!S) { tried[at.next] = 'short'; return step() }   // that many cannot even be placed
        runInSlices(S, runSec, () => {
          const r = results(S)
          tried[at.next] = r.gridlock ? 'gridlock' : r.types.find(x => x.vehicleId === vid)?.verdict ?? 'short'
          step()
        }, () => tok === token.current)
      }
      step()
    }
    one(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R])
  /** Does one fewer pass, per type, as pricing and the verdict read it: yes when the smallest passing count
   *  is under the fleet ('checking' while the search runs; 'unknown' when it stopped at its run limit). */
  const lower = useMemo(() => Object.fromEntries(Object.entries(sizes).map(([vid, z]) => {
    const n = fleetBy[vid] ?? 0
    const v: OneFewer = z.at === 'stopped' ? 'unknown' : 'next' in z.at ? 'checking' : z.at.done != null && z.at.done < n ? 'meets' : 'short'
    return [vid, v]
  })), [sizes, fleetBy])

  // ---- variability: 10 seeds, ranges and "met in k/10" ----
  const [vari, setVari] = useState<{ k: number; out: SimResults[] } | null>(null)
  useEffect(() => setVari(null), [inputs, simConfig])
  const runVariability = () => {
    const tok = token.current, out: SimResults[] = []
    const next = (k: number) => {
      if (k >= VARIABILITY_RUNS || tok !== token.current) return
      const S = createSim(inputs.layout, inputs.flows, simVehicles, simConfig(assume.seed + k))
      if (!S) return
      runInSlices(S, runSec, () => { out.push(results(S)); setVari({ k: k + 1, out: [...out] }); next(k + 1) }, () => tok === token.current)
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

  // The deciding row: the static calc from Step 3 beside what this run measured (all types placed).
  const headline = useMemo(() => runHeadline(fleet, fleetBy, R?.res ?? null, inputs.flows, assume.demandPct, { unrunnable, targetUtilization: targetU, oneFewer: lower }), [fleet, fleetBy, R, inputs.flows, assume.demandPct, unrunnable, targetU, lower])

  const verdictWhy = R?.res.gridlock
    ? `Stopped at ${clock(R.res.gridlock.t)} · ${R.res.gridlock.where} · ${R.res.gridlock.vehicle}${R.res.gridlock.blockedBy ? ` waits on ${R.res.gridlock.blockedBy}` : ''}`
    : headline.notRun ? (R?.res.excluded.map(x => x.why).filter((w, i, a) => a.indexOf(w) === i).join(' · ') || 'Nothing the run can place or drive — check Validation in Edit layout')
    : !R ? 'Running a full week…' : null

  const S = live.current
  const followed = S && follow >= 0 ? S.veh[follow] : null

  // Sim (owner, 2026-11-16): the fleet being tested — each type's photo and stepper, coloured green /
  // yellow / red with one word — and the actions on that count. Everything else is Data.
  const typeIds = Object.keys(fleetBy).filter(vid => vehicleById.has(vid))
  const fleetPane = (
    <div className={`sim-kpi sim-kpi-fleet is-${headline.verdictTone}`}>
      <div className="sim-kpi-head">
        <span className="sim-kpi-lbl">Fleet</span>
        {/* Right-sized needs no word of its own (owner, 2026-11-22): the line under the type says "✓ 6 is the
            right size". Undersized, Oversized, Gridlock and the run's progress keep theirs. */}
        {headline.outcome !== 'right' && <span className="sim-kpi-val">{verdictWord(headline)}</span>}
        {Object.keys(simSettings.fleet ?? {}).some(vid => vid in fleetBy) && <button type="button" className="link-btn" onClick={() => onResetFleet(typeIds)}>Reset to engine</button>}
      </div>
      {typeIds.map(vid => {
        const v = vehicleById.get(vid)
        const n = fleetBy[vid] ?? 0
        const res = R?.res.types.find(x => x.vehicleId === vid) ?? null
        return (
          <div key={vid} className="sim-kpi-veh">
            <button type="button" className="sim-vveh" title="Speeds, size and charging used in the run" onClick={() => onAssumptions(vid)}>
              {v?.display.heroImage && <img src={v.display.heroImage} alt="" />}
              <span className="nm">{v?.name ?? vid}</span>
            </button>
            <div className="sim-stepper" role="group" aria-label={`${v?.name ?? 'Vehicle'} fleet`}>
              <button type="button" aria-label="Fewer vehicles" onClick={() => setFleet(vid, n - 1)}>−</button>
              <span className="num">{n}</span>
              <button type="button" aria-label="More vehicles" onClick={() => setFleet(vid, n + 1)}>+</button>
            </div>
            {typeIds.length > 1 && res && !R?.res.gridlock && <span className={`sim-chip sm ${res.verdict}`} title={`${res.perHr.toFixed(1)} / ${res.target.toFixed(0)} moves/h · ${Math.round(res.utilization * 100)}% busy`}>{VERDICT_LABEL[res.verdict]}</span>}
            <RightSizeLine z={sizes[vid]} n={n} onTry={k => setFleet(vid, k)} />
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
    </div>
  )

  // Data: the verdict and why, the checks' tiles, the run's conditions, variability, charts and tables.
  // Data full screen (owner, 2026-11-17): the data fills the screen, the map steps aside; the button or
  // Esc brings it back. Where the browser refuses full screen, it still fills the page.
  const [dataFull, setDataFull] = useState(false)
  const [dataTab, setDataTab] = useState<DataTab>('overview')
  const self = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setDataFull(false) }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleDataFull = () => {
    if (dataFull) { setDataFull(false); if (document.fullscreenElement) void document.exitFullscreen(); return }
    setDataFull(true)
    void self.current?.closest<HTMLElement>('.sim-shell')?.requestFullscreen?.().catch(() => {})
  }
  // Data's hero summary (owner, 2026-11-17): the checks, then each figure, stacked; Simulate lists the checks.
  const summary = (
    <div className="sim-kpis" role="group" aria-label="Static calc and simulation">
      <HeadlineTiles h={headline} unitSystem={unitSystem} sizingTarget={settings.targetUtilization}
        onTarget={u => patchSimSettings(project.id, { targetUtilization: Math.abs(u - settings.targetUtilization) < 1e-9 ? undefined : u })}
        coverage={{ daysPerWeek, shiftsPerDay: shifts, shiftH, step1 }} onCoverage={setCoverage} />
    </div>
  )
  const dataPane = (
    <>
      {/* Data as a dashboard (owner, 2026-11-26): the verdict and the run on one line, the tabs, then the cards. */}
      <header className="sim-dash-head">
        <div className="sim-dash-title">
          <h2>{headline.outcome === 'right' ? 'Right-sized' : verdictWord(headline)}<span className="num"> · {Object.entries(fleetBy).map(([vid, n]) => `${n} ${vehicleById.get(vid)?.name ?? vid}`).join(' · ')}</span></h2>
          <p className="sim-dash-sub">{verdictLine(headline, verdictWhy)}</p>
        </div>
        <div className="sim-dash-actions">
          <button type="button" className="btn btn-sm ghost" onClick={() => steps.onChange('simulate')}>‹ Back to the map</button>
          <button type="button" className="btn btn-sm ghost" aria-pressed={dataFull} onClick={toggleDataFull} title={dataFull ? 'Back to the map (Esc)' : 'Fill the screen with the data'}>
            <Icon name={dataFull ? 'collapse' : 'expand'} size={13} /> {dataFull ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </header>
      <nav className="sim-dash-tabs" role="tablist" aria-label="Data">
        {DATA_TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={dataTab === t.id} className={dataTab === t.id ? 'on' : ''} onClick={() => setDataTab(t.id)}>{t.label}</button>)}
      </nav>
      {dataTab === 'overview' && summary}
      {dataTab === 'overview' && <div className="sim-vsub">
        {differs && <span className="sim-as-note">Simulated vehicles differ from Sizing — the price uses Sizing&rsquo;s</span>}
        {!differs && ownConditions && <span className="sim-as-note">Target or shifts set for the simulation only — the price uses Sizing&rsquo;s</span>}
        <span>{forSizing ? 'Engine sized' : 'Engine would size'} <b className="num">{engineFleetTotal(fleet)}</b></span>
        <span>A week · {daysPerWeek} day{daysPerWeek === 1 ? '' : 's'} × {shifts} × {shiftH} h shift{shifts === 1 ? '' : 's'} · seed {assume.seed} · {assume.arrivals} arrivals · pace {assume.pacePct}%{assume.trafficPct ? ` · traffic ${assume.trafficPct}%` : ''}</span>
        <button type="button" className="sim-chip sm sim-assume-chip" onClick={openAll}>Assumptions{changed ? ` · ${changed} changed` : ''}</button>
        {vari && vari.k < VARIABILITY_RUNS && <span className="sim-busy">Variability {vari.k}/{VARIABILITY_RUNS}…</span>}
        {vari && vari.k >= VARIABILITY_RUNS && <VariabilityChip out={vari.out} arrivals={assume.arrivals} />}
        {!vari && <button type="button" className="btn btn-sm ghost" onClick={runVariability}>Check variability</button>}
      </div>}
      <RunDetails
        R={R?.res ?? null} S={R?.S ?? null} project={project} vehicleById={vehicleById} unitSystem={unitSystem}
        inputs={inputs} assume={assume} onOpenAssumptions={openAll} tab={dataTab}
        extra={<section className="sim-dash-card"><header><h3>Estimate — Sizing’s static model</h3><span className="meta">The fleet Sizing’s engine sized, before any run</span></header>{estimate}</section>}
      />
    </>
  )

  return (
    <div ref={self} className={`sim-work sim-run is-${view}${dataFull && view === 'data' ? ' is-datafull' : ''}`}>
      {/* The map, always: playing the run. */}
      {/* The one sidebar (owner, 2026-11-26): the steps, the fleet and its checks (or the followed vehicle). */}
      <SimSidebar steps={steps} card={!!(S && followed)}>
        <div className="sim-sim-pane">
          {S && followed ? <VehicleCard S={S} i={follow} unitSystem={unitSystem} onBack={() => setFollow(-1)} /> : <>
            {fleetPane}
            {/* The three checks, one line each — the detail and their settings one tap down (owner, 2026-11-22). */}
            <RunChecks h={headline} why={verdictWhy} sizingTarget={settings.targetUtilization}
              onTarget={u => patchSimSettings(project.id, { targetUtilization: Math.abs(u - settings.targetUtilization) < 1e-9 ? undefined : u })}
              coverage={{ daysPerWeek, shiftsPerDay: shifts, shiftH, step1 }} onCoverage={setCoverage} />
            {/* The run's assumptions, where the run is set up (owner, 2026-11-22). */}
            <button type="button" className="sim-row-link" onClick={openAll}>
              <span>Assumptions</span>
              <span className={changed ? 'is-changed' : undefined}>{changed ? `${changed} changed` : 'Defaults'}</span>
            </button>
          </>}
        </div>
      </SimSidebar>
      <div className="sim-canvas-wrap" hidden={view === 'data'}>
        <LayoutCanvas
          layout={inputs.layout}
          laneWidths={inputs.laneWidths}
          loads={project.loads ?? NO_LOADS}
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
            <button type="button" className="btn ghost btn-sm" onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Play'}</button>
            <div className="seg-toggle">
              {[1, 10, 100].map(x => <button key={x} type="button" className={`seg-btn${speed === x ? ' on' : ''}`} onClick={() => { setSpeed(x); setRunning(true) }}>×{x}</button>)}
            </div>
            <button type="button" className="btn btn-sm ghost" disabled={busyFF} onClick={() => S && fastForward(S.t + shiftH * 3600)}>Run shift</button>
            <button type="button" className="btn btn-sm ghost" disabled={busyFF} onClick={() => S && fastForward((Math.floor(S.t / 86400 + 1e-9) + 1) * 86400)}>Run 24 h</button>
            <button type="button" className="btn btn-sm ghost" disabled={busyFF} onClick={() => S && fastForward(S.t + 7 * 86400)}>Run week</button>
            <button type="button" className="btn btn-sm ghost" onClick={restart}>Restart</button>
            <span className="sim-clock num">{S ? clock(S.t) : '—'}</span>
            {S?.gridlock && <span className="sim-chip gridlock">Gridlock — see the red ring</span>}
            <span className="grow" />
            <span className="sim-states">{STATES.map(([k, l]) => <span key={k}><i className={`st-${k}`} />{l}</span>)}</span>
          </div>
        </LayoutCanvas>
      </div>
      {/* Data (owner, 2026-11-26): the tables and charts take the map's place, full width; the map is one step back. */}
      {view === 'data' && (
        <div className="sim-data-main">{dataPane}</div>
      )}
      {/* The side panel: Simulate's fleet, or Results' data. */}
    </div>
  )
}

/** "Met in k/10" — the ranges one click away. */
function VariabilityChip({ out, arrivals }: { out: SimResults[]; arrivals: SimSettings['arrivals'] }) {
  const [open, setOpen] = useState(false)
  const rng = (f: (r: SimResults) => number) => [Math.min(...out.map(f)), Math.max(...out.map(f))]
  const met = out.filter(r => passes(r.verdict)).length
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

/** The run is judged under simulation-only conditions (target or shift coverage overridden): it then
 *  speaks only for the simulation, never for Sizing or the price. */
const ownConditionsOf = (ss: { targetUtilization?: number; shiftH?: number; shiftsPerDay?: number; daysPerWeek?: number }) =>
  ss.targetUtilization != null || ss.shiftH != null || ss.shiftsPerDay != null || ss.daysPerWeek != null
const pctOf = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)

/** One Dashboard-style tile: the figure, its label, the static calc (or the goal) under it, and a
 *  coloured bar on top against its goal. */
function Kpi({ value, label, sub, tone }: { value: string; label: string; sub?: string; tone: Tone }) {
  return (
    <div className={`sim-kpi is-${tone}`}>
      <span className="sim-kpi-val num">{value}</span>
      <span className="sim-kpi-lbl">{label}</span>
      {sub && <span className="sim-kpi-sub">{sub}</span>}
    </div>
  )
}

/** A check's band in words (its scale's colour). */
const GRADE_WORD: Record<Grade, string> = { spare: 'Spare capacity — the fleet may be oversized', good: 'Comfortable', tight: 'Passes, with no spare capacity', bad: 'Fails' }
/** The battery line's goal when something other than the morning drop set its grade. */
const BATTERY_CAUSE: Record<BatteryCause, string> = { floor: 'floor reached', wait: 'charger waits', near: 'near the floor', sag: 'by morning' }
const OUTCOME_WORD: Record<Outcome, string> = { right: 'Right-sized', over: 'Oversized', under: 'Undersized', gridlock: 'Gridlock', notRun: 'Not run' }
/** One word (owner, 2026-11-22): Right-sized, Undersized or Oversized; an amber check shows in its own colour only. */
const verdictWord = (h: Headline) => (h.outcome ? OUTCOME_WORD[h.outcome] : 'Simulating…')

/** Data's checks tile: how many of the three pass, each stacked, and what sets the fleet; `why` is the
 *  line when there is no verdict to explain (stopped, not run, running). */
/** Data's head line under the verdict: why when there is no verdict (stopped, not run, running), else how many
 *  checks pass and what follows — the check that sets the fleet, one fewer passing, or the static count. */
function verdictLine(h: Headline, why: string | null): string {
  if (why) return why
  const judged = h.outcome && h.outcome !== 'notRun' && h.outcome !== 'gridlock'
  if (!judged) return verdictWord(h)
  const pass = [h.perHr.pass, h.utilization.pass, h.battery.pass].filter(Boolean).length
  const n = h.fleet.tested
  const then = h.setsFleet ? ` · ${h.setsFleet.check === 'orders' ? 'orders' : h.setsFleet.check === 'utilization' ? 'utilization' : 'battery'} sets the fleet → about ${h.setsFleet.n}`
    : h.outcome === 'over' ? ` · ${n - 1} also passes all three`
    : n !== h.fleet.static ? ` · static calc ${h.fleet.static}` : ''
  return `${pass} of 3 checks pass${then}`
}

type CoverageValues = { shiftH: number; shiftsPerDay: number; daysPerWeek: number }
type Coverage = CoverageValues & { step1: CoverageValues }

/** The checks' tiles (1 Orders, 2 Utilization, 3 Battery) and the fleet's average speed. */
function HeadlineTiles({ h, unitSystem, sizingTarget, onTarget, coverage, onCoverage }: {
  h: Headline; unitSystem: UnitSystem; sizingTarget: number; onTarget: (u: number) => void
  coverage: Coverage; onCoverage: (k: 'shiftH' | 'shiftsPerDay' | 'daysPerWeek', v: number) => void
}) {
  const u = h.utilization, done = h.perHr.simulated, b = h.battery
  const over = u.simulated != null && u.simulated > 1
  const mornings = b.dayStarts.length > 2 ? ` · mornings ${Math.round(Math.min(...b.dayStarts.slice(1)))}%+` : ''
  const speed = h.speedFps == null ? '—' : unitSystem === 'metric' ? `${units.distance.toMetric(h.speedFps).toFixed(2)} m/s` : `${h.speedFps.toFixed(1)} ft/s`
  return (
    <>
      <Kpi value={done == null ? '—' : done.toFixed(1)} label="1 · Orders per hour" sub={`of ${h.perHr.target.toFixed(0)} needed`} tone={h.perHr.tone} />
      {/* Too few vehicles: the utilization the work needs, over 100% — and by how much. */}
      <div className={`sim-kpi is-${u.tone}`}>
        <KebabMenu label="Target utilization"><TargetPicker target={u.target} sizingTarget={sizingTarget} onTarget={onTarget} /></KebabMenu>
        <span className="sim-kpi-val num">{pctOf(u.simulated)}</span>
        {/* Red says by how much: over the target (pts), or over capacity (the work needs more than the fleet has). */}
        <span className="sim-kpi-lbl">2 · Utilization{over ? ` · over capacity by ${Math.round((u.simulated! - 1) * 100)}%`
          : u.pass === false ? ` · over target by ${Math.round((u.simulated! - u.target) * 100)} pts` : ''}</span>
        <span className="sim-kpi-sub">target {pctOf(u.target)} · static {pctOf(u.static)}</span>
        {u.fewerAt != null && <span className="sim-kpi-sub sim-kpi-hint">Low — {h.fleet.tested - 1} would run at about {pctOf(u.fewerAt)}</span>}
      </div>
      <div className={`sim-kpi is-${b.tone}`}>
        <KebabMenu label="Shift coverage"><CoverageControls coverage={coverage} onCoverage={onCoverage} /></KebabMenu>
        <span className="sim-kpi-val num">{pctN(b.lowest.run)}</span>
        <span className="sim-kpi-lbl">3 · Battery · lowest</span>
        <LowestList b={b}>
          <li className={b.grade === 'bad' ? 'bad' : b.grade === 'tight' ? 'warn' : b.grade ? 'good' : ''}>{b.grade == null ? (h.outcome ? 'Judged over a week' : '') : b.grade === 'bad' ? `✗ ${b.why ?? 'Does not keep up'}` : b.grade === 'tight' ? `! ${b.why ?? 'Keeps up, with no spare'}` : `✓ Keeps up${mornings}`}</li>
        </LowestList>
      </div>
      <Kpi value={speed} label="Average speed" sub="across the fleet, while moving" tone="" />
    </>
  )
}

/** Simulate's checks (owner, 2026-11-22): one line each — the mark, the figure, its goal — opening (one at a
 *  time) to the detail and the check's own setting: the target for utilization, shift coverage for battery. */
function RunChecks({ h, why, sizingTarget, onTarget, coverage, onCoverage }: {
  h: Headline; why: string | null; sizingTarget: number; onTarget: (u: number) => void
  coverage: Coverage; onCoverage: (k: 'shiftH' | 'shiftsPerDay' | 'daysPerWeek', v: number) => void
}) {
  const u = h.utilization, b = h.battery, done = h.perHr.simulated
  const over = u.simulated != null && u.simulated > 1
  const rows: { label: string; value: string; goal: string; tone: Tone; grade: Grade | null; at: number | null; scale: ReturnType<typeof checkScale>; body: ReactNode }[] = [
    // Each line's figure is what its scale measures (owner, 2026-11-22: green left, red right on all three).
    { label: 'Orders', value: h.perHr.shortPct == null ? '—' : `${h.perHr.shortPct.toFixed(1)}% short`, goal: h.perHr.moves ? `${h.perHr.moves.delivered.toLocaleString()} / ${h.perHr.moves.demanded.toLocaleString()}` : `of ${h.perHr.target.toFixed(0)} / h`,
      tone: h.perHr.tone, grade: h.perHr.grade, at: h.perHr.shortPct, scale: checkScale('orders'),
      body: <p className="sim-kpi-sub">Simulated deliveries against the stations' demand over the run{h.perHr.moves ? ` — ${h.perHr.moves.delivered.toLocaleString()} of ${h.perHr.moves.demanded.toLocaleString()}` : ''}.{done == null ? '' : ` ${done.toFixed(1)} each hour against ${h.perHr.target.toFixed(0)} needed.`}</p> },
    { label: 'Utilization', value: pctOf(u.simulated), goal: `≤ ${pctOf(u.target)}`, tone: u.tone,
      grade: u.grade, at: u.simulated, scale: checkScale('utilization', u.target),
      body: <>
        <p className="sim-kpi-sub">{over ? `Over capacity by ${Math.round((u.simulated! - 1) * 100)}% — the work needs more than the fleet has.`
          : u.pass === false ? `Over target by ${Math.round((u.simulated! - u.target) * 100)} pts.` : 'Busy share of the shift, not counting charging.'} Static calc {pctOf(u.static)}.</p>
        {u.fewerAt != null && <p className="sim-kpi-sub sim-kpi-hint">Low — {h.fleet.tested - 1} would run at about {pctOf(u.fewerAt)}</p>}
        <TargetPicker target={u.target} sizingTarget={sizingTarget} onTarget={onTarget} />
      </> },
    { label: 'Battery drop', value: b.sagPts == null ? '—' : `${Math.round(b.sagPts)}%`, goal: b.grade == null ? 'over a week' : b.cause && b.cause !== 'sag' ? BATTERY_CAUSE[b.cause] : 'by morning',
      tone: b.tone, grade: b.grade, at: b.cause && b.cause !== 'sag' ? null : b.sagPts, scale: checkScale('battery'),
      body: <>
        <p className="sim-kpi-sub">How far the fleet's charge fell from this week's first morning to the next{b.sagPts == null ? ' — judged once the run covers a week with off-shift time' : ''}. Lowest charge:</p>
        <LowestList b={b}>{b.why && <li className={b.grade === 'bad' ? 'bad' : 'warn'}>{b.why}</li>}</LowestList>
        <CoverageControls coverage={coverage} onCoverage={onCoverage} />
      </> },
  ]
  return (
    <div className="sim-runchecks" role="group" aria-label="The three checks">
      {why && <p className="sim-why">{why}</p>}
      {rows.map((r, i) => (
        <details key={r.label} name="sim-run-check" className={`sim-crow${r.tone ? ` is-${r.tone}` : ''}`} title={r.grade ? GRADE_WORD[r.grade] : undefined}>
          <summary>
            <i aria-hidden>{r.grade == null ? '–' : r.grade === 'bad' ? '✗' : r.grade === 'tight' ? '!' : '✓'}</i>
            <span className="lbl">{i + 1} · {r.label}</span>
            <b className="num">{r.value}</b><small>{r.goal}</small>
            {/* The check's scale (owner, 2026-11-22): its bands, green to red, and where this run landed. */}
            <span className="sim-scale" aria-hidden>
              {r.scale.bands.map(bd => <i key={bd.grade} className={`g-${bd.grade}`} style={{ left: `${bd.from * 100}%`, width: `${(bd.to - bd.from) * 100}%` }} />)}
              {r.at != null && r.grade && <em style={{ left: `${r.scale.pos(r.at) * 100}%` }} />}
            </span>
          </summary>
          <div className="sim-crow-body">{r.body}</div>
        </details>
      ))}
    </div>
  )
}

const pctN = (x: number | null) => (x == null ? '—' : `${Math.round(x)}%`)

/** The utilization target for the simulation (Data's tile menu and Simulate's check). */
function TargetPicker({ target, sizingTarget, onTarget }: { target: number; sizingTarget: number; onTarget: (u: number) => void }) {
  const t = Math.round(target * 100), sizing = Math.round(sizingTarget * 100)
  const options = [...new Set([60, 65, 70, 75, 80, 85, 90, 95, t, sizing])].sort((x, y) => x - y)
  return (
    <>
      <p className="sim-kebab-h">Target utilization</p>
      <div className="sim-kebab-opts" role="radiogroup" aria-label="Target utilization">
        {options.map(p => (
          <button key={p} type="button" role="radio" aria-checked={t === p} className={t === p ? 'on' : ''} onClick={() => onTarget(p / 100)}>
            {p}%{p === sizing ? ' · Sizing' : ''}
          </button>
        ))}
      </div>
      <p className="sim-kebab-note">Simulation only — Sizing keeps {sizing}%. Typical: 80–85% for opportunity-charged fleets.</p>
    </>
  )
}

/** Shift coverage for the simulation: days a week, shifts a day, shift length. */
function CoverageControls({ coverage, onCoverage }: { coverage: Coverage; onCoverage: (k: 'shiftH' | 'shiftsPerDay' | 'daysPerWeek', v: number) => void }) {
  return (
    <>
      <p className="sim-kebab-h">Shift coverage</p>
      <CoverageRow label="Days a week" value={coverage.daysPerWeek} options={[5, 6, 7]} base={coverage.step1.daysPerWeek} onPick={v => onCoverage('daysPerWeek', v)} />
      <CoverageRow label="Shifts a day" value={coverage.shiftsPerDay} options={[1, 2, 3]} base={coverage.step1.shiftsPerDay} onPick={v => onCoverage('shiftsPerDay', v)} />
      <ShiftLength value={coverage.shiftH} onCoverage={onCoverage} />
      <p className="sim-kebab-note">Simulation only — Step 1: {coverage.step1.daysPerWeek} days × {coverage.step1.shiftsPerDay} × {coverage.step1.shiftH} h. Off-shift and days off, vehicles charge.</p>
    </>
  )
}

/** The lowest charge in the first shift, day and week, then a closing line. */
function LowestList({ b, children }: { b: Headline['battery']; children?: ReactNode }) {
  return (
    <ul className="sim-kpi-list">
      <li><span>Shift</span><b className="num">{pctN(b.lowest.shift)}</b></li>
      <li><span>Day</span><b className="num">{pctN(b.lowest.day)}</b></li>
      <li><span>Week</span><b className="num">{pctN(b.lowest.run)}</b></li>
      {children}
    </ul>
  )
}

/** Shift length, h — committed on blur or Enter (each change reruns the week). */
function ShiftLength({ value, onCoverage }: { value: number; onCoverage: (k: 'shiftH', v: number) => void }) {
  return (
    <label className="sim-kebab-row"><span>Shift length</span>
      <span className="sim-input-unit"><input key={value} type="number" min={1} max={24} step={0.5} defaultValue={value}
        onBlur={e => { const v = Number(e.target.value); if (v >= 0.5 && v <= 24 && v !== value) onCoverage('shiftH', v) }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /><span>h</span></span>
    </label>
  )
}

function CoverageRow({ label, value, options, base, onPick }: { label: string; value: number; options: number[]; base: number; onPick: (v: number) => void }) {
  return (
    <div className="sim-kebab-row"><span>{label}</span>
      <div className="seg-toggle sim-seg-toggle" role="radiogroup" aria-label={label}>
        {[...new Set([...options, value])].sort((x, y) => x - y).map(o => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={`seg-btn${o === value ? ' on' : ''}`} onClick={() => onPick(o)} title={o === base ? 'Step 1' : undefined}>{o}</button>
        ))}
      </div>
    </div>
  )
}
