'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { getProject, updateProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { FleetSettings, Flow, FlowDerived } from '@/src/calc/types'
import { flowDerived, groupSummary } from '@/src/calc/flowMetrics'
import { fleetSummary } from '@/src/calc/fleet'
import type { EnginePatch } from '@/src/components/engine/types'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import FlowsTab from '@/src/components/engine/FlowsTab'
import ChargingTab from '@/src/components/engine/ChargingTab'
import FleetTab from '@/src/components/engine/FleetTab'

type EngineTab = 'flows' | 'charging' | 'fleet'

export default function FleetEnginePage() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')
  const [tab, setTab] = useState<EngineTab>('flows')
  const [visited, setVisited] = useState<Set<EngineTab>>(() => new Set<EngineTab>(['flows']))
  const selectTab = (id: EngineTab) => { setTab(id); setVisited(v => (v.has(id) ? v : new Set(v).add(id))) }

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

  const steps: { id: EngineTab; label: string }[] = [
    { id: 'flows', label: 'Flows' },
    { id: 'charging', label: 'Charging' },
    { id: 'fleet', label: 'Buffer' },
  ]
  const curIndex = Math.max(0, steps.findIndex(s => s.id === tab))
  const goStage = (delta: number) => { const next = steps[curIndex + delta]; if (next) selectTab(next.id) }
  // Hero shows the cumulative fleet at the stage reached — it grows as you advance.
  const stageValue =
    tab === 'flows' ? fleet.totalBaseFleet
    : tab === 'charging' ? fleet.totalBaseFleet + fleet.totalChargingDelta
    : fleet.totalFleetSold
  const stageLabel = tab === 'flows' ? 'Base fleet' : tab === 'charging' ? 'With charging' : 'Total fleet'

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => (u === 'imperial' ? 'metric' : 'imperial'))}
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
                <div className="er-build mono">
                  <span className="er-seg on">{fleet.totalBaseFleet} base</span>
                  <span className={`er-seg${curIndex >= 1 ? ' on' : ''}`}>+{fleet.totalChargingDelta} charging</span>
                  <span className={`er-seg${curIndex >= 2 ? ' on' : ''}`}>×{(1 + settings.bufferPct).toFixed(2)} buffer</span>
                </div>
              </div>
              <div className="er-mix">
                <span className="er-eyebrow">Base fleet by vehicle</span>
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
                onClick={() => selectTab(s.id)}
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
          />
        )}
        {tab === 'charging' && (
          <ChargingTab
            fleet={fleet}
            vehicleById={vehicleById}
            regime={settings.regime}
            dailyOpHr={settings.dailyOpHr}
            shiftsPerDay={project.shiftsPerDay ?? 1}
            hoursPerShift={project.hoursPerShift ?? 8}
            chargeMethods={settings.chargeMethods}
            onPatch={persistPatch}
          />
        )}
        {tab === 'fleet' && (
          <FleetTab fleet={fleet} vehicleById={vehicleById} bufferPct={settings.bufferPct} onPatch={persistPatch} />
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
