'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import RomFleetSellPrice from '@/src/components/rom/RomFleetSellPrice'

export default function RomConfigurationPage() {
  const params = useParams()
  const id = params.id as string
  const { project, vehicleById, fleet, loading, error } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  if (loading) {
    return <div className="app-shell"><div className="step2-loading">Loading ROM configuration…</div></div>
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

  const headerData = {
    id: project.id,
    projectName: project.projectName ?? '',
    customerName: project.customerName ?? '',
    facilityLocation: project.facilityLocation,
    versionNumber: project.versionNumber,
    bastianRep: project.bastianRep,
    opportunityNumber: project.opportunityNumber,
    opportunityType: project.opportunityType,
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={4}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 04 / 05</span>
          <h1 className="eh-title">ROM Configuration</h1>
          <p className="eh-sub">
            Internal sell-price build-up — Hardware + Integration + Software + Adders — for
            every assigned chassis, with a fleet-wide total. Budgetary estimate, placeholder
            pricing pending real numbers from the business owner.
          </p>
        </div>

        <RomFleetSellPrice project={project} fleet={fleet} vehicleById={vehicleById} />

        <div className="step-nav">
          <Link href={`/projects/${id}/step3`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Fleet Engine
          </Link>
          <div className="row">
            <span className="hint">
              {fleet.groups.length === 0
                ? 'Assign a vehicle in the Fleet Engine to configure ROM pricing'
                : `${fleet.groups.length} vehicle ${fleet.groups.length === 1 ? 'type' : 'types'} configured`}
            </span>
            <Link href={`/projects/${id}/step5`} className="btn primary">
              Continue to Dashboard <Icon name="arrowR" size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
