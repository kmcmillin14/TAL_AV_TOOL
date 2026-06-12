'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { getProject, updateProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { FleetSettings, Flow, FlowDerived } from '@/src/calc/types'
import { flowDerived, groupSummary } from '@/src/calc/flowMetrics'
import { fleetSummary, defaultChargeRegime } from '@/src/calc/fleet'
import type { EnginePatch } from '@/src/components/engine/types'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import EngineNav from '@/src/components/engine/EngineNav'
import EngineSection from '@/src/components/engine/EngineSection'
import FlowsTab from '@/src/components/engine/FlowsTab'
import ChargingPipeline from '@/src/components/engine/ChargingPipeline'
import BufferPipeline from '@/src/components/engine/BufferPipeline'

export default function FleetEnginePage() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  useEffect(() => {
    const proj = getProject(id)
    if (!proj) {
      setError('Project not found.')
      setLoading(false)
      return
    }
    setProject(proj)
    fetchVehiclesCached()
      .then(vehs => { setVehicles(vehs); setLoading(false) })
      .catch(() => { setError('Failed to load vehicle library.'); setLoading(false) })
  }, [id])

  useEffect(() => {
    const refresh = () => { const proj = getProject(id); if (proj) setProject(proj) }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [id])

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])

  const flows: Flow[] = useMemo(() => project?.flows ?? [], [project])
  const flowGroups: string[] = useMemo(() => project?.flowGroups ?? [], [project])
  const flowGroupColors: Record<string, string> = useMemo(() => project?.flowGroupColors ?? {}, [project])

  const derivedByFlowId = useMemo(() => {
    const m = new Map<string, FlowDerived>()
    for (const f of flows) {
      const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
      m.set(f.id, flowDerived(f, veh))
    }
    return m
  }, [flows, vehicleById])

  const groups = useMemo(() => {
    const ids: string[] = []
    for (const f of flows) if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    return ids.map(vid => groupSummary(vid, flows, derivedByFlowId))
  }, [flows, derivedByFlowId])

  const settings: FleetSettings = useMemo(() => {
    const dailyOpHr = Math.min(24, (project?.shiftsPerDay ?? 1) * (project?.hoursPerShift ?? 8))
    return {
      // Unset regime derives from shift coverage (24 h/day → continuous);
      // the toggle below writes the explicit choice, which always wins.
      regime: project?.chargeRegime ?? defaultChargeRegime(dailyOpHr),
      bufferPct: project?.bufferPct ?? 0.10,
      dailyOpHr,
      chargeMethods: project?.chargeMethods ?? {},
    }
  }, [project])

  const fleet = useMemo(
    () => fleetSummary(groups, vehicleById, settings),
    [groups, vehicleById, settings],
  )

  const persistPatch = (patch: EnginePatch) => {
    if (!project) return
    const updated = updateProject(project.id, patch)
    if (updated) setProject(updated)
  }

  if (loading) {
    return <div className="app-shell"><div className="step2-loading">Loading fleet engine…</div></div>
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
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  const groupByVehicle = new Map(fleet.groups.map(g => [g.vehicleId, g]))
  // Hero is sticky; the side nav must stick BELOW it. Publish the hero's
  // measured height as a CSS var the stylesheet consumes.
  const heroRef = useRef<HTMLElement | null>(null)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const hero = heroRef.current
    const layout = layoutRef.current
    if (!hero || !layout) return
    const apply = () => layout.style.setProperty('--engine-hero-h', `${hero.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(hero)
    return () => ro.disconnect()
  }, [loading])
  // Hero KPIs — the inputs that drive the fleet: how many flows, total demand.
  const flowCount = flows.length
  const totalThruPerHr = Math.round(flows.reduce((sum, f) => sum + (f.thruPerHr || 0), 0))

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 03 / 04</span>
          <h1 className="eh-title">Fleet Engine</h1>
          <p className="eh-sub">
            Define material flows, then layer charging and a buffer to reach the total fleet —
            base is engineering, charging is physics, buffer is policy.
          </p>
        </div>

        <section className="engine-result engine-result-sticky" aria-label="Total fleet" ref={heroRef}>
          {fleet.groups.length > 0 ? (
            <>
              <div className="er-headline">
                <span className="er-eyebrow">Total fleet</span>
                <div className="er-num-row">
                  <span className="er-num mono">{fleet.totalFleetSold}</span>
                  <span className="er-num-unit">vehicles</span>
                </div>
                <div className="er-pipeline" aria-label="Fleet build-up">
                  <div className="ep-seg on">
                    <span className="ep-label">Raw</span>
                    <span className="ep-val mono">{fleet.totalBaseFleet}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">+</span>
                  <div className="ep-seg on">
                    <span className="ep-label">Charging</span>
                    <span className="ep-val mono">{fleet.totalChargingDelta > 0 ? `+${fleet.totalChargingDelta}` : '0'}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">×</span>
                  <div className="ep-seg on">
                    <span className="ep-label">Buffer</span>
                    <span className="ep-val mono">{(1 + settings.bufferPct).toFixed(2)}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">=</span>
                  <div className="ep-seg ep-total on">
                    <span className="ep-label">Total</span>
                    <span className="ep-val mono">{fleet.totalFleetSold}</span>
                  </div>
                </div>
              </div>
              <div className="er-kpis">
                <div className="er-kpi">
                  <span className="er-kpi-num mono">{flowCount}</span>
                  <span className="er-kpi-lbl">{flowCount === 1 ? 'Flow' : 'Flows'}</span>
                </div>
                <div className="er-kpi">
                  <span className="er-kpi-num mono">{totalThruPerHr}</span>
                  <span className="er-kpi-lbl">moves / hour</span>
                </div>
              </div>
              <div className="er-mix">
                <span className="er-eyebrow">Fleet breakdown</span>
                <ul className="er-mix-list">
                  {fleet.groups.map(g => (
                    <li key={g.vehicleId} className="er-mix-row">
                      <span className="er-mix-veh">
                        <VehicleDot vehicle={vehicleById.get(g.vehicleId)} size="sm" />
                        <span className="er-mix-name">{vehicleById.get(g.vehicleId)?.name ?? g.vehicleId}</span>
                      </span>
                      <span className="er-mix-fig">
                        <span className="er-mix-raw mono">{g.groupRaw.toFixed(2)}</span>
                        <span className="er-mix-arrow" aria-hidden="true">→</span>
                        <span className="er-mix-count mono">{g.baseFleet}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="er-empty">Assign a vehicle to a flow to size the fleet.</div>
          )}
        </section>

        <div className="form-with-nav engine-layout" ref={layoutRef}>
          <EngineNav totalFleetSold={fleet.totalFleetSold} hasFleet={fleet.groups.length > 0} />

          <div className="form-stack">
            <EngineSection
              id="engine-raw"
              num="01"
              title="Raw Fleet"
              sub="Engineering — flows → cycle time → raw demand, no multipliers"
            >
              <FlowsTab
                flows={flows}
                flowGroups={flowGroups}
                flowGroupColors={flowGroupColors}
                vehicles={vehicles}
                derivedByFlowId={derivedByFlowId}
                unitSystem={unitSystem}
                onPatch={persistPatch}
              />
            </EngineSection>

            <EngineSection
              id="engine-charging"
              num="02"
              title="Charging"
              sub="Physics — battery runtime adds vehicles when charging steals operating time"
            >
              <ChargingPipeline
                flows={flows}
                vehicleById={vehicleById}
                groupByVehicle={groupByVehicle}
                derivedByFlowId={derivedByFlowId}
                regime={settings.regime}
                dailyOpHr={settings.dailyOpHr}
                shiftsPerDay={project.shiftsPerDay ?? 1}
                hoursPerShift={project.hoursPerShift ?? 8}
                chargeMethods={settings.chargeMethods}
                onPatch={persistPatch}
              />
            </EngineSection>

            <EngineSection
              id="engine-buffer"
              num="03"
              title="Buffer"
              sub="Policy — margin for maintenance, training, and demand spikes"
            >
              <BufferPipeline
                flows={flows}
                vehicleById={vehicleById}
                groupByVehicle={groupByVehicle}
                bufferPct={settings.bufferPct}
                onPatch={persistPatch}
              />
            </EngineSection>
          </div>
        </div>

        <div className="step-nav">
          <Link href={`/projects/${id}/step2`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Vehicles
          </Link>
          <div className="row">
            <span className="hint">
              {fleet.groups.length === 0
                ? 'Assign a vehicle to a flow to size the fleet'
                : `${fleet.totalFleetSold} ${fleet.totalFleetSold === 1 ? 'vehicle' : 'vehicles'} total`}
            </span>
            <Link href={`/projects/${id}/step4`} className="btn primary">
              Continue to ROM <Icon name="arrowR" size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
