'use client'

// Simulate page frame (spec v2 §3; CB18 proof-of-concept layout): an optional page opened from Sizing,
// not a numbered step. Head: Layout | Run, Load sample, Clear layout, Back to Sizing. Layout mode is
// the editor; Run mode plays the simulation. Run is offered only when "Ready to run?" has no red item
// (acceptance 1).

import { engineFleetByType } from '@/src/calc/fleet'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { emptyLayout, unlinked } from '@/src/calc/sim/layoutEdit'
import { readinessChecks } from '@/src/calc/sim/readiness'
import { clearanceRule, payloadFt, runFleet, runInputs } from '@/src/calc/sim/runInputs'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import sample from '@/src/content/samples/simulate-sample.json'
import { updateProject, type StoredProject } from '@/src/lib/storage'
import { useByValue } from '@/src/lib/useByValue'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import LayoutEditor from './layout/LayoutEditor'
import RunView from './run/RunView'

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
  // Checked against what a run will place and drive: the run fleet (linked types, stepper value) on
  // the driven layout (B56.5 applied), so "Ready" never offers a run that cannot place or route.
  // What a run drives, built once for "Ready to run?" and the run itself. Kept stable by value: saving
  // a run's result rewrites simSettings, and that must not rebuild the inputs and restart the run.
  const layoutV = useByValue(simLayout), flowsV = useByValue(flows)
  const clearance = useByValue(project.simSettings?.clearance), loads = useByValue(project.loads)
  const payload = useMemo(() => payloadFt(loads), [loads])
  const inputs = useMemo(
    () => runInputs(layoutV ?? emptyLayout(), flowsV, vehicleById, clearanceRule(clearance), payload?.width ?? 0),
    [layoutV, flowsV, vehicleById, clearance, payload],
  )
  const checks = useMemo(() => {
    const placed = runFleet(engineFleetByType(fleet), project.simSettings?.fleet, inputs.flows.map(f => f.vehicleId))
    return readinessChecks({ layout: simLayout, flows, vehicles, driven: simLayout && inputs.layout, fleetNeeded: Object.values(placed).reduce((a, b) => a + b, 0) })
  }, [simLayout, flows, vehicles, inputs, fleet, project.simSettings?.fleet])
  const blockers = checks.filter(c => c.level === 'bad')
  const canRun = blockers.length === 0
  // Run mode is shown only while the run can happen; a new red item drops back to the layout.
  const running = mode === 'run' && canRun
  const empty = !simLayout?.points.length
  const sampleOn = flows.some(f => isSample(f.id))
  // The sample brings its own flows, so it is offered only where it cannot change a real quote.
  const canSample = empty && flows.length === 0

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
            : <button type="button" className="btn primary" disabled={!canRun} aria-describedby="sim-run-why" onClick={() => setMode('run')}>Run <Icon name="arrowR" size={13} /></button>}
          {!canRun && <span id="sim-run-why" className="sim-run-why">{blockers[0]?.text}</span>}
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

      {sampleOn && (
        <div className="sim-banner">
          <b>Sample layout</b> — the CB18 proof-of-concept site.
          <button type="button" className="link-btn" onClick={clearLayout}>Clear and draw your own</button>
        </div>
      )}

      {narrow ? (
        <section className="sim-canvas" aria-label="Simulation layout">
          <div className="empty-state"><h3>Open on a desktop to edit the layout</h3></div>
        </section>
      ) : running ? (
        <RunView project={project} vehicles={vehicles} vehicleById={vehicleById} settings={settings} fleet={fleet} unitSystem={unitSystem} inputs={inputs} payload={payload} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          emptyPrompt={!empty ? undefined : canSample ? (
            <div className="sim-empty-cta" onPointerDown={e => e.stopPropagation()}>
              <p>Draw routes along the aisles — or start from a finished site.</p>
              <button type="button" className="btn primary" onClick={loadSample}>Open the example site</button>
              <span>The CB18 proof-of-concept site: 4 flows, chargers and parking, ready to Run.</span>
            </div>
          ) : 'Draw routes along the aisles.'}
        />
      )}
    </>
  )
}
