'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { useFleetData } from '@/src/lib/useFleetData'
import { updateProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import { romSummary, type RomCostInputs, type RomSchedule } from '@/src/calc/rom'
import RomKpis from '@/src/components/rom/RomKpis'
import RomPricingTable from '@/src/components/rom/RomPricingTable'
import RomEconomics, { type RomPatch } from '@/src/components/rom/RomEconomics'
import RomExportBar from '@/src/components/rom/RomExportBar'

export default function RomDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, loading, error, flows, fleet, settings } = useFleetData(id)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  const costs: RomCostInputs = useMemo(() => ({
    laborRateUsdPerHr: project?.laborRateUsdPerHr ?? 28,
    energyCostUsdPerKwh: project?.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project?.annualMaintenancePctOfCapex ?? 0.08,
    operatingDaysPerYear: project?.operatingDaysPerYear ?? 312,
  }), [project])

  const schedule: RomSchedule = useMemo(() => ({
    dailyOpHr: settings.dailyOpHr,
    operatorsPerShift: project?.operatorsPerShift ?? 0,
    shiftsPerDay: project?.shiftsPerDay ?? 1,
    hoursPerShift: project?.hoursPerShift ?? 8,
  }), [settings.dailyOpHr, project])

  const rom = useMemo(() => romSummary(fleet, vehicleById, costs, schedule), [fleet, vehicleById, costs, schedule])

  const flowCount = flows.length
  const totalThruPerHr = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  const patchCosts = (patch: RomPatch) => {
    const updated = updateProject(id, patch)
    if (updated) setProject(updated)
  }

  if (loading) return <div className="app-shell"><div className="step2-loading">Loading ROM dashboard…</div></div>
  if (error || !project) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{error ?? 'This project does not exist in your browser.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={{
          id: project.id,
          projectName: project.projectName ?? '',
          customerName: project.customerName ?? '',
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
          shiftsPerDay: project.shiftsPerDay,
          hoursPerShift: project.hoursPerShift,
          operatingDaysPattern: project.operatingDaysPattern,
        }}
        currentStep={4}
        showKpis
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => (u === 'imperial' ? 'metric' : 'imperial'))}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 04 / 04</span>
          <h1 className="eh-title">ROM Dashboard</h1>
          <p className="eh-sub">
            Rough-order fleet economics — total fleet, CAPEX range, operating cost, and a
            simple payback. Pricing is always a range; adjust the assumptions below to refine it.
          </p>
        </div>

        <RomKpis fleet={fleet} rom={rom} flowCount={flowCount} totalThruPerHr={totalThruPerHr} />

        <div className="rom-grid">
          <section className="rom-card">
            <span className="rom-card-eyebrow">ROM pricing</span>
            <RomPricingTable pricing={rom.pricing} vehicleById={vehicleById} />
          </section>
          <section className="rom-card">
            <span className="rom-card-eyebrow">Operating cost &amp; payback</span>
            <RomEconomics costs={costs} rom={rom} onPatch={patchCosts} />
          </section>
        </div>

        <section className="rom-card rom-card-export">
          <span className="rom-card-eyebrow">Proposal</span>
          <RomExportBar project={project} />
        </section>
      </div>
    </div>
  )
}
