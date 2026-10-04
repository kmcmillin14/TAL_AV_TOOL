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
import { DEFAULT_BUFFER_PCT } from '@/src/calc/types'
import RomKpis from '@/src/components/rom/RomKpis'
import Icon from '@/src/design-system/components/Icon'
import { ScenarioDelta } from '@/src/components/rom/RomDrivers'
import { dashboardClaim } from '@/src/lib/dashboardClaim'
import { useDashboardRail } from '@/src/lib/uiPrefs'
import { pricingGate } from '@/src/lib/romComplexityFromProject'
import RomDrivers from '@/src/components/rom/RomDrivers'
import RomBento from '@/src/components/rom/RomBento'
import RomExportBar from '@/src/components/rom/RomExportBar'

export default function RomDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, loading, error } = useFleetData(id)
  const [railCollapsed, toggleRail] = useDashboardRail()
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
    annualMaintenancePctOfCapex: project?.annualMaintenancePctOfCapex ?? 0.08,
    bufferPct: project?.bufferPct ?? DEFAULT_BUFFER_PCT,
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
  // One gate per render pass, shared by the KPI band and the bento — it was
  // computed inline in JSX (every slider drag) and again inside RomBento.
  const gate = pricingGate(activeProject)
  const claim = dashboardClaim(active)

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
        currentStep={5}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head with-actions">
          <div className="eh-text">
            <span className="eh-eyebrow mono">Step 05 / 05</span>
            <h1 className="eh-title">Dashboard</h1>
          </div>
          <ExportActions projectId={project.id} />
        </div>

        <div className={`rom2-shell${railCollapsed ? ' is-rail-collapsed' : ''}`}>
          {/* Collapsible on phones (summary shows ≤ 700px); always open on
              desktop via CSS (summary hidden, content forced visible). */}
          {/* Collapsed: a thin tab in place of the rail, handing ~284px back to
              the charts. The scenario delta moves to a full-width strip below so
              presentation mode still responds to the drivers behind it. */}
          {railCollapsed ? (
            <button
              type="button" className="rom2-rail-tab" onClick={toggleRail}
              aria-label="Show scenario drivers" title="Show scenario drivers"
            >
              <span className="rom2-rail-tab-chev" aria-hidden><Icon name="chevron" size={14} /></span>
              <span className="rom2-rail-tab-lbl">Drivers</span>
            </button>
          ) : (
          <details className="rom-drivers-collapse" open>
            <summary>Drivers &amp; scenario</summary>
            <RomDrivers
              baseline={baselineDrivers}
              drivers={drivers}
              onChange={setDrivers}
              onApply={applyToBaseline}
              hasOverrides={hasOverrides}
              mode={mode}
              onMode={setMode}
              deltas={deltas}
              pricingBlocked={gate.blocked}
              onCollapse={toggleRail}
            />
          </details>
          )}

          <div className="rom2-main">
            {/* The answer, before the instruments. */}
            {claim.fleet && (
              <p className="rom2-claim">
                <strong>{claim.fleet}.</strong>
                {claim.cost && <span> {claim.cost}.</span>}
                {claim.payback && <span> {claim.payback}.</span>}
              </p>
            )}
            {railCollapsed && showScenario && deltas && (
              <ScenarioDelta deltas={deltas} pricingBlocked={gate.blocked} inline />
            )}
            <div className={`rom2-kpiband ${showScenario ? 'is-scenario' : ''}`}>
              <RomKpis fleet={active.fleet} rom={active.rom} flows={active.flows} settings={active.settings} costs={active.costs} serviceLifeYears={activeProject.serviceLifeYears ?? 10} vehicleById={vehicleById} names={names} deltas={deltas} gate={gate} />
            </div>

            <RomBento
              project={activeProject}
              flows={active.flows}
              derivedByFlowId={active.derivedByFlowId}
              fleet={active.fleet}
              rom={active.rom}
              gate={gate}
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
