'use client'

// Simulate — an optional page opened from Sizing (spec v2 §3, D-10). Not a numbered step: the
// header keeps Sizing (3) current and the step ribbon is unchanged. Project, vehicles and the
// Fleet Engine come from the same hook Sizing uses, so "Engine sized N" is Sizing's figure.

import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import SimulateShell from '@/src/components/simulate/SimulateShell'
import { headerFromProject } from '@/src/lib/projectHeader'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'

export default function SimulatePage() {
  const { id } = useParams<{ id: string }>()
  const data = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const { project, loading, error } = data

  if (loading) return <div className="app-shell"><div className="step2-loading">Loading simulation…</div></div>
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

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerFromProject(project)}
        currentStep={3}
        helpTopic="simulate"
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />
      <div className="workspace">
        <SimulateShell project={project} vehicles={data.vehicles} vehicleById={data.vehicleById} settings={data.settings} fleet={data.fleet} unitSystem={unitSystem} />
      </div>
    </div>
  )
}
