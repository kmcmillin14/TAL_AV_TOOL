'use client'

// Simulate page frame (spec v2 §3; CB18 proof-of-concept layout): an optional page opened from Sizing,
// not a numbered step. Head: Layout | Run, Load sample, Clear layout, Back to Sizing. Layout mode is
// the editor; Run mode plays the simulation. Run is offered only when validation has no red item
// (acceptance 1).

import { engineFleetByType } from '@/src/calc/fleet'
import { engineFleetFor } from '@/src/lib/fleetModel'
import { payloadsByVehicle, simFlows, simVehicleTypes, type SimVehicleType } from '@/src/calc/sim/simVehicles'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { emptyLayout, unlinked } from '@/src/calc/sim/layoutEdit'
import { checkStatus, readinessChecks } from '@/src/calc/sim/readiness'
import { withVehicleOverrides } from '@/src/calc/sim/vehicle'
import { clearanceRule, runFleet, runInputs } from '@/src/calc/sim/runInputs'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import sample from '@/src/content/samples/simulate-sample.json'
import { getProject, patchSimSettings, updateProject, type StoredProject } from '@/src/lib/storage'
import { useByValue } from '@/src/lib/useByValue'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutEditor, { type PanelTab } from './layout/LayoutEditor'
import { statusLabel } from './layout/SimCards'
import RunView from './run/RunView'
import VehicleBar from './vehicles/VehicleBar'
import AssumptionsDrawer from './inspector/AssumptionsDrawer'
import { overriddenFields } from '@/src/lib/simFields'

const SAMPLE_PREFIX = 'sample-'
const NO_LOADS: NonNullable<StoredProject['loads']> = []
const isSample = (id: string) => id.startsWith(SAMPLE_PREFIX)

interface Props {
  project: StoredProject
  vehicles: Vehicle[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
}

export default function SimulateShell({ project, vehicles, vehicleById, settings, fleet, unitSystem }: Props) {
  const narrow = useIsNarrow()
  const [mode, setMode] = useState<'layout' | 'run'>('layout')
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
    () => runInputs(layoutV ?? emptyLayout(), flowsV, simVehicleById, clearanceRule(clearance), payloads),
    [layoutV, flowsV, simVehicleById, clearance, payloads],
  )
  /** The fleet the run places, per type with a linked flow — one map for the chips, validation and Run. */
  const placed = useByValue(useMemo(() => runFleet(staticN, stepperV, inputs.flows.map(f => f.vehicleId)), [staticN, stepperV, inputs.flows]))
  const fleetNeeded = useMemo(() => Object.values(placed).reduce((a, b) => a + b, 0), [placed])
  const checks = useMemo(
    () => readinessChecks({ layout: layoutV, flows: flowsV, vehicles: simVehicles, driven: layoutV && inputs.layout, fleetNeeded }),
    [layoutV, flowsV, simVehicles, inputs, fleetNeeded],
  )
  const status = useMemo(() => checkStatus(checks), [checks])
  /** The editor's side-panel tab — owned here so the Validation button can open it. */
  const [tab, setTab] = useState<PanelTab>('layout')
  const canRun = status.blockers === 0
  // Run mode is shown only while the run can happen; a new red item drops back to the layout.
  const running = mode === 'run' && canRun
  const empty = !simLayout?.points.length && !simLayout?.highways?.length
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
  const overrideInputs = useByValue({ ss: project.simSettings && { ...project.simSettings, lastRun: undefined, appliedFleet: undefined, fleet: undefined }, layout: project.simLayout, h: project.hoursPerShift })
  const changed = useMemo(() => overriddenFields({ simSettings: overrideInputs.ss, simLayout: overrideInputs.layout, hoursPerShift: overrideInputs.h }, runTypes), [overrideInputs, runTypes])
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const overriddenIds = useMemo(() => new Set(changed.filter(o => o.def.scope === 'point' || o.def.scope === 'route').map(o => o.ownerId)), [changed])
  const openAssumptions = useCallback((focus: string | null = null) => setDrawer({ focus }), [])
  // The open editor's layout writer (its undo history); without it (Run mode) the drawer writes storage.
  const layoutWriter = useRef<((update: (L: NonNullable<StoredProject['simLayout']>) => NonNullable<StoredProject['simLayout']>) => void) | null>(null)
  const registerLayoutWriter = useCallback((w: typeof layoutWriter.current) => { layoutWriter.current = w }, [])
  const writeLayout = useCallback((update: (L: NonNullable<StoredProject['simLayout']>) => NonNullable<StoredProject['simLayout']>) => {
    if (layoutWriter.current) layoutWriter.current(update)
    else { const cur = getProject(project.id)?.simLayout; if (cur) updateProject(project.id, { simLayout: update(cur) }) }
  }, [project.id])

  // Full screen: the whole Simulate page (head, vehicles, editor or run, drawers) fills the screen;
  // Esc (or the button) leaves it.
  const shellRef = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(!!shellRef.current && document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void shellRef.current?.requestFullscreen?.().catch(() => {})
  }

  const loadSample = () => updateProject(project.id, { simLayout: sample.layout as StoredProject['simLayout'], flows: sample.flows as typeof flows })
  /** Clear the layout; flows stay in Sizing, unlinked (their last measured distance kept). Sample flows go. */
  const clearLayout = () => {
    if (!window.confirm('Clear the layout? Flows stay in Sizing with their current distances. The header’s Undo brings it back.')) return
    updateProject(project.id, {
      simLayout: emptyLayout(),
      flows: flows.filter(f => !isSample(f.id)).map(unlinked),
    })
    setMode('layout')
  }

  // In Layout mode the banner sits at the top of the side panel; in Run mode (and on a phone) above the page.
  const banner = sampleOn && (
    <div className="sim-banner">
      <span><b>Sample layout</b> — the CB18 proof-of-concept site.</span>
      <button type="button" className="link-btn" onClick={clearLayout}>Clear and draw your own</button>
    </div>
  )

  return (
    <div className="sim-shell" ref={shellRef}>
      <div className="engine-head with-actions sim-head">
        <div className="eh-text">
          <span className="eh-eyebrow mono">
            Step 03 · Sizing <Link href={`/projects/${project.id}/step3`} className="sim-back"><Icon name="arrowL" size={11} /> Back to Sizing</Link>
          </span>
          <h1 className="eh-title">Simulate</h1>
        </div>
        <div className="eh-actions">
          {running
            ? <button type="button" className="btn ghost" onClick={() => setMode('layout')}><Icon name="arrowL" size={13} /> Edit layout</button>
            : <>
                {/* Validation, live: one status, a click opens the list in the side panel. */}
                <button type="button" id="sim-valid" className="btn ghost sim-valid-btn"
                  disabled={narrow} onClick={() => setTab('checks')} title={checks[0]?.level === 'bad' ? checks[0].text : 'Open the validation list'}>
                  <i className={`sim-vdot is-${status.tone}`} aria-hidden />{statusLabel(status)}
                  {status.warnings > 0 && <span className="sim-valid-sub">{status.warnings} warning{status.warnings === 1 ? '' : 's'}</span>}
                </button>
                {/* The first blocker in words: read with Run by screen readers, shown on a narrow screen. */}
                {!canRun && <span id="sim-run-why" className={narrow ? 'sim-run-why' : 'sim-sr'}>{checks[0].text}</span>}
                <button type="button" className="btn primary" disabled={!canRun} aria-describedby={canRun ? undefined : 'sim-run-why'} onClick={() => setMode('run')}>Run <Icon name="arrowR" size={13} /></button>
              </>}
          {!narrow && (
            <button type="button" className="btn ghost sim-full-btn" aria-pressed={full} onClick={toggleFull}
              aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (Esc)' : 'Full screen'}>
              <Icon name={full ? 'collapse' : 'expand'} size={15} />
            </button>
          )}
          <button type="button" className={`btn ghost sim-assume-btn${drawer ? ' on' : ''}`} aria-pressed={!!drawer} onClick={() => setDrawer(d => (d ? null : { focus: null }))}>
            Assumptions{changed.length > 0 && <span className="sim-count"><i className="sim-odot" />{changed.length} override{changed.length === 1 ? '' : 's'}</span>}
          </button>
          {(canSample || !empty) && (
            <details className="sim-more-menu" onClick={e => { if ((e.target as HTMLElement).closest('[role=menuitem]')) e.currentTarget.open = false }}>
              <summary className="btn ghost" aria-label="More actions">⋯</summary>
              <div className="sim-menu" role="menu">
                {canSample && <button type="button" role="menuitem" onClick={loadSample}>Load sample</button>}
                {!empty && <button type="button" role="menuitem" className="danger" onClick={clearLayout}>Clear layout…</button>}
              </div>
            </details>
          )}
        </div>
      </div>

      {!narrow && (
        <VehicleBar types={types} vehicleById={vehicleById} vehicles={vehicles} app={app} sizingIds={sizingIds} loads={loads} staticN={staticN}
          placed={placed} stepped={stepped} unitSystem={unitSystem} onTypes={setTypes} onFleet={setFleet} />
      )}
      {(running || narrow) && banner}

      {narrow ? (
        <section className="sim-canvas" aria-label="Simulation layout">
          <div className="empty-state"><h3>Open on a desktop to edit the layout</h3></div>
        </section>
      ) : running ? (
        <RunView onAssumptions={openAssumptions} changed={changed.length} project={project} vehicles={vehicles} simVehicles={simVehicles} vehicleById={simVehicleById} settings={settings} fleet={simFleet} unitSystem={unitSystem} inputs={inputs} payloads={payloads} differs={sim.changed} onFleet={setFleet} onResetFleet={resetFleet} engineFleet={staticN} fleetBy={placed} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} simVehicleById={simVehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          overridden={overriddenIds}
          registerLayoutWriter={registerLayoutWriter}
          tab={tab} onTab={setTab} status={status} banner={banner} runAs={runAs} payloads={payloads}
          vehicleTypes={typeVehicles} onFlowVehicle={setFlowVehicle}
          emptyPrompt={!empty ? undefined : canSample ? (
            <div className="sim-empty-cta" onPointerDown={e => e.stopPropagation()}>
              <p>Draw routes along the aisles — or start from a finished site.</p>
              <button type="button" className="btn primary" onClick={loadSample}>Open the example site</button>
              <span>The CB18 proof-of-concept site: 4 flows, chargers and parking, ready to Run.</span>
            </div>
          ) : 'Draw routes along the aisles.'}
        />
      )}
      {drawer && <AssumptionsDrawer key={drawer.focus ?? 'all'} project={project} vehicles={runTypes} changed={changed} writeLayout={writeLayout} unitSystem={unitSystem} focus={drawer.focus} onClose={closeDrawer} />}
    </div>
  )
}
