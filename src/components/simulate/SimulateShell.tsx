'use client'

// Simulate page frame (spec v2 §3; CB18 proof-of-concept layout): an optional page opened from Sizing,
// not a numbered step. Head: Layout | Run, Load sample, Clear layout, Back to Sizing. Layout mode is
// the editor; Run mode plays the simulation. Run is offered only when "Ready to run?" has no red item
// (acceptance 1).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { readinessChecks } from '@/src/calc/sim/readiness'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import sample from '@/src/content/samples/simulate-sample.json'
import { updateProject, type StoredProject } from '@/src/lib/storage'
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
  const checks = useMemo(
    () => readinessChecks({ layout: simLayout, flows, vehicles, fleetNeeded: fleet.totalFleetSold }),
    [simLayout, flows, vehicles, fleet.totalFleetSold],
  )
  const blockers = checks.filter(c => c.level === 'bad')
  const canRun = blockers.length === 0
  const empty = !simLayout?.points.length
  const sampleOn = flows.some(f => isSample(f.id))

  const loadSample = () => updateProject(project.id, { simLayout: sample.layout as StoredProject['simLayout'], flows: [...flows, ...(sample.flows as typeof flows)] })
  /** Clear the layout; flows stay in Sizing, unlinked (their last measured distance kept). Sample flows go. */
  const clearLayout = () => {
    if (!window.confirm('Clear the layout? Flows stay in Sizing with their current distances. The header’s Undo brings it back.')) return
    updateProject(project.id, {
      simLayout: { points: [], segments: [] },
      flows: flows.filter(f => !isSample(f.id)).map(f => ({ ...f, fromPointId: undefined, toPointId: undefined, distanceSource: undefined })),
    })
    setMode('layout')
  }

  return (
    <>
      <div className="engine-head with-actions sim-head">
        <div className="eh-text">
          <span className="eh-eyebrow mono">Step 03 · Sizing</span>
          <h1 className="eh-title">Simulate</h1>
          <span className="sim-subtitle">Checks the Sizing fleet on a drawn layout · vehicle data from the vehicle files</span>
        </div>
        <div className="eh-actions">
          <div className="seg-toggle" role="tablist" aria-label="Mode">
            <button type="button" role="tab" aria-selected={mode === 'layout'} className={`seg-btn${mode === 'layout' ? ' on' : ''}`} onClick={() => setMode('layout')}>Layout</button>
            <button type="button" role="tab" aria-selected={mode === 'run'} className={`seg-btn${mode === 'run' ? ' on' : ''}`} disabled={!canRun}
              title={canRun ? '' : `Finish the layout first: ${blockers.map(b => b.text).join(' ')}`} onClick={() => setMode('run')}>Run</button>
          </div>
          {empty && <button type="button" className="btn ghost" onClick={loadSample}>Load sample</button>}
          {!empty && <button type="button" className="btn ghost" onClick={clearLayout}>Clear layout</button>}
          <Link href={`/projects/${project.id}/step3`} className="btn ghost"><Icon name="arrowL" size={13} /> Back to Sizing</Link>
        </div>
      </div>

      {sampleOn && (
        <div className="sim-banner">
          <b>Sample layout</b> — the CB18 proof-of-concept site, so there is something to run. Its flows are added to Sizing while it is loaded.
          <button type="button" className="link-btn" onClick={clearLayout}>Clear and draw your own</button>
        </div>
      )}

      {narrow ? (
        <section className="sim-canvas" aria-label="Simulation layout">
          <div className="empty-state"><h3>Open on a desktop to edit the layout</h3></div>
        </section>
      ) : mode === 'run' && canRun ? (
        <RunView project={project} vehicles={vehicles} vehicleById={vehicleById} settings={settings} fleet={fleet} unitSystem={unitSystem} />
      ) : (
        <LayoutEditor
          project={project} vehicles={vehicles} vehicleById={vehicleById} settings={settings} fleet={fleet} checks={checks} unitSystem={unitSystem}
          emptyPrompt={empty ? 'Draw routes along the aisles — or Load sample to see a finished site.' : undefined}
        />
      )}
    </>
  )
}
