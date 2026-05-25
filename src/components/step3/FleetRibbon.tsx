'use client'

import type { GroupSummary, ProjectFlowSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from './VehicleSelect'

interface Props {
  groups: GroupSummary[]
  totals: ProjectFlowSummary
  vehicleById: Map<string, Vehicle>
}

function headroomTone(h: number | null): 'good' | 'warn' | 'bad' | '' {
  if (h == null) return ''
  if (h < 0.05) return 'bad'
  if (h < 0.15) return 'warn'
  return 'good'
}

/**
 * Top-left summary box for Step 3. One line per vehicle type that has flows:
 *
 *   CB18   9.31 → 10
 *   ML2    2.68 → 3
 *   TOTAL        13
 *   2 Flows · 86 moves/hour
 *
 * `raw → ⌈baseFleet⌉` per the per-vehicle pool; TOTAL = Σ baseFleet. The ceil
 * count is tinted by its headroom band. Groups (zones) do not appear here —
 * fleet sizing pools per vehicleId, not per group.
 */
export default function FleetRibbon({ groups, totals, vehicleById }: Props) {
  const populatedGroups = groups.filter(g => g.flowsCount > 0)
  const hasFleet = totals.totalBaseFleet > 0

  return (
    <div className="fleet-summary">
      {!hasFleet ? (
        <div className="fs-empty">Assign a vehicle to a flow to size the fleet.</div>
      ) : (
        <ul className="fs-lines">
          {populatedGroups.map(g => {
            const vehicle = vehicleById.get(g.vehicleId)
            const name = vehicle?.name ?? g.vehicleId
            const tone = headroomTone(g.headroom)
            return (
              <li className="fs-line" key={g.vehicleId}>
                <VehicleDot vehicle={vehicle} size="sm" />
                <span className="fs-name">{name}</span>
                <span className="fs-raw mono">{g.groupRaw.toFixed(2)}</span>
                <span className="fs-arrow">→</span>
                <span className={`fs-fleet mono ${tone}`}>{g.baseFleet}</span>
              </li>
            )
          })}
          <li className="fs-line fs-total">
            <span className="fs-name">TOTAL</span>
            <span className="fs-fleet mono">{totals.totalBaseFleet}</span>
          </li>
        </ul>
      )}

      <div className="fs-meta mono">
        {totals.totalFlows} {totals.totalFlows === 1 ? 'Flow' : 'Flows'}
        <span className="fs-dot">·</span>
        {totals.totalThru} moves/hour
      </div>
    </div>
  )
}
