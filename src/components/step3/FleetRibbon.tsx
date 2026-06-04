'use client'

import { useState } from 'react'
import type { GroupSummary, ProjectFlowSummary, ZoneSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from './VehicleSelect'
import { sectionColor } from './sectionColor'

interface Props {
  groups: GroupSummary[]
  zones: ZoneSummary[]
  flowGroupColors: Record<string, string>
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
 * Top-left Step 3 summary box. Two views:
 *  - **By Vehicle** (default): one line per vehicle type — `raw → ⌈baseFleet⌉`,
 *    tinted by headroom; TOTAL = Σ baseFleet (the binding integer pool).
 *  - **By Zone**: per visual group, the fractional demand each vehicle
 *    contributes (demand only — no per-zone ceil, since the fleet pools per
 *    vehicleId across the whole project). The single binding TOTAL integer is
 *    shown once; per-zone fractions reconcile to totalRawFleet, not to it.
 * The toggle only appears once at least one zone exists.
 */
export default function FleetRibbon({ groups, zones, flowGroupColors, totals, vehicleById }: Props) {
  const [view, setView] = useState<'vehicle' | 'zone'>('vehicle')
  const populatedGroups = groups.filter(g => g.flowsCount > 0)
  const hasFleet = totals.totalBaseFleet > 0
  const hasZones = zones.length > 0
  const effectiveView = hasZones ? view : 'vehicle'

  const vehName = (id: string) => vehicleById.get(id)?.name ?? id

  return (
    <div className="fleet-summary">
      {hasZones && (
        <div className="fs-view-toggle" role="tablist" aria-label="Fleet summary view">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveView === 'vehicle'}
            className={effectiveView === 'vehicle' ? 'active' : ''}
            onClick={() => setView('vehicle')}
          >
            By Vehicle
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveView === 'zone'}
            className={effectiveView === 'zone' ? 'active' : ''}
            onClick={() => setView('zone')}
          >
            By Zone
          </button>
        </div>
      )}

      {!hasFleet ? (
        <div className="fs-empty">Assign a vehicle to a flow to size the fleet.</div>
      ) : effectiveView === 'vehicle' ? (
        <ul className="fs-lines">
          {populatedGroups.map(g => {
            const vehicle = vehicleById.get(g.vehicleId)
            const tone = headroomTone(g.headroom)
            return (
              <li className="fs-line" key={g.vehicleId}>
                <span className="fs-label">
                  <VehicleDot vehicle={vehicle} size="sm" />
                  <span className="fs-name">{vehName(g.vehicleId)}</span>
                </span>
                <span className="fs-figures">
                  <span className="fs-raw mono">{g.groupRaw.toFixed(2)}</span>
                  <span className="fs-arrow">→</span>
                  <span className={`fs-fleet mono ${tone}`}>{g.baseFleet}</span>
                </span>
              </li>
            )
          })}
          <li className="fs-line fs-total">
            <span className="fs-label"><span className="fs-name">TOTAL</span></span>
            <span className="fs-figures">
              <span className="fs-fleet mono">{totals.totalBaseFleet}</span>
            </span>
          </li>
        </ul>
      ) : (
        <div className="fs-zones">
          {zones.map(z => {
            const isUngrouped = z.sectionName === null
            const swatch = isUngrouped
              ? 'var(--text-disabled)'
              : (flowGroupColors[z.sectionName!] ?? sectionColor(z.sectionName!))
            const assigned = z.vehicles.reduce((s, v) => s + v.flowsCount, 0)
            const unassigned = z.flowsCount - assigned
            return (
              <div className="fs-zone" key={z.sectionName ?? '__ungrouped__'}>
                <div className="fs-zone-head">
                  <span className="fs-zone-swatch" style={{ background: swatch }} />
                  <span className="fs-zone-name">{isUngrouped ? 'Ungrouped' : z.sectionName}</span>
                  <span className="fs-zone-count mono">
                    {z.flowsCount} {z.flowsCount === 1 ? 'flow' : 'flows'}
                    {unassigned > 0 && <span className="fs-zone-unassigned"> · {unassigned} no vehicle</span>}
                  </span>
                </div>
                {z.vehicles.map(v => (
                  <div className="fs-zone-line" key={v.vehicleId}>
                    <span className="fs-label">
                      <VehicleDot vehicle={vehicleById.get(v.vehicleId)} size="sm" />
                      <span className="fs-name">{vehName(v.vehicleId)}</span>
                    </span>
                    <span className="fs-raw mono">{v.raw.toFixed(2)}</span>
                  </div>
                ))}
                <div className="fs-zone-sub">
                  <span className="fs-zone-sub-label">zone demand</span>
                  <span className="fs-raw mono">{z.zoneRaw.toFixed(2)}</span>
                </div>
              </div>
            )
          })}
          <div className="fs-line fs-total">
            <span className="fs-label"><span className="fs-name">TOTAL FLEET</span></span>
            <span className="fs-figures"><span className="fs-fleet mono">{totals.totalBaseFleet}</span></span>
          </div>
          <div className="fs-total-caption">Fleet pools per vehicle across all zones — per-zone numbers are demand, not standalone counts.</div>
        </div>
      )}

      <div className="fs-meta mono">
        {totals.totalFlows} {totals.totalFlows === 1 ? 'Flow' : 'Flows'}
        <span className="fs-dot">·</span>
        {totals.totalThru} moves/hour
      </div>
    </div>
  )
}
