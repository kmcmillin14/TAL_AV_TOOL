'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import ExportActions from '@/src/components/ExportActions'
import { useFleetData } from '@/src/lib/useFleetData'
import { updateProject } from '@/src/lib/storage'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import { computeFleetModel } from '@/src/lib/fleetModel'
import { applyDrivers, scenarioKpis, diffKpis, type ScenarioDrivers } from '@/src/lib/scenario'
import { effDailyOpHr, defaultOperatingDaysPerYear, type AnalyticsSchedule } from '@/src/calc/romAnalytics'
import RomKpis from '@/src/components/rom/RomKpis'
import RomDrivers from '@/src/components/rom/RomDrivers'
import RomBento from '@/src/components/rom/RomBento'
import RomExportBar from '@/src/components/rom/RomExportBar'

export default function RomDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, loading, error } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  // In-memory what-if state (no new persisted fields). `drivers` holds overrides;
  // `mode` toggles whether the dashboard shows the scenario or the baseline.
  const [drivers, setDrivers] = useState<ScenarioDrivers>({})
  const [mode, setMode] = useState<'baseline' | 'scenario'>('scenario')

  const hasOverrides = Object.values(drivers).some(v => v !== undefined && !Number.isNaN(v))
  const vehicles = useMemo(() => [...vehicleById.values()], [vehicleById])
  const baseModel = useMemo(
    () => (project ? computeFleetModel(project, vehicles) : null),
    [project, vehicles],
  )
  const scnProject = useMemo(
    () => (project ? applyDrivers(project, drivers) : null),
    [project, drivers],
  )
  // Only run the second full fleet computation when there are actual overrides —
  // the baseline path doesn't need it.
  const scnModel = useMemo(
    () => (hasOverrides && scnProject ? computeFleetModel(scnProject, vehicles) : null),
    [hasOverrides, scnProject, vehicles],
  )

  const showScenario = mode === 'scenario' && hasOverrides

  const baselineDrivers: ScenarioDrivers = useMemo(() => ({
    throughputBoostPct: 0,
    operatorsPerShift: project?.operatorsPerShift ?? 0,
    shiftsPerDay: project?.shiftsPerDay ?? 1,
    fullyBurdenedRateUsdPerYear: project?.fullyBurdenedRateUsdPerYear ?? 65000,
    energyCostUsdPerKwh: project?.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project?.annualMaintenancePctOfCapex ?? 0.08,
    bufferPct: project?.bufferPct ?? 0.10,
    serviceLifeYears: project?.serviceLifeYears ?? 10,
  }), [project])

  const deltas = useMemo(
    () => (showScenario && baseModel && scnModel
      ? diffKpis(scenarioKpis(baseModel), scenarioKpis(scnModel))
      : null),
    [showScenario, baseModel, scnModel],
  )

  const applyToBaseline = () => {
    const updated = updateProject(id, drivers)
    if (updated) { setProject(updated); setDrivers({}) }
  }

  if (loading) return <div className="app-shell"><div className="step2-loading">Loading ROM dashboard…</div></div>
  if (error || !project || !baseModel) {
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

  const active = showScenario && scnModel ? scnModel : baseModel
  const activeProject = showScenario && scnProject ? scnProject : project

  const analyticsSchedule: AnalyticsSchedule = {
    shiftsPerDay: activeProject.shiftsPerDay ?? 1,
    hoursPerShift: activeProject.hoursPerShift ?? 8,
    breaksPerShift: activeProject.breaksPerShift ?? 0,
    breakDurationMin: activeProject.breakDurationMin ?? 0,
    operatorsPerShift: activeProject.operatorsPerShift ?? 0,
    operatingDaysPerYear: activeProject.operatingDaysPerYear
      ?? defaultOperatingDaysPerYear(activeProject.operatingDaysPattern, activeProject.operatingDaysCustom),
  }
  const names = Object.fromEntries([...vehicleById].map(([vid, v]) => [vid, v.name]))

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
          opportunityNumber: project.opportunityNumber,
          opportunityType: project.opportunityType,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={4}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head">
          <div className="eh-text">
            <span className="eh-eyebrow mono">Step 04 / 04</span>
            <h1 className="eh-title">ROM Dashboard</h1>
            <p className="eh-sub">
              Rough-order fleet economics. Adjust the drivers on the left to run a what-if
              scenario — every KPI and chart recomputes live; toggle Baseline / Scenario to compare.
            </p>
          </div>
          <ExportActions projectId={project.id} />
        </div>

        <div className="rom2-shell">
          <RomDrivers
            baseline={baselineDrivers}
            drivers={drivers}
            onChange={setDrivers}
            onApply={applyToBaseline}
            hasOverrides={hasOverrides}
            mode={mode}
            onMode={setMode}
          />

          <div className="rom2-main">
            <div className={`rom2-kpiband ${showScenario ? 'is-scenario' : ''}`}>
              <RomKpis fleet={active.fleet} rom={active.rom} flows={active.flows} settings={active.settings} costs={active.costs} serviceLifeYears={activeProject.serviceLifeYears ?? 10} vehicleById={vehicleById} names={names} deltas={deltas} />
            </div>

            <RomBento
              project={activeProject}
              flows={active.flows}
              derivedByFlowId={active.derivedByFlowId}
              fleet={active.fleet}
              rom={active.rom}
              vehicleById={vehicleById}
              effDailyOpHr={effDailyOpHr(analyticsSchedule)}
              serviceLifeYears={activeProject.serviceLifeYears ?? 10}
            />

            <section className="rom-card rom-card-export">
              <span className="rom-card-eyebrow">Export</span>
              <RomExportBar project={project} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
