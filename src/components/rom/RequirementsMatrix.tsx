'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, GateResult } from '@/src/calc/types'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'

interface Props { project: StoredProject; fleet: FleetSummary; vehicleById: Map<string, Vehicle> }

/** Green checklist: every Step 2 gate satisfied by the chosen fleet. */
export default function RequirementsMatrix({ project, fleet, vehicleById }: Props) {
  const req = appRequirementsFromProject(project)
  // Aggregate gates across the fleet vehicles; a gate is "met" only if it passes for all.
  const byGate = new Map<string, { name: string; severity: string; met: boolean; skipped: boolean }>()
  for (const g of fleet.groups) {
    const veh = vehicleById.get(g.vehicleId)
    if (!veh) continue
    const q = qualifyVehicle(veh, req)
    for (const gate of [...q.hardGates, ...q.softPreferences] as GateResult[]) {
      const cur = byGate.get(gate.gateId)
      const met = !gate.skipped && gate.passed
      if (!cur) byGate.set(gate.gateId, { name: gate.name, severity: gate.severity, met, skipped: gate.skipped })
      else { cur.met = cur.met && met; cur.skipped = cur.skipped && gate.skipped }
    }
  }
  const rows = [...byGate.values()].filter(r => !r.skipped)
  if (rows.length === 0) return <div className="rv-empty">Provide application requirements in Step 1 to verify compatibility.</div>
  return (
    <ul className="rv-req">
      {rows.map(r => (
        <li key={r.name} className={`rv-req-row ${r.met ? 'rv-req-ok' : 'rv-req-no'}`}>
          <span className="rv-req-mark" aria-hidden="true">{r.met ? '✓' : '✕'}</span>
          <span className="rv-req-name">{r.name}</span>
          <span className="rv-req-sev">{r.severity === 'hard' ? 'Requirement' : 'Preference'}</span>
        </li>
      ))}
    </ul>
  )
}
