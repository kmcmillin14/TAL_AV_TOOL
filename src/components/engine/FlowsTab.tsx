'use client'

import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import FlowsTable from '@/src/components/step3/FlowsTable'
import type { EnginePatch } from './types'

interface Props {
  flows: Flow[]
  flowGroups: string[]
  flowGroupColors: Record<string, string>
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onPatch: (patch: EnginePatch) => void
  /** Optional: prefill a first flow from Step 1's distance + throughput (no vehicle). */
  onSeedFromStep1?: () => void
}

/** Flows sub-tab — the material-flow table that produces the base fleet. The
 *  per-vehicle roll-up now lives in the engine toolbar readout (AGV mix → total)
 *  and the Fleet tab's waterfall, so no separate summary box here. */
export default function FlowsTab(p: Props) {
  return (
    <FlowsTable
      flows={p.flows}
      flowGroups={p.flowGroups}
      flowGroupColors={p.flowGroupColors}
      vehicles={p.vehicles}
      derivedByFlowId={p.derivedByFlowId}
      unitSystem={p.unitSystem}
      onPatch={p.onPatch}
      onSeedFromStep1={p.onSeedFromStep1}
    />
  )
}
