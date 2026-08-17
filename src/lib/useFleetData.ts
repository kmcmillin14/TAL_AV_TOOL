'use client'

import { useEffect, useMemo, useState } from 'react'
import { getProject, subscribeProjects, type StoredProject } from './storage'
import { fetchVehiclesCached } from './vehicleCache'
import type { Vehicle } from './vehicleLibrary'
import type { FleetSettings, Flow, FlowDerived } from '@/src/calc/types'
import { DEFAULT_BUFFER_PCT } from '@/src/calc/types'
import { flowDerived, groupSummary } from '@/src/calc/flowMetrics'
import { fleetSummary, defaultChargeRegime } from '@/src/calc/fleet'
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

  useEffect(() => {
    const refresh = () => { const p = getProject(id); if (p) setProject(p) }
    window.addEventListener('storage', refresh)   // cross-tab writes
    window.addEventListener('focus', refresh)
    const unsub = subscribeProjects(refresh)       // same-tab writes (e.g. undo)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      unsub()
    }
  }, [id])

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
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
    for (const f of flows) if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    return ids.map(vid => groupSummary(vid, flows, derivedByFlowId))
  }, [flows, derivedByFlowId])

  const settings: FleetSettings = useMemo(() => {
    const dailyOpHr = Math.min(24, (project?.shiftsPerDay ?? 1) * (project?.hoursPerShift ?? 8))
    return {
      // Derived default, never a lock: a 24 h/day schedule has no overnight
      // charge window, so an unset regime defaults to 'continuous'. The engine
      // toggle writes the explicit choice, which always wins.
      regime: project?.chargeRegime ?? defaultChargeRegime(dailyOpHr),
      bufferPct: project?.bufferPct ?? DEFAULT_BUFFER_PCT,
      dailyOpHr,
      breakHrs: ((project?.breaksPerShift ?? 0) * ((project?.breakDurationMin ?? 0) / 60)) * (project?.shiftsPerDay ?? 1),
      consecutiveOpDays: consecutiveOperatingDays(project?.operatingDaysPattern, project?.operatingDaysCustom),
      chargeMethods: project?.chargeMethods ?? {},
    }
  }, [project])

  const fleet = useMemo(() => fleetSummary(groups, vehicleById, settings), [groups, vehicleById, settings])

  return { project, setProject, vehicles, vehicleById, loading, error, flows, derivedByFlowId, groups, settings, fleet }
}
