'use client'

// Simulate page frame (spec v2 §3; CB18 proof-of-concept layout): an optional page opened from Sizing,
// not a numbered step. Head: Layout | Run, Load sample, Clear layout, Back to Sizing. Layout mode is
// the editor; Run mode plays the simulation. Run is offered only when validation has no red item
// (acceptance 1).

import { engineFleetByType } from '@/src/calc/fleet'
import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { emptyLayout, unlinked } from '@/src/calc/sim/layoutEdit'
import { readinessChecks } from '@/src/calc/sim/readiness'
import { withVehicleOverrides } from '@/src/calc/sim/vehicle'
import { clearanceRule, payloadFt, runFleet, runInputs } from '@/src/calc/sim/runInputs'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import sample from '@/src/content/samples/simulate-sample.json'
import { getProject, updateProject, type StoredProject } from '@/src/lib/storage'
import { useByValue } from '@/src/lib/useByValue'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutEditor from './layout/LayoutEditor'
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
  const layoutV = useByValue(simLayout), flowsV = useByValue(flows)
  const clearance = useByValue(project.simSettings?.clearance), loads = useByValue(project.loads)
  const payload = useMemo(() => payloadFt(loads), [loads])
  const inputs = useMemo(
    () => runInputs(layoutV ?? emptyLayout(), flowsV, simVehicleById, clearanceRule(clearance), payload?.width ?? 0),
    [layoutV, flowsV, simVehicleById, clearance, payload],
  )
  const fleetNeeded = useMemo(() => {
    const placed = runFleet(engineFleetByType(fleet), project.simSettings?.fleet, inputs.flows.map(f => f.vehicleId))
    return Object.values(placed).reduce((a, b) => a + b, 0)
  }, [inputs.flows, fleet, project.simSettings?.fleet])
  const checks = useMemo(
    () => readinessChecks({ layout: simLayout, flows, vehicles: simVehicles, driven: simLayout && inputs.layout, fleetNeeded }),
    [simLayout, flows, simVehicles, inputs, fleetNeeded],
  )
  const blockers = checks.filter(c => c.level === 'bad')
  const warnings = checks.filter(c => c.level === 'warn').length
  /** Bumped by the Validation button: the editor opens its Validation tab. */
  const [validateKey, setValidateKey] = useState(0)
  const canRun = blockers.length === 0
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
          {running
            ? <button type="button" className="btn ghost" onClick={() => setMode('layout')}><Icon name="arrowL" size={13} /> Edit layout</button>
            : <>
                {/* Validation, live: one status, a click opens the list in the side panel. */}
                <button type="button" id="sim-valid" className={`btn ghost sim-valid-btn is-${blockers.length ? 'bad' : warnings ? 'warn' : 'good'}`}
                  disabled={narrow} onClick={() => setValidateKey(k => k + 1)} title={blockers[0]?.text ?? 'Open the validation list'}>
                  <i aria-hidden />{blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : 'Valid'}
                  {warnings > 0 && <span className="sim-valid-sub">{warnings} warning{warnings === 1 ? '' : 's'}</span>}
                </button>
                <button type="button" className="btn primary" disabled={!canRun} aria-describedby="sim-valid" onClick={() => setMode('run')}>Run <Icon name="arrowR" size={13} /></button>
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
        <RunView onAssumptions={openAssumptions} changed={changed.length} project={project} vehicles={vehicles} simVehicles={simVehicles} vehicleById={simVehicleById} settings={settings} fleet={fleet} unitSystem={unitSystem} inputs={inputs} payload={payload} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} simVehicleById={simVehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          overridden={overriddenIds}
          registerLayoutWriter={registerLayoutWriter}
          validateKey={validateKey} banner={banner}
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
