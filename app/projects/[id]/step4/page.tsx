'use client'

// 04 Simulation — fleet size verification (owner, 2026-11-18; was the un-numbered Simulate page).
// Optional. It opens on Operations — how the Sizing fleet works, from the static model (the former
// Dashboard's operations half) — and Layout check verifies the count on the drawn site. Project,
// vehicles and the Fleet Engine come from the same hook Sizing uses, so the figures are Sizing's.

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { useParams } from 'next/navigation'
import { FleetCheckBadge, useFleetChecks } from '@/src/components/FleetCheckBadge'
import { RomOperations } from '@/src/components/rom/RomView'
import SimTabs from '@/src/components/simulate/ui/SimTabs'
import PersistentHeader from '@/src/components/PersistentHeader'
import ProjectLoadState from '@/src/components/ProjectLoadState'
import { hasLayout } from '@/src/calc/sim/layoutEdit'
import SimulateShell from '@/src/components/simulate/SimulateShell'
import { headerFromProject } from '@/src/lib/projectHeader'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'

export default function SimulatePage() {
  const { id } = useParams<{ id: string }>()
  const data = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const { project, loading, error } = data
  const verify = useFleetChecks(project, data.vehicleById, data.fleet)
  // Opens on the layout once one is drawn; on Operations before that.
  const [picked, setView] = useState<'ops' | 'layout' | null>(null)

  if (loading || error || !project) return <ProjectLoadState loading={loading} error={error} what="simulation" />

  const view = picked ?? (hasLayout(project.simLayout) ? 'layout' : 'ops')
  const head = (
    <div className="sim-step-head">
      <FleetCheckBadge checks={verify.checks} />
      <SimTabs label="Simulation view" value={view} onChange={setView}
        tabs={[{ id: 'ops', label: 'Operations' }, { id: 'layout', label: 'Layout check' }]} />
    </div>
  )

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerFromProject(project)}
        currentStep={4}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />
      <div className="workspace">
        {view === 'layout' ? (
          <SimulateShell project={project} vehicles={data.vehicles} vehicleById={data.vehicleById} settings={data.settings} fleet={data.fleet} unitSystem={unitSystem} headExtra={head} />
        ) : (
          <>
            <div className="engine-head with-actions sim-head">
              <div className="eh-text">
                <span className="eh-eyebrow mono">Step 04 / 06</span>
                <h1 className="eh-title">Fleet size verification</h1>
              </div>
              {head}
            </div>
            <RomOperations project={project} vehicleById={data.vehicleById} />
          </>
        )}
        {/* Static under the layout workspace, which is sized to the screen: sticky, it would cover the map. */}
        <div className={`step-nav${view === 'layout' ? ' is-static' : ''}`}>
          <Link href={`/projects/${id}/step3`} className="btn ghost"><Icon name="arrowL" size={13} /> Back to Sizing</Link>
          <Link href={`/projects/${id}/step5`} className="btn primary">Continue to Pricing <Icon name="arrowR" size={13} /></Link>
        </div>
      </div>
    </div>
  )
}
