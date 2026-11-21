'use client'

// 04 Simulation — fleet size verification (owner, 2026-11-18; was the un-numbered Simulate page).
// Optional. One stage strip leads through it: Overview (how the Sizing fleet works, from the static model —
// the former Dashboard's operations half), then Setup … Results on the drawn site. Project, vehicles and
// the Fleet Engine come from the same hook Sizing uses, so the figures are Sizing's. The strip's Next is the
// way on (after Results, to Pricing); there is no second bottom bar.

import { useParams } from 'next/navigation'
import { useFleetChecks } from '@/src/components/FleetCheckBadge'
import { RomOperations } from '@/src/components/rom/RomView'
import PersistentHeader from '@/src/components/PersistentHeader'
import ProjectLoadState from '@/src/components/ProjectLoadState'
import { fleetCheckLabel } from '@/src/calc/sim/verification'
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

  if (loading || error || !project) return <ProjectLoadState loading={loading} error={error} what="simulation" />

  return (
    <div className="app-shell">
      <PersistentHeader project={headerFromProject(project)} currentStep={4} unitSystem={unitSystem} onUnitToggle={toggleUnitSystem} />
      <div className="workspace">
        <SimulateShell project={project} vehicles={data.vehicles} vehicleById={data.vehicleById} settings={data.settings} fleet={data.fleet} unitSystem={unitSystem}
          estimate={<RomOperations project={project} vehicleById={data.vehicleById} />} resultLabel={fleetCheckLabel(verify.checks)} />
      </div>
    </div>
  )
}
