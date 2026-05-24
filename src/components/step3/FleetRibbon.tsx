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
 * Single-row summary surface for Step 3. Replaces the old page-header KPI
 * strip + the per-vehicle GroupSummaryStrip.
 *
 * Left half: project totals (flows · cycles/hr · raw → ⌈base fleet⌉).
 * Right half: one chip per vehicle that actually has flows assigned —
 *   [thumb] CB18 ×7 (raw 6.77)
 * with the ×N count tinted by headroom band.
 */
export default function FleetRibbon({ groups, totals, vehicleById }: Props) {
  const populatedGroups = groups.filter(g => g.flowsCount > 0)
  const hasFleet = totals.totalBaseFleet > 0

  return (
    <div className="fleet-ribbon">
      <div className="fleet-ribbon-totals">
        <span className="fr-total">
          <span className="val mono">{totals.totalFlows}</span>
          <span className="lbl">{totals.totalFlows === 1 ? 'flow' : 'flows'}</span>
        </span>
        <span className="fr-sep">·</span>
        <span className="fr-total">
          <span className="val mono">{totals.totalThru}</span>
          <span className="lbl">/hr</span>
        </span>
        <span className="fr-sep">·</span>
        <span className="fr-total">
          <span className="lbl">raw</span>
          <span className="val mono">{totals.totalRawFleet.toFixed(2)}</span>
        </span>
        <span className="fr-arrow">→</span>
        <span className="fr-fleet">
          <span className="val mono">⌈{totals.totalBaseFleet}⌉</span>
          <span className="lbl">{totals.totalBaseFleet === 1 ? 'vehicle' : 'vehicles'}</span>
        </span>
      </div>

      <div className="fleet-ribbon-chips">
        {!hasFleet && (
          <span className="fr-empty">
            Assign a vehicle to a flow to size the fleet.
          </span>
        )}
        {populatedGroups.map((g, i) => {
          const vehicle = vehicleById.get(g.vehicleId)
          const name = vehicle?.name ?? g.vehicleId
          const tone = headroomTone(g.headroom)
          return (
            <span className="fr-chip" key={g.vehicleId} data-not-first={i > 0 || undefined}>
              <VehicleDot vehicle={vehicle} size="sm" />
              <span className="fr-chip-name">{name}</span>
              <span className={`fr-chip-count mono ${tone}`}>×{g.baseFleet}</span>
              <span className="fr-chip-raw mono">raw {g.groupRaw.toFixed(2)}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
