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
  projectFlowSummary,
} from '@/src/calc/flowMetrics'
import FlowsTable from '@/src/components/step3/FlowsTable'
import GroupSummaryStrip from '@/src/components/step3/GroupSummaryStrip'

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

  const totals = useMemo(
    () => projectFlowSummary(flows, derivedByFlowId),
    [flows, derivedByFlowId],
  )

  const persistFlows = (next: Flow[]) => {
    if (!project) return
    const updated = updateProject(project.id, { flows: next })
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
          <div className="step3-totals">
            <div className="step3-total">
              <div className="lbl">Flows</div>
              <div className="val mono">{totals.totalFlows}</div>
            </div>
            <div className="step3-total">
              <div className="lbl">Cycles/hr</div>
              <div className="val mono">{totals.totalThru}</div>
            </div>
            <div className="step3-total">
              <div className="lbl">Raw demand</div>
              <div className="val mono">{totals.totalRawFleet.toFixed(2)}</div>
            </div>
            <div className="step3-total accent">
              <div className="lbl">Base Fleet</div>
              <div className="val mono">{totals.totalBaseFleet}</div>
            </div>
          </div>
        </div>

        <GroupSummaryStrip groups={groups} vehicleById={vehicleById} />

        <FlowsTable
          flows={flows}
          vehicles={vehicles}
          derivedByFlowId={derivedByFlowId}
          unitSystem={unitSystem}
          onFlowsChange={persistFlows}
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
