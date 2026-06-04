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
import type { Flow, FlowDerived } from '@/src/calc/types'
import {
  flowDerived,
  groupSummary,
} from '@/src/calc/flowMetrics'
import FlowsTable from '@/src/components/step3/FlowsTable'
import FleetRibbon from '@/src/components/step3/FleetRibbon'

export default function Step3Page() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  useEffect(() => {
    const proj = getProject(id)
    if (!proj) {
      setError('Project not found.')
      setLoading(false)
      return
    }
    setProject(proj)
    fetchVehiclesCached()
      .then(vehs => {
        setVehicles(vehs)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load vehicle library.')
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    const refresh = () => {
      const proj = getProject(id)
      if (proj) setProject(proj)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [id])

  const vehicleById = useMemo(
    () => new Map(vehicles.map(v => [v.id, v])),
    [vehicles],
  )

  const flows: Flow[] = useMemo(() => project?.flows ?? [], [project])
  const flowGroups: string[] = useMemo(() => project?.flowGroups ?? [], [project])
  const flowGroupColors: Record<string, string> = useMemo(
    () => project?.flowGroupColors ?? {},
    [project],
  )

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
    for (const f of flows) {
      if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    }
    return ids.map(vid => groupSummary(vid, flows, derivedByFlowId))
  }, [flows, derivedByFlowId])

  // Reuse the already-computed per-vehicle `groups` rather than re-running
  // groupSummary for every vehicle a second time inside projectFlowSummary.
  const totals = useMemo(
    () => ({
      totalFlows: flows.length,
      totalThru: flows.reduce((s, f) => s + f.thruPerHr, 0),
      totalRawFleet: groups.reduce((s, g) => s + g.groupRaw, 0),
      totalBaseFleet: groups.reduce((s, g) => s + g.baseFleet, 0),
    }),
    [flows, groups],
  )

  const persistPatch = (patch: { flows?: Flow[]; flowGroups?: string[]; flowGroupColors?: Record<string, string> }) => {
    if (!project) return
    const updated = updateProject(project.id, patch)
    if (updated) setProject(updated)
  }

  if (loading) {
    return (
      <div className="app-shell">
        <div className="step2-loading">Loading flows…</div>
      </div>
    )
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

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={3}
        unitSystem={unitSystem}
        onUnitToggle={() =>
          setUnitSystem(u => (u === 'imperial' ? 'metric' : 'imperial'))
        }
      />

      <div className="workspace">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 03 / 06</span>
            <h1>Material Flows</h1>
            <div className="desc">
              Define origin → destination pairs. Cycle time and raw vehicle
              demand recompute live; group cards aggregate into the
              engineering base fleet. No safety multipliers here — Step 4 adds
              charging, Step 5 adds buffer.
            </div>
          </div>
        </div>

        <FleetRibbon groups={groups} totals={totals} vehicleById={vehicleById} />

        <FlowsTable
          flows={flows}
          flowGroups={flowGroups}
          flowGroupColors={flowGroupColors}
          vehicles={vehicles}
          derivedByFlowId={derivedByFlowId}
          unitSystem={unitSystem}
          onPatch={persistPatch}
        />

        <div className="step-nav">
          <Link href={`/projects/${id}/step2`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Vehicles
          </Link>
          <div className="row">
            <span className="hint">
              {groups.length === 0
                ? 'Assign a vehicle to a flow to populate the base fleet'
                : `${totals.totalBaseFleet} ${totals.totalBaseFleet === 1 ? 'vehicle' : 'vehicles'} across ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
            </span>
            <button
              type="button"
              className="btn primary"
              disabled
              title="Charging & energy — coming in Step 4"
            >
              Continue to Charging <Icon name="arrowR" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
