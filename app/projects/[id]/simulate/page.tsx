'use client'

// Simulate — an optional page opened from Sizing (spec v2 §3, D-10). Not a numbered step: the
// header keeps Sizing (3) current and the step ribbon is unchanged.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { headerFromProject } from '@/src/lib/projectHeader'
import SimulateShell from '@/src/components/simulate/SimulateShell'
import { getProject, subscribeProjects, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { useUnitSystem } from '@/src/lib/uiPrefs'

export default function SimulatePage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<StoredProject | null | undefined>(undefined)
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [vehicleError, setVehicleError] = useState(false)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  useEffect(() => { fetchVehiclesCached().then(setVehicles, () => setVehicleError(true)) }, [])

  useEffect(() => {
    const refresh = () => setProject(getProject(id))
    refresh()
    // subscribeProjects also covers other tabs: storage.ts merges their writes and notifies.
    const unsub = subscribeProjects(refresh)
    window.addEventListener('focus', refresh)
    return () => { unsub(); window.removeEventListener('focus', refresh) }
  }, [id])

  if (project === undefined || (project && !vehicles && !vehicleError)) {
    return <div className="app-shell"><div className="step2-loading">Loading simulation…</div></div>
  }
  if (project === null || !vehicles) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{project === null
            ? 'This project does not exist in your browser. Try importing the project file or creating a new project.'
            : 'Failed to load vehicle library.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerFromProject(project)}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />
      <div className="workspace">
        <SimulateShell project={project} vehicles={vehicles} />
      </div>
    </div>
  )
}
