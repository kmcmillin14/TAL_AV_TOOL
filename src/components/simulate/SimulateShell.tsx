'use client'

// Simulation (step 04, fleet size verification; spec v2 §3). Head: validation status, Assumptions,
// Examples, ⋯ (Clear layout). One stage strip leads through it (owner, 2026-11-18/19): Overview (the static
// model), Setup · Layout · Connect · Chargers (the editor and its side panel), Simulate · Results (the run
// on the map, and its data). The run's stages open only when validation has no red item (acceptance 1).
// A phone gets Overview only.

import { engineFleetByType, suggestedChargers } from '@/src/calc/fleet'
import { engineFleetFor } from '@/src/lib/fleetModel'
import { payloadsByVehicle, simFlows, simVehicleTypes, type SimVehicleType } from '@/src/calc/sim/simVehicles'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { emptyLayout, hasLayout, unlinked } from '@/src/calc/sim/layoutEdit'
import { highwayConnections } from '@/src/calc/sim/highways'
import { checkStatus, readinessChecks } from '@/src/calc/sim/readiness'
import { withVehicleOverrides } from '@/src/calc/sim/vehicle'
import { clearanceRule, runFleet, runInputs } from '@/src/calc/sim/runInputs'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import sample from '@/src/content/samples/simulate-sample.json'
import rackSmall from '@/src/content/samples/simulate-racks-small.json'
import rackMedium from '@/src/content/samples/simulate-racks-medium.json'
import rackLarge from '@/src/content/samples/simulate-racks-large.json'
import { createProject, getProject, patchSimSettings, updateProject, type StoredProject } from '@/src/lib/storage'
import { useRouter } from 'next/navigation'
import { useByValue } from '@/src/lib/useByValue'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import type { Stage, StageInfo, StepsProps } from './ui/Guide'
import Link from 'next/link'
import { payloadsKey } from './layout/SetupCard'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutEditor from './layout/LayoutEditor'
import { chargerProgress, placeProgress } from './layout/SimCards'
import RunView from './run/RunView'
import VehicleBar from './vehicles/VehicleBar'
import AssumptionsDrawer from './inspector/AssumptionsDrawer'
import { overriddenFields } from '@/src/lib/simFields'

const SAMPLE_PREFIX = 'sample-'
const NO_LOADS: NonNullable<StoredProject['loads']> = []
const isSample = (id: string) => id.startsWith(SAMPLE_PREFIX)
/** The example sites (owner, 2026-11-17: small, medium and large fleets, with racking; the proof of
 *  concept kept). Their flow ids carry the key (`sample-small-…`); the proof of concept's do not. */
const SAMPLES = [
  { key: 'small', label: 'Small', note: '2 CB18 · 4 racks', data: rackSmall },
  { key: 'medium', label: 'Medium', note: '6 CB18 · 8 racks', data: rackMedium },
  { key: 'large', label: 'Large', note: '12 CB18 · 16 racks', data: rackLarge },
  { key: 'poc', label: 'Proof of concept', note: 'CB18 site, no racks', data: sample },
] as const
const sampleOf = (flowId: string) => SAMPLES.find(s => s.key !== 'poc' && flowId.startsWith(`${SAMPLE_PREFIX}${s.key}-`)) ?? SAMPLES[3]

interface Props {
  project: StoredProject
  vehicles: Vehicle[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
  /** Sizing's static estimate (how the fleet operates): under Results beside the run, and a phone's view. */
  estimate: ReactNode
  /** Results' status line: the fleet state (Estimated, Verified, Suggested N, …). */
  resultLabel: string
}

/** The run's steps — open only while the layout can run; otherwise Flows, where its validation list is. */
const RUN_STAGES: ReadonlySet<Stage> = new Set<Stage>(['simulate', 'data'])
/** Where a blocker is fixed: Flows holds the validation list. */
const FIX_STAGE: Stage = 'flows'

export default function SimulateShell({ project, vehicles, vehicleById, settings, fleet, unitSystem, estimate, resultLabel }: Props) {
  const narrow = useIsNarrow()
  /** The stage strip's stage; until one is picked, Overview while nothing is drawn, else Layout. */
  const [picked, setStage] = useState<Stage | null>(null)
  const { simLayout, flows = [] } = project
  // What a run drives, built once for validation and the run itself. Kept stable by value: saving
  // a run's result rewrites simSettings, and that must not rebuild the inputs and restart the run.
  // The run's vehicles carry the project's overrides (Milestone 6); Sizing never sees them.
  const overrides = useByValue(project.simSettings?.overrides)
  const simVehicles = useMemo(() => withVehicleOverrides(vehicles, overrides ?? {}), [vehicles, overrides])
  const simVehicleById = useMemo(() => new Map(simVehicles.map(v => [v.id, v])), [simVehicles])
  const layoutV = useByValue(simLayout), sizingFlows = useByValue(flows)
  // Simulation vehicles (simulation only): the types it runs, each with a payload, and each flow's
  // vehicle — prefilled from Sizing. Sizing's flows are never changed (Sizing → Simulation → Price only).
  const ss = project.simSettings
  const app = useByValue(useMemo(() => appRequirementsFromProject(project), [project]))
  const sizingIds = useByValue(useMemo(() => fleet.groups.map(g => g.vehicleId), [fleet]))   // Sizing's vehicles
  const loads = useByValue(project.loads ?? NO_LOADS)
  const types = useByValue(useMemo(() => simVehicleTypes(ss?.vehicles, sizingFlows, loads, ss?.vehicleAs), [ss?.vehicles, sizingFlows, loads, ss?.vehicleAs]))
  const flowVehicle = useByValue(ss?.flowVehicle)
  /** The run's flows from any flows (the editor's live ones too) — one rule. */
  const runAs = useCallback(<F extends { id: string; vehicleId?: string }>(fs: F[]) => simFlows(fs, types, flowVehicle), [types, flowVehicle])
  const sim = useMemo(() => runAs(sizingFlows), [runAs, sizingFlows])
  const flowsV = sim.flows
  // The Fleet Engine's figure for the flows as simulated (Sizing's own when they run as in Sizing).
  const settingsV = useByValue(settings)
  const simFleet = useMemo(() => (sim.changed ? engineFleetFor(flowsV, vehicleById, settingsV) : fleet), [sim.changed, fleet, flowsV, vehicleById, settingsV])
  const payloads = useMemo(() => payloadsByVehicle(types, loads), [types, loads])
  /** Store the types (from then on they no longer follow Sizing); an earlier switch is folded in. */
  const setTypes = useCallback((next: SimVehicleType[]) => patchSimSettings(project.id, { vehicles: next, vehicleAs: undefined }), [project.id])
  /** A flow's simulation vehicle; its Sizing vehicle again clears the choice. */
  const setFlowVehicle = useCallback((flowId: string, vehicleId: string) => {
    const next = { ...(flowVehicle ?? {}) }
    if (sizingFlows.find(f => f.id === flowId)?.vehicleId === vehicleId) delete next[flowId]
    else next[flowId] = vehicleId
    patchSimSettings(project.id, { flowVehicle: next })
  }, [flowVehicle, sizingFlows, project.id])
  const clearance = useByValue(project.simSettings?.clearance)
  // The chips: each type's static calc (the Fleet Engine for the flows as simulated) and the count the
  // run places (its stepper, else the engine).
  const staticN = useByValue(useMemo(() => engineFleetByType(simFleet), [simFleet]))
  const stepperV = useByValue(ss?.fleet)
  const stepped = useMemo(() => new Set(Object.keys(stepperV ?? {})), [stepperV])
  const typeVehicles = useMemo(() => types.flatMap(t => vehicleById.get(t.vehicleId) ?? []), [types, vehicleById])
  /** The one writer of the simulated count: a value equal to the static calc (or none) clears it. */
  const setFleet = useCallback((vid: string, n: number | undefined) => {
    const next = { ...(stepperV ?? {}) }
    if (n == null || n === staticN[vid]) delete next[vid]
    else next[vid] = Math.max(1, Math.min(500, n))
    patchSimSettings(project.id, { fleet: next })
  }, [stepperV, staticN, project.id])
  /** Back to the static calc for these types. */
  const resetFleet = useCallback((ids: string[]) => patchSimSettings(project.id, { fleet: Object.fromEntries(Object.entries(stepperV ?? {}).filter(([vid]) => !ids.includes(vid))) }), [stepperV, project.id])
  const inputs = useMemo(
    () => runInputs(layoutV ?? emptyLayout(), flowsV, simVehicleById, clearanceRule(clearance), payloads, loads),
    [layoutV, flowsV, simVehicleById, clearance, payloads, loads],
  )
  /** The fleet the run places, per type with a linked flow — one map for the chips, validation and Run. */
  const placed = useByValue(useMemo(() => runFleet(staticN, stepperV, inputs.flows.map(f => f.vehicleId)), [staticN, stepperV, inputs.flows]))
  const fleetNeeded = useMemo(() => Object.values(placed).reduce((a, b) => a + b, 0), [placed])
  const checks = useMemo(
    () => readinessChecks({ layout: layoutV, flows: flowsV, vehicles: simVehicles, driven: layoutV && inputs.layout, fleetNeeded }),
    [layoutV, flowsV, simVehicles, inputs, fleetNeeded],
  )
  const status = useMemo(() => checkStatus(checks), [checks])
  const canRun = status.blockers === 0
  const empty = !hasLayout(simLayout)
  // The guide's steps and their progress (owner, 2026-11-22): green done, amber started, grey not yet; all
  // green before Simulate is ready to simulate.
  const blocked = canRun ? undefined : `${checks[0]?.text ?? 'Fix the layout first'} — opens Flows`
  const linkedN = inputs.flows.length, flowN = flowsV.length
  const chargersWanted = useMemo(() => suggestedChargers(simFleet), [simFleet])
  const homes = chargerProgress(simLayout ?? emptyLayout(), chargersWanted, fleetNeeded)
  const confirmed = !!loads.length && ss?.payloadsConfirmed === payloadsKey(loads)
  const placing = useMemo(() => placeProgress(simLayout ?? emptyLayout(), flows), [simLayout, flows])
  const loose = useMemo(() => (simLayout?.highways?.length ? highwayConnections(simLayout).loose.length : 0), [simLayout])
  // Paths as drawn: highways (their routes are derived), or routes for a layout drawn the older way.
  const paths = simLayout?.highways?.length || simLayout?.segments.length || 0
  // Pallet sizes first (the order the owner reads them), then the vehicle types that carry them.
  const vehicleSubs = [
    // No loads in Step 1: nothing to confirm — the run uses each vehicle's own payload, so it is optional.
    { label: 'Pallet sizes', done: confirmed, optional: !loads.length,
      status: loads.length ? `${loads.length} ${confirmed ? 'confirmed' : 'to confirm'}` : 'Vehicle defaults' },
    { label: 'Vehicle types', done: types.length > 0,
      status: types.length ? types.map(t => `${vehicleById.get(t.vehicleId)?.name ?? t.vehicleId} · ${placed[t.vehicleId] ?? staticN[t.vehicleId] ?? 0}`).join(', ') : 'None yet' },
  ]
  const required = vehicleSubs.filter(t => !t.optional)
  const stationsDone = placing.names.length > 0 && placing.unplaced.length === 0
  // Chargers and parking are points too (owner, 2026-11-26): one step places all of them.
  const pointSubs = [
    { label: 'From Sizing', done: stationsDone,
      status: placing.names.length ? `${placing.names.length - placing.unplaced.length} of ${placing.names.length} placed` : 'No Sizing stations' },
    { label: 'Chargers & parking', done: homes.done, status: homes.status },
  ]
  const routeBlocked = checks.some(c => c.level === 'bad' && c.fix === 'route')
  const flowBlocked = checks.some(c => c.level === 'bad' && c.fix !== 'charger')
  const before: StageInfo[] = [
    { id: 'vehicles', label: 'Pallets & vehicles', icon: 'rack', done: required.every(t => t.done), started: vehicleSubs.some(t => t.done),
      status: required.every(t => t.done) ? 'Ready' : `${required.filter(t => !t.done).length} to do`, subs: vehicleSubs,
      lead: 'Confirm the pallet sizes from Step 1 and the vehicle types that carry them.' },
    { id: 'routes', label: 'Routes', icon: 'lanes', done: paths > 0 && loose === 0 && !routeBlocked, started: paths > 0,
      status: !paths ? 'None drawn' : loose ? `${loose} loose end${loose === 1 ? '' : 's'}` : routeBlocked ? 'Not all reached' : `${paths} connected`,
      lead: 'Draw the aisles with Route and join their ends. Trace them over the site drawing if you have one (Drawing, on the map).' },
    { id: 'points', label: 'Points', icon: 'pick', done: stationsDone && homes.done, started: pointSubs.some(t => t.done) || placing.names.length > placing.unplaced.length,
      status: stationsDone && homes.done ? 'Ready' : `${pointSubs.filter(t => !t.done).length} to do`, subs: pointSubs,
      lead: 'Drag Sizing’s stations from the tray onto the map, then chargers and parking. A point near a route joins it — before or after the route is drawn.' },
    { id: 'flows', label: 'Flows', icon: 'swap', done: flowN > 0 && linkedN === flowN && !flowBlocked, started: linkedN > 0,
      status: flowN ? `${linkedN} of ${flowN} linked` : 'No material flows',
      lead: 'Every material flow linked to its pick and drop points, and nothing in the list below. Its moves per hour come from Sizing.' },
  ]
  const allGreen = before.every(s => s.done)
  const stages: StageInfo[] = [
    ...before,
    { id: 'simulate', label: 'Simulate', icon: 'clock', blocked, done: undefined,
      status: !canRun ? 'Not ready' : allGreen ? 'Ready' : 'Can run',
      lead: allGreen ? 'Everything is green: run it. It plays on the map; speed it up, or run a shift, a day or a week.' : 'It can run, but some steps above are not green yet. Their results may be off.' },
    { id: 'data', label: 'Data', icon: 'formula', blocked, status: resultLabel,
      lead: 'Orders, utilization and battery over the run, and the fleet that passes all three.' },
  ]
  // The guide opens on the first step that is not done; Simulate and Data only while the run can happen.
  // A new red item drops back to Flows and stays there (no jump back into the run once it is fixed).
  const wanted = picked ?? (before.find(s => !s.done)?.id ?? 'simulate')
  if (!canRun && RUN_STAGES.has(wanted)) setStage(FIX_STAGE)
  const stage: Stage = !canRun && RUN_STAGES.has(wanted) ? FIX_STAGE : wanted
  const sampleOn = flows.some(f => isSample(f.id))
  // The sample brings its own flows, so it is offered only where it cannot change a real quote.
  const canSample = empty && flows.length === 0
  // Assumptions drawer (Milestone 6): the run's vehicle types, and what is overridden.
  const [drawer, setDrawer] = useState<{ focus: string | null } | null>(null)
  const runTypes = useMemo(() => {
    const ids = new Set(inputs.flows.map(f => f.vehicleId))
    return vehicles.filter(v => ids.has(v.id))
  }, [inputs.flows, vehicles])
  // Only what overrides depend on — a run result saved into simSettings must not rescan the layout.
  const overrideInputs = useByValue({ ss: project.simSettings && { ...project.simSettings, lastRun: undefined, appliedFleet: undefined, fleet: undefined }, layout: project.simLayout, h: project.hoursPerShift, n: project.shiftsPerDay, dp: project.operatingDaysPattern, dc: project.operatingDaysCustom })
  const changed = useMemo(() => overriddenFields({ simSettings: overrideInputs.ss, simLayout: overrideInputs.layout, hoursPerShift: overrideInputs.h, shiftsPerDay: overrideInputs.n, operatingDaysPattern: overrideInputs.dp, operatingDaysCustom: overrideInputs.dc }, runTypes), [overrideInputs, runTypes])
  // The simulation's own utilization target is an override too (set on the Utilization tile).
  const overrideCount = changed.length + (project.simSettings?.targetUtilization != null ? 1 : 0)
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const overriddenIds = useMemo(() => new Set(changed.filter(o => o.def.scope === 'point' || o.def.scope === 'route').map(o => o.ownerId)), [changed])
  const openAssumptions = useCallback((focus: string | null = null) => setDrawer({ focus }), [])
  // The open editor's layout writer (its undo history); without it (Sim, Data) the drawer writes storage.
  const layoutWriter = useRef<((update: (L: NonNullable<StoredProject['simLayout']>) => NonNullable<StoredProject['simLayout']>) => void) | null>(null)
  const registerLayoutWriter = useCallback((w: typeof layoutWriter.current) => { layoutWriter.current = w }, [])
  const writeLayout = useCallback((update: (L: NonNullable<StoredProject['simLayout']>) => NonNullable<StoredProject['simLayout']>) => {
    if (layoutWriter.current) layoutWriter.current(update)
    else { const cur = getProject(project.id)?.simLayout; if (cur) updateProject(project.id, { simLayout: update(cur) }) }
  }, [project.id])

  const loadSample = (s: (typeof SAMPLES)[number]) => updateProject(project.id, { simLayout: s.data.layout as StoredProject['simLayout'], flows: s.data.flows as typeof flows })
  const router = useRouter()
  /** An example, at any time (owner, 2026-11-17): here on an empty project; otherwise in a new project of
   *  its own, so this project's layout, flows and quote are never touched. */
  const openSample = (s: (typeof SAMPLES)[number]) => {
    if (canSample) { loadSample(s); return }
    const made = createProject({ projectName: `Example — ${s.label === 'Proof of concept' ? 'proof-of-concept' : s.label.toLowerCase()} site`, simLayout: s.data.layout, flows: s.data.flows } as never)
    router.push(`/projects/${made.id}/step4`)
  }
  /** Clear the layout; flows stay in Sizing, unlinked (their last measured distance kept). Sample flows go. */
  const clearLayout = () => {
    if (!window.confirm('Clear the layout? Material flows stay in Sizing with their current distances. The header’s Undo brings it back.')) return
    updateProject(project.id, {
      simLayout: emptyLayout(),
      flows: flows.filter(f => !isSample(f.id)).map(unlinked),
    })
    setStage('vehicles')
  }

  const steps: StepsProps = { stages, value: stage, onChange: setStage, onBlocked: () => setStage(FIX_STAGE), then: { label: 'Pricing', href: `/projects/${project.id}/step5` } }
  // The Vehicles step: the run's types (each with a payload) and counts — Sizing's, until changed here.
  const vehiclesStep = (
    <VehicleBar types={types} vehicleById={vehicleById} vehicles={vehicles} app={app} sizingIds={sizingIds} loads={loads} staticN={staticN}
      placed={placed} stepped={stepped} unitSystem={unitSystem} onTypes={setTypes} onFleet={setFleet} />
  )

  // The sample note sits in the page head, beside the title (owner, 2026-11-26: the sidebar keeps its room).
  const shownSample = sampleOn ? sampleOf(flows.find(f => isSample(f.id))!.id) : null
  const banner = shownSample && (
    <div className="sim-banner sim-head-note">
      <span><b>Sample layout</b> — {shownSample.key === 'poc' ? 'the CB18 proof-of-concept site' : `${shownSample.label.toLowerCase()} site with racking (${shownSample.note})`}.</span>
      <button type="button" className="link-btn" onClick={clearLayout}>Clear and draw your own</button>
    </div>
  )

  return (
    <div className="sim-shell">
      <div className="engine-head with-actions sim-head">
        <div className="eh-text">
          <span className="eh-eyebrow mono">Step 04 / 06</span>
          <h1 className="eh-title">Fleet size verification</h1>
          {!narrow && banner}
        </div>
        <div className="eh-actions">
          {/* ⋯: the examples at all times, and Clear layout. Validation lives in Flows (its blockers turn the
              step amber), Assumptions in Simulate, examples also in Routes › Drawing (owner, 2026-11-22/26). */}
          <details className="sim-more-menu" onClick={e => { if ((e.target as HTMLElement).closest('[role=menuitem]')) e.currentTarget.open = false }}>
            <summary className="btn ghost" aria-label="More actions">⋯</summary>
            <div className="sim-menu" role="menu">
              <p className="sim-menu-note">Open an example{canSample ? '' : ' — in a new project; this one stays as it is'}</p>
              {SAMPLES.map(s => <button key={s.key} type="button" role="menuitem" onClick={() => openSample(s)}>{s.label} <small>{s.note}</small></button>)}
              {!empty && <button type="button" role="menuitem" className="danger" onClick={clearLayout}>Clear layout…</button>}
            </div>
          </details>
        </div>
      </div>

      {narrow ? (
        // A phone: Sizing's estimate, and the way on — the layout work needs a desktop.
        <>
          {banner}
          {estimate}
          <p className="rom-empty">Open on a desktop to check the fleet on a layout.</p>
          <Link href={`/projects/${project.id}/step5`} className="btn primary">Next: Pricing</Link>
        </>
      ) : stage === 'simulate' || stage === 'data' ? (
        <RunView view={stage === 'data' ? 'data' : 'sim'} steps={steps} estimate={estimate} onAssumptions={openAssumptions} changed={overrideCount} project={project} vehicles={vehicles} simVehicles={simVehicles} vehicleById={simVehicleById} settings={settings} fleet={simFleet} unitSystem={unitSystem} inputs={inputs} payloads={payloads} differs={sim.changed} onFleet={setFleet} onResetFleet={resetFleet} engineFleet={staticN} fleetBy={placed} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} simVehicleById={simVehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          overridden={overriddenIds}
          registerLayoutWriter={registerLayoutWriter}
          stage={stage} onStage={setStage} steps={steps} vehiclesStep={vehiclesStep} status={status} runAs={runAs} payloads={payloads} suggestedChargers={chargersWanted} vehiclesPlaced={fleetNeeded}
          vehicleTypes={typeVehicles} onFlowVehicle={setFlowVehicle}
          examples={empty ? (
            <p className="sim-examples">or start from an example —{' '}
              {SAMPLES.slice(0, 3).map((s, i) => <span key={s.key}>{i ? ' · ' : ''}<button type="button" className="link-btn" title={s.note} onClick={() => openSample(s)}>{s.label}</button></span>)}
            </p>
          ) : null}
          emptyPrompt={!empty ? undefined : canSample ? (
            <div className="sim-empty-cta" onPointerDown={e => e.stopPropagation()}>
              <p>Draw routes along the aisles — or start from an example site.</p>
              <div className="sim-samples">
                {SAMPLES.slice(0, 3).map(s => (
                  <button key={s.key} type="button" className="sim-sample" onClick={() => loadSample(s)}>
                    <b>{s.label}</b><span>{s.note}</span>
                  </button>
                ))}
              </div>
              <span>With racking, docks, chargers and parking — ready to run. Or the <button type="button" className="link-btn" onClick={() => loadSample(SAMPLES[3])}>proof-of-concept site</button>.</span>
            </div>
          ) : 'Draw routes along the aisles.'}
        />
      )}
      {drawer && <AssumptionsDrawer key={drawer.focus ?? 'all'} project={project} vehicles={runTypes} changed={changed} writeLayout={writeLayout} unitSystem={unitSystem} focus={drawer.focus} onClose={closeDrawer} />}
    </div>
  )
}
