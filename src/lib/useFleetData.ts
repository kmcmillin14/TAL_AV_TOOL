'use client'

import { useEffect, useMemo, useState } from 'react'
import { getProject, type StoredProject } from './storage'
import { fetchVehiclesCached } from './vehicleCache'
import { projectFleetSettings } from './fleetModel'
import { useProjectSync } from './useProjectSync'
import type { Vehicle } from './vehicleLibrary'
import type { FleetSettings, Flow } from '@/src/calc/types'
import { fleetFromFlows } from '@/src/calc/fleet'
import { consecutiveOperatingDays } from '@/src/calc/romAnalytics'

/** Centralizes the Fleet Engine data chain: load project + vehicles, derive flow
 *  metrics, group by vehicle, build settings, compute the FleetSummary. Used by the
 *  Fleet Engine (step3) and the ROM Dashboard (step4). Refreshes on storage/focus. */
export function useFleetData(id: string) {
  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const proj = getProject(id)
    if (!proj) { setError('Project not found.'); setLoading(false); return }
    setProject(proj)
    fetchVehiclesCached()
      .then(v => { setVehicles(v); setLoading(false) })
      .catch(() => { setError('Failed to load vehicle library.'); setLoading(false) })
  }, [id])

  useProjectSync(id, setProject)

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
  const flows: Flow[] = useMemo(() => project?.flows ?? [], [project])

  const settings: FleetSettings = useMemo(() => projectFleetSettings(project ?? {}), [project])
  const { derivedByFlowId, groups, fleet } = useMemo(() => fleetFromFlows(flows, vehicleById, settings), [flows, vehicleById, settings])

  return { project, setProject, vehicles, vehicleById, loading, error, flows, derivedByFlowId, groups, settings, fleet }
}
