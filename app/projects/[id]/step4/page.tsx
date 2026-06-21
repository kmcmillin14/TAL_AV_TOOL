'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { useFleetData } from '@/src/lib/useFleetData'
import { updateProject } from '@/src/lib/storage'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import { romSummary, type RomCostInputs, type RomSchedule } from '@/src/calc/rom'
import { effDailyOpHr, defaultOperatingDaysPerYear, type AnalyticsSchedule } from '@/src/calc/romAnalytics'
import RomKpis from '@/src/components/rom/RomKpis'
import { type RomPatch } from '@/src/components/rom/RomEconomics'
import RomExportBar from '@/src/components/rom/RomExportBar'
import RomVisuals, { ROM_SECTIONS } from '@/src/components/rom/RomVisuals'
import ScrollSpyNav from '@/src/components/ScrollSpyNav'

export default function RomDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, loading, error, flows, derivedByFlowId, fleet, settings } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  const costs: RomCostInputs = useMemo(() => ({
    // `||` not `??`: projects created while numberOfOperators had a schema
    // .default(0) carry a PINNED 0 override; a zero override is meaningless
    // (payback is null either way), so 0 falls through to the derived value.
    numberOfOperators: project?.numberOfOperators || ((project?.operatorsPerShift ?? 0) * (project?.shiftsPerDay ?? 1)),
    fullyBurdenedRateUsdPerYear: project?.fullyBurdenedRateUsdPerYear ?? 65000,
    energyCostUsdPerKwh: project?.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project?.annualMaintenancePctOfCapex ?? 0.08,
    operatingDaysPerYear: project?.operatingDaysPerYear
      ?? defaultOperatingDaysPerYear(project?.operatingDaysPattern, project?.operatingDaysCustom),
  }), [project])

  const schedule: RomSchedule = useMemo(() => ({
    dailyOpHr: settings.dailyOpHr,
  }), [settings.dailyOpHr])

  const rom = useMemo(() => romSummary(fleet, vehicleById, costs, schedule), [fleet, vehicleById, costs, schedule])

  const analyticsSchedule: AnalyticsSchedule = useMemo(() => ({
    shiftsPerDay: project?.shiftsPerDay ?? 1,
    hoursPerShift: project?.hoursPerShift ?? 8,
    breaksPerShift: project?.breaksPerShift ?? 0,
    breakDurationMin: project?.breakDurationMin ?? 0,
    operatorsPerShift: project?.operatorsPerShift ?? 0,
    operatingDaysPerYear: project?.operatingDaysPerYear
      ?? defaultOperatingDaysPerYear(project?.operatingDaysPattern, project?.operatingDaysCustom),
  }), [project])

  const names = useMemo(
    () => Object.fromEntries([...vehicleById].map(([vid, v]) => [vid, v.name])),
    [vehicleById],
  )

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
          <span className="eh-eyebrow mono">Step 04 / 04</span>
          <h1 className="eh-title">ROM Dashboard</h1>
          <p className="eh-sub">
            Rough-order fleet economics — total fleet, CAPEX range, operating cost, and a
            simple payback. Pricing is always a range; adjust the assumptions below to refine it.
          </p>
        </div>

        <div className="form-with-nav engine-layout">
          <ScrollSpyNav
            ariaLabel="ROM dashboard sections"
            listLabel="ROM Proposal"
            sections={ROM_SECTIONS}
            topSlot={
              <div className="section-nav-progress">
                <div className="section-nav-progress-pct">
                  {rom.payback.paybackYears == null ? '—' : rom.payback.paybackYears.toFixed(1)}
                </div>
                <div className="section-nav-progress-stat">
                  {rom.payback.paybackYears == null ? 'payback — add operators' : 'year payback'}
                </div>
              </div>
            }
          />
          <div className="form-stack">
            <div className="engine-result-sticky rom-kpis-sticky">
              <RomKpis fleet={fleet} rom={rom} flows={flows} settings={settings} names={names} />
            </div>
            <RomVisuals
              project={project}
              flows={flows}
              derivedByFlowId={derivedByFlowId}
              fleet={fleet}
              rom={rom}
              vehicleById={vehicleById}
              costs={costs}
              onPatch={patchCosts}
              effDailyOpHr={effDailyOpHr(analyticsSchedule)}
              serviceLifeYears={project.serviceLifeYears ?? 7}
            />
          </div>
        </div>

        <section className="rom-card rom-card-export">
          <span className="rom-card-eyebrow">Proposal</span>
          <RomExportBar project={project} />
        </section>
      </div>
    </div>
  )
}
