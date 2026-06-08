'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { fleetSummary } from '@/src/calc/fleet'
import type { EnginePatch } from '@/src/components/engine/types'
import { flushSync } from 'react-dom'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import FlowsTab from '@/src/components/engine/FlowsTab'
import ChargingPipeline from '@/src/components/engine/ChargingPipeline'
import BufferPipeline from '@/src/components/engine/BufferPipeline'

type EngineTab = 'flows' | 'charging' | 'fleet'

export default function FleetEnginePage() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const [tab, setTab] = useState<EngineTab>('flows')
  const [visited, setVisited] = useState<Set<EngineTab>>(() => new Set<EngineTab>(['flows']))
  const selectTab = (id: EngineTab) => { setTab(id); setVisited(v => (v.has(id) ? v : new Set(v).add(id))) }
  // Morph between stages via the View Transitions API (transform/opacity FLIP,
  // per ui-ux-pro-max — never animate width). Falls back to instant when the
  // API is unavailable or the user prefers reduced motion.
  const changeStage = (id: EngineTab) => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition
    if (!start || reduce) { selectTab(id); return }
    start.call(document, () => flushSync(() => selectTab(id)))
  }

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

  const settings: FleetSettings = useMemo(() => ({
    regime: project?.chargeRegime ?? 'overnight',
    bufferPct: project?.bufferPct ?? 0.10,
    dailyOpHr: Math.min(24, (project?.shiftsPerDay ?? 1) * (project?.hoursPerShift ?? 8)),
    chargeMethods: project?.chargeMethods ?? {},
  }), [project])

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

  // Auto-seed a starter flow from Step 1's distance + throughput so the fleet
  // takes shape without re-entering numbers. NEVER seeds a vehicle — the Fleet
  // Engineer never picks a vehicle; the engineer assigns it on the new row.
  const canSeedFromStep1 =
    flows.length === 0 &&
    ((project.requiredThroughputPerHour ?? 0) > 0 || (project.avgDistanceFt ?? 0) > 0)
  const seedFlowFromStep1 = () => {
    const dist = project.avgDistanceFt ?? 0
    const oneWay = project.distanceType === 'round_trip' ? dist / 2 : dist
    const seeded: Flow = {
      id: 'f_' + Math.random().toString(36).slice(2, 10),
      origin: '',
      destination: '',
      distanceFt: oneWay,
      thruPerHr: project.requiredThroughputPerHour ?? 0,
      routeLayout: 'medium',
      liftHeightFt: 0,
    }
    persistPatch({ flows: [seeded] })
  }

  const steps: { id: EngineTab; label: string }[] = [
    { id: 'flows', label: 'Flows' },
    { id: 'charging', label: 'Charging' },
    { id: 'fleet', label: 'Buffer' },
  ]
  const curIndex = Math.max(0, steps.findIndex(s => s.id === tab))
  const goStage = (delta: number) => { const next = steps[curIndex + delta]; if (next) changeStage(next.id) }
  const groupByVehicle = new Map(fleet.groups.map(g => [g.vehicleId, g]))
  // Hero shows the cumulative fleet at the stage reached — it grows as you advance.
  const stageValue =
    tab === 'flows' ? fleet.totalBaseFleet
    : tab === 'charging' ? fleet.totalBaseFleet + fleet.totalChargingDelta
    : fleet.totalFleetSold
  const stageLabel = tab === 'flows' ? 'Base fleet' : tab === 'charging' ? 'With charging' : 'Total fleet'
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

        <section className="engine-result" aria-label="Total fleet">
          {fleet.groups.length > 0 ? (
            <>
              <div className="er-headline">
                <span className="er-eyebrow">{stageLabel}</span>
                <div className="er-num-row">
                  <span className="er-num mono">{stageValue}</span>
                  <span className="er-num-unit">vehicles</span>
                </div>
                <div className="er-pipeline" aria-label="Fleet build-up">
                  <div className="ep-seg on">
                    <span className="ep-label">Base</span>
                    <span className="ep-val mono">{fleet.totalBaseFleet}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">+</span>
                  <div className={`ep-seg${curIndex >= 1 ? ' on' : ''}`}>
                    <span className="ep-label">Charging</span>
                    <span className="ep-val mono">{fleet.totalChargingDelta > 0 ? `+${fleet.totalChargingDelta}` : '0'}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">×</span>
                  <div className={`ep-seg${curIndex >= 2 ? ' on' : ''}`}>
                    <span className="ep-label">Buffer</span>
                    <span className="ep-val mono">{(1 + settings.bufferPct).toFixed(2)}</span>
                  </div>
                  <span className="ep-op" aria-hidden="true">=</span>
                  <div className={`ep-seg ep-total${curIndex >= 2 ? ' on' : ''}`}>
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

        <div className="engine-stagebar">
          <div className="engine-seg" role="tablist" aria-label="Fleet build stages">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={tab === s.id}
                className={`es-tab${tab === s.id ? ' active' : ''}`}
                onClick={() => changeStage(s.id)}
              >
                <span className="es-tab-n mono">{i + 1}</span>{s.label}
                {!visited.has(s.id) && <span className="es-dot" aria-label="not yet reviewed" />}
              </button>
            ))}
          </div>
          <div className="stage-nav">
            <span className="stage-count mono">Step {curIndex + 1} of {steps.length}</span>
            <button type="button" className="stage-btn" onClick={() => goStage(-1)} disabled={curIndex === 0}>
              <Icon name="arrowL" size={13} /> Back
            </button>
            <button type="button" className="stage-btn primary" onClick={() => goStage(1)} disabled={curIndex === steps.length - 1}>
              Next <Icon name="arrowR" size={13} />
            </button>
          </div>
        </div>

        {tab === 'flows' && (
          <FlowsTab
            flows={flows}
            flowGroups={flowGroups}
            flowGroupColors={flowGroupColors}
            vehicles={vehicles}
            derivedByFlowId={derivedByFlowId}
            unitSystem={unitSystem}
            onPatch={persistPatch}
            onSeedFromStep1={canSeedFromStep1 ? seedFlowFromStep1 : undefined}
          />
        )}
        {tab === 'charging' && (
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
        )}
        {tab === 'fleet' && (
          <BufferPipeline
            flows={flows}
            vehicleById={vehicleById}
            groupByVehicle={groupByVehicle}
            bufferPct={settings.bufferPct}
            onPatch={persistPatch}
          />
        )}

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
