'use client'

// Sizing's view of the Fleet Simulation (spec v2 §9): one chip per vehicle type from the last full-shift
// run ("Meets at 3"), muted with "re-run" when the inputs changed since. A simulated fleet applied to
// pricing reads "In pricing: N (engine M)" with Back to engine. Reads the stored result only — Sizing
// never runs the simulation.

import { useMemo } from 'react'
import { VERDICT_LABEL } from '@/src/calc/sim/results'
import { appliedFleetStatus, simInputsKey } from '@/src/calc/sim/runInputs'
import { engineFleetByType } from '@/src/calc/fleet'
import type { FleetSummary } from '@/src/calc/types'
import { patchSimSettings, type StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  project: StoredProject
  vehicleById: Map<string, Vehicle>
  fleet: FleetSummary
}

export default function SimVerdictChips({ project, vehicleById, fleet }: Props) {
  const ss = project.simSettings
  const types = Object.entries(ss?.lastRun?.types ?? {})
  const applied = Object.entries(ss?.appliedFleet ?? {})
  const any = types.length > 0 || applied.length > 0
  // Hashing the inputs is only worth it when there is a result to compare against.
  const key = useMemo(() => (any ? simInputsKey(project, vehicleById) : ''), [any, project, vehicleById])
  if (!any) return null
  const stale = ss?.lastRun?.key !== key
  const name = (vid: string) => vehicleById.get(vid)?.name ?? vid
  const engineBy = engineFleetByType(fleet)
  const backToEngine = () => patchSimSettings(project.id, { appliedFleet: {} })

  return (
    <div className="sim-sizing" aria-label="Simulation">
      {types.map(([vid, t]) => (
        <span key={vid} className={`sim-chip sm ${stale ? '' : t.verdict}`} title={stale ? 'Inputs changed since this run — re-run in Simulate' : `Last full-shift run with ${t.fleet} vehicles`}>
          {name(vid)} · {VERDICT_LABEL[t.verdict]} at {t.fleet}{stale ? ' · re-run' : ''}
        </span>
      ))}
      {applied.length > 0 && (
        <span className="sim-sizing-applied">
          {applied.map(([vid, a]) => {
            const e = engineBy[vid] ?? 0, status = appliedFleetStatus(a, e, key)
            return status === 'unused'
              ? `${name(vid)}: engine now sizes ${e} — applied ${a.fleet} not used`
              : `In pricing: ${name(vid)} ${a.fleet} (engine ${e})${status === 'stale' ? ' · stale — re-run' : ''}`
          }).join(' · ')}
          {' '}<button type="button" className="link-btn" onClick={backToEngine}>Back to engine</button>
        </span>
      )}
    </div>
  )
}
