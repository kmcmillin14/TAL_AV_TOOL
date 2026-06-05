'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
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

  const totals = useMemo(
    () => ({
      totalFlows: flows.length,
      totalThru: flows.reduce((s, f) => s + f.thruPerHr, 0),
      totalRawFleet: groups.reduce((s, g) => s + g.groupRaw, 0),
      totalBaseFleet: groups.reduce((s, g) => s + g.baseFleet, 0),
    }),
    [flows, groups],
  )

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

  const steps: { id: EngineTab; n: number; label: string; value: string; sub: string }[] = [
    { id: 'flows', n: 1, label: 'Flows', value: `${fleet.totalBaseFleet}`, sub: 'base fleet' },
    { id: 'charging', n: 2, label: 'Charging', value: fleet.totalChargingDelta > 0 ? `+${fleet.totalChargingDelta}` : '+0', sub: 'for charging' },
    { id: 'fleet', n: 3, label: 'Fleet', value: `×${(1 + settings.bufferPct).toFixed(2)}`, sub: 'buffer' },
  ]
  const allVisited = visited.size >= 3

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => (u === 'imperial' ? 'metric' : 'imperial'))}
      />

      <div className="workspace">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 03 / 04</span>
            <h1>Fleet Engine</h1>
            <div className="desc">
              The whole sizing calculation in one place: define material flows, then layer
              charging and a buffer to reach the total fleet. Base fleet is pure engineering —
              charging is battery physics, buffer is policy.
            </div>
          </div>
        </div>

        <div className="engine-stepper" role="tablist" aria-label="Fleet build-up">
          {steps.map(s => (
            <Fragment key={s.id}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === s.id}
                className={`es-step${tab === s.id ? ' active' : ''}`}
                onClick={() => selectTab(s.id)}
              >
                <span className="es-head">
                  <span className="es-num">{s.n}</span>
                  <span className="es-label">{s.label}</span>
                  {!visited.has(s.id) && <span className="es-dot" aria-label="not yet reviewed" />}
                </span>
                <span className="es-value mono">{s.value}</span>
                <span className="es-sub">{s.sub}</span>
              </button>
              <span className="es-arrow" aria-hidden="true">›</span>
            </Fragment>
          ))}
          <div className="es-total" aria-label="Total fleet">
            <span className="es-head"><span className="es-total-label">Total Fleet</span></span>
            <span className="es-value mono">{fleet.totalFleetSold}</span>
            <span className="es-sub">vehicles</span>
          </div>
        </div>
        {!allVisited && fleet.groups.length > 0 && (
          <div className="engine-help">
            All three steps shape the total — base fleet is engineering, <strong>charging</strong> is
            physics, <strong>buffer</strong> is policy. Open each before quoting; the total above already
            includes them.
          </div>
        )}

        {tab === 'flows' && (
          <FlowsTab
            flows={flows}
            flowGroups={flowGroups}
            flowGroupColors={flowGroupColors}
            vehicles={vehicles}
            derivedByFlowId={derivedByFlowId}
            unitSystem={unitSystem}
            groups={groups}
            totals={totals}
            vehicleById={vehicleById}
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
