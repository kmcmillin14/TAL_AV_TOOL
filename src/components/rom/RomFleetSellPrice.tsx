'use client'

import { useMemo, useState } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary } from '@/src/calc/types'
import { updateProject } from '@/src/lib/storage'
import { complexityAnswersFromProject, pricingInputConfidence, pricingGate } from '@/src/lib/romComplexityFromProject'
import {
  resolveRomSellPriceLine, resolveFleetSellPriceTotal, resolveFleetComplexityBaseline,
  type RomSellPriceLine, type RomSellPriceOverride,
} from '@/src/lib/romSellPriceLine'
import RomQuotation from './RomQuotation'
import RomPriceDrivers from './RomPriceDrivers'

interface Props {
  project: StoredProject
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
}

/** ROM Configuration (Step 4) — the fleet's internal sell price.
 *
 *  Two numbered sections in the shared `ScrollSection` the rest of the app uses
 *  (rebuilt 2026-10-09; it had its own bespoke cards): `01 Project investment`
 *  leads with the total and breaks it into four uniform rows, with the adders
 *  ticked inside the row they move; `02 Price drivers` carries the complexity
 *  scoring that multiplies two of those rows and the authority to override it,
 *  fleet-wide — both axes read project-level answers and total fleet size, not
 *  anything chassis-specific.
 *
 *  Every figure comes from the shared resolver (src/lib/romSellPriceLine.ts)
 *  that the Dashboard (via src/lib/fleetModel.ts) and the PPTX appendix also
 *  call, so the three surfaces can't drift. Adders are a project-wide,
 *  once-only cost and professional services is charged once per fleet-manager
 *  platform — both handled in src/calc/fleetSellPrice.ts, never per vehicle. */
export default function RomFleetSellPrice({ project, fleet, vehicleById }: Props) {
  const assignedGroups = useMemo(() => fleet.groups.filter(g => g.fleetSold > 0), [fleet.groups])
  const [selectedAdderIds, setSelectedAdderIds] = useState<string[]>(project.romSellPriceSelectedAdderIds ?? [])
  const [overrides, setOverrides] = useState(project.romSellPriceOverrides ?? {})

  const persist = (next: { selectedAdderIds?: string[]; overrides?: typeof overrides }) => {
    updateProject(project.id, {
      romSellPriceSelectedAdderIds: next.selectedAdderIds ?? selectedAdderIds,
      romSellPriceOverrides: next.overrides ?? overrides,
    })
  }

  const answers = useMemo(() => complexityAnswersFromProject(project), [project])
  const confidence = useMemo(() => pricingInputConfidence(project), [project])
  const gate = useMemo(() => pricingGate(project), [project])
  const baseline = useMemo(
    () => resolveFleetComplexityBaseline(project, fleet.totalFleetSold),
    [project, fleet.totalFleetSold]
  )

  const lines = useMemo(() => {
    const resolved: RomSellPriceLine[] = []
    for (const g of assignedGroups) {
      const vehicle = vehicleById.get(g.vehicleId)
      if (!vehicle) continue
      const line = resolveRomSellPriceLine(vehicle, g, fleet.totalFleetSold, answers, overrides[g.vehicleId])
      if (line) resolved.push(line)
    }
    return resolved
  }, [assignedGroups, vehicleById, fleet.totalFleetSold, answers, overrides])

  const fleetTotal = useMemo(() => {
    const projectForTotal: StoredProject = { ...project, romSellPriceSelectedAdderIds: selectedAdderIds }
    return resolveFleetSellPriceTotal(projectForTotal, lines)
  }, [project, selectedAdderIds, lines])

  const setOverride = (vehicleId: string, patch: Partial<RomSellPriceOverride>) => {
    const next = { ...overrides, [vehicleId]: { ...overrides[vehicleId], ...patch } }
    setOverrides(next)
    persist({ overrides: next })
  }

  const toggleAdder = (id: string) => {
    const next = selectedAdderIds.includes(id) ? selectedAdderIds.filter(a => a !== id) : [...selectedAdderIds, id]
    setSelectedAdderIds(next)
    persist({ selectedAdderIds: next })
  }

  if (assignedGroups.length === 0) {
    return (
      <p className="rom-sp-empty">
        No vehicles assigned to any flow yet — ROM configuration appears once the engineer
        assigns a vehicle in the Fleet Engine.
      </p>
    )
  }

  return (
    <div className="rom-sp">
      {lines.length === 0 ? (
        <p className="rom-sp-empty">
          None of the {assignedGroups.length} assigned vehicle{assignedGroups.length === 1 ? '' : 's'} has
          pricing configured — missing romInputs or calc.priceRange.
        </p>
      ) : (
        <>
          <RomQuotation
            lines={lines}
            fleetTotal={fleetTotal}
            selectedAdderIds={selectedAdderIds}
            onToggleAdder={toggleAdder}
            confidence={confidence}
            baseline={baseline}
            gate={gate}
          />

          <RomPriceDrivers
            baseline={baseline}
            lines={lines}
            overrides={overrides}
            onOverride={setOverride}
            blocked={gate.blocked}
          />
        </>
      )}
    </div>
  )
}
