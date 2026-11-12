'use client'

// Simulate page frame (spec v2 §3; CB18 proof-of-concept layout): an optional page opened from Sizing,
// not a numbered step. Head: Layout | Run, Load sample, Clear layout, Back to Sizing. Layout mode is
// the editor; Run mode plays the simulation. Run is offered only when validation has no red item
// (acceptance 1).

import { engineFleetByType } from '@/src/calc/fleet'
import { engineFleetFor } from '@/src/lib/fleetModel'
import { preloadedVehicle, simulateAs, switcherVehicles, type Offered } from '@/src/calc/sim/switcher'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { emptyLayout, unlinked } from '@/src/calc/sim/layoutEdit'
import { checkStatus, readinessChecks } from '@/src/calc/sim/readiness'
import { withVehicleOverrides } from '@/src/calc/sim/vehicle'
import { clearanceRule, payloadFt, runFleet, runInputs } from '@/src/calc/sim/runInputs'
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
import AssumptionsDrawer from './inspector/AssumptionsDrawer'
import { overriddenFields } from '@/src/lib/simFields'

const SAMPLE_PREFIX = 'sample-'
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
  // Vehicle switcher (simulation only): the vehicles offered, the one Sizing implies, and the flows
  // as the run drives them. Sizing's flows are never changed (Sizing → Simulation → Price only).
  const app = useByValue(useMemo(() => appRequirementsFromProject(project), [project]))
  const sizingIds = useByValue(useMemo(() => fleet.groups.map(g => g.vehicleId), [fleet]))   // Sizing's vehicles
  const offered = useMemo(() => switcherVehicles(vehicles, app, sizingIds), [vehicles, app, sizingIds])
  const preloaded = useMemo(() => preloadedVehicle(sizingFlows, offered), [sizingFlows, offered])
  // A stored choice counts only while the switcher still offers it (e.g. not after Step 1 makes it red).
  const stored = project.simSettings?.vehicleAs
  const asId = stored && offered.some(o => o.vehicle.id === stored) ? stored : undefined
  /** Sizing runs more than one vehicle: "as Sizing" is its own entry, and any vehicle — the most used
   *  one included — can be chosen to run the whole site. */
  const mixed = sizingIds.length > 1
  /** The run's flows from any flows (the editor's live ones too) — one switcher rule. */
  const runAs = useCallback(<F extends { vehicleId?: string }>(fs: F[]) => simulateAs(fs, asId, preloaded), [asId, preloaded])
  const sim = useMemo(() => runAs(sizingFlows), [runAs, sizingFlows])
  const flowsV = sim.flows
  /** Set only when the run does not drive Sizing's flows as they are: it then never speaks for Sizing
   *  or the price (no verdict saved, no "Use N in pricing"). */
  const simulatedAs = useMemo(() => (sim.changed
    ? { as: vehicleById.get(asId ?? preloaded ?? '')?.name ?? '', sizing: sizingIds.map(id => vehicleById.get(id)?.name ?? id).join(', ') }
    : undefined), [sim.changed, asId, preloaded, sizingIds, vehicleById])
  // The Fleet Engine's figure for the flows as simulated (Sizing's own when nothing is switched).
  const settingsV = useByValue(settings)
  const simFleet = useMemo(() => (sim.changed ? engineFleetFor(flowsV, vehicleById, settingsV) : fleet), [sim.changed, fleet, flowsV, vehicleById, settingsV])
  /** '' = as Sizing. With one Sizing vehicle, choosing it is the same as Sizing. */
  const switchTo = (id: string) => patchSimSettings(project.id, { vehicleAs: !id || (!mixed && id === preloaded) ? undefined : id })
  const clearance = useByValue(project.simSettings?.clearance), loads = useByValue(project.loads)
  const payload = useMemo(() => payloadFt(loads), [loads])
  const inputs = useMemo(
    () => runInputs(layoutV ?? emptyLayout(), flowsV, simVehicleById, clearanceRule(clearance), payload?.width ?? 0),
    [layoutV, flowsV, simVehicleById, clearance, payload],
  )
  const fleetNeeded = useMemo(() => {
    const placed = runFleet(engineFleetByType(simFleet), project.simSettings?.fleet, inputs.flows.map(f => f.vehicleId))
    return Object.values(placed).reduce((a, b) => a + b, 0)
  }, [inputs.flows, simFleet, project.simSettings?.fleet])
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
  const empty = !simLayout?.points.length
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
    <>
      <div className="engine-head with-actions sim-head">
        <div className="eh-text">
          <span className="eh-eyebrow mono">
            Step 03 · Sizing <Link href={`/projects/${project.id}/step3`} className="sim-back"><Icon name="arrowL" size={11} /> Back to Sizing</Link>
          </span>
          <h1 className="eh-title">Simulate</h1>
        </div>
        <div className="eh-actions">
          {offered.length > 0 && <VehicleSwitcher offered={offered} value={asId ?? (mixed ? '' : preloaded)} mixed={mixed} switched={sim.changed} onChange={switchTo} />}
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

      {(running || narrow) && banner}

      {narrow ? (
        <section className="sim-canvas" aria-label="Simulation layout">
          <div className="empty-state"><h3>Open on a desktop to edit the layout</h3></div>
        </section>
      ) : running ? (
        <RunView onAssumptions={openAssumptions} changed={changed.length} project={project} vehicles={vehicles} simVehicles={simVehicles} vehicleById={simVehicleById} settings={settings} fleet={simFleet} unitSystem={unitSystem} inputs={inputs} payload={payload} simulatedAs={simulatedAs} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} simVehicleById={simVehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          overridden={overriddenIds}
          registerLayoutWriter={registerLayoutWriter}
          tab={tab} onTab={setTab} status={status} banner={banner} runAs={runAs}
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
    </>
  )
}

const OFFERED_NOTE = { SIZING: ' · Sizing', GREEN: '', YELLOW: ' · amber', INCOMPLETE: ' · not checked' } as const
/** ‹ Vehicle › — the vehicle the simulation runs as: step through the offered list, or pick from it. */
function VehicleSwitcher({ offered, value, mixed, switched, onChange }: { offered: Offered[]; value?: string; mixed: boolean; switched: boolean; onChange: (id: string) => void }) {
  // The entries, in order: "As Sizing" first when Sizing mixes vehicles ('' = no switch), then each vehicle.
  const ids = [...(mixed ? [''] : []), ...offered.map(o => o.vehicle.id)]
  const at = Math.max(0, ids.indexOf(value ?? ''))
  const step = (d: number) => onChange(ids[(at + d + ids.length) % ids.length])
  return (
    <div className={`sim-vswitch${switched ? ' is-switched' : ''}`} role="group" aria-label="Simulate as">
      <button type="button" aria-label="Previous vehicle" onClick={() => step(-1)} disabled={ids.length < 2}>‹</button>
      <select value={ids[at]} onChange={e => onChange(e.target.value)} aria-label="Vehicle the simulation runs as" title="Simulation only — Sizing and the price keep their vehicle">
        {mixed && <option value="">As Sizing (mixed)</option>}
        {offered.map(({ vehicle: v, status }) => <option key={v.id} value={v.id}>{v.name}{OFFERED_NOTE[status]}</option>)}
      </select>
      <button type="button" aria-label="Next vehicle" onClick={() => step(1)} disabled={ids.length < 2}>›</button>
    </div>
  )
}

