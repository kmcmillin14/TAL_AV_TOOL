'use client'

import type { Flow, FlowDerived, GroupSummary, ProjectFlowSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import FlowsTable from '@/src/components/step3/FlowsTable'
import FleetRibbon from '@/src/components/step3/FleetRibbon'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  flowGroups: string[]
  flowGroupColors: Record<string, string>
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  groups: GroupSummary[]
  totals: ProjectFlowSummary
  vehicleById: Map<string, Vehicle>
  onPatch: (patch: EnginePatch) => void
}

/** Flows sub-tab — the material-flow table + per-vehicle base-fleet summary
 *  (the original Step 3 surface, unchanged), feeding the engine's base fleet. */
export default function FlowsTab(p: Props) {
  return (
    <>
      <FleetRibbon groups={p.groups} totals={p.totals} vehicleById={p.vehicleById} />
      <FlowsTable
        flows={p.flows}
        flowGroups={p.flowGroups}
        flowGroupColors={p.flowGroupColors}
        vehicles={p.vehicles}
        derivedByFlowId={p.derivedByFlowId}
        unitSystem={p.unitSystem}
        onPatch={p.onPatch}
      />
    </>
  )
}
