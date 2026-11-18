'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { headerFromProject } from '@/src/lib/projectHeader'
import Icon from '@/src/design-system/components/Icon'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import RomFleetSellPrice from '@/src/components/rom/RomFleetSellPrice'
import RomView from '@/src/components/rom/RomView'
import { updateProject, type StoredProject } from '@/src/lib/storage'

export default function RomConfigurationPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, fleet, loading, error } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  if (loading) {
    return <div className="app-shell"><div className="step2-loading">Loading pricing…</div></div>
  }
  if (error || !project) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{error ?? 'This project does not exist in your browser. Try importing the project file or creating a new project.'}</p>
        </div>
      </div>
    )
  }

  const headerData = headerFromProject(project)

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={5}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 05 / 06</span>
          <h1 className="eh-title">Pricing</h1>
        </div>

        <RomFleetSellPrice project={project} fleet={fleet} vehicleById={vehicleById} />

        {/* The return on that investment — the Dashboard's financials (2026-11-18). */}
        <section className="pricing-return" aria-labelledby="pricing-return-h">
          <h2 id="pricing-return-h" className="pricing-return-h">Return on investment</h2>
          <RomView project={project} vehicleById={vehicleById} view="finance" onPatch={(patch: Partial<StoredProject>) => {
            const next = updateProject(id, patch)
            if (next) setProject(next)
          }} />
        </section>

        <div className="step-nav">
          <Link href={`/projects/${id}/step4`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Simulation
          </Link>
          <div className="row">
            <span className="hint">
              {fleet.groups.length === 0
                ? 'Assign a vehicle in the Fleet Engine to configure ROM pricing'
                : `${fleet.groups.length} vehicle ${fleet.groups.length === 1 ? 'type' : 'types'} configured`}
            </span>
            <Link href={`/projects/${id}/step6`} className="btn primary">
              Continue to Export <Icon name="arrowR" size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
