'use client'

import { useMemo, useState } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary } from '@/src/calc/types'
import { updateProject } from '@/src/lib/storage'
import { complexityAnswersFromProject } from '@/src/lib/romComplexityFromProject'
import {
  resolveRomSellPriceLine, resolveFleetSellPriceTotal, type RomSellPriceLine, type RomSellPriceOverride,
} from '@/src/lib/romSellPriceLine'
import { GAP_FIELDS } from '@/src/calc/complexityInputs'
import { ADDERS_CONFIG } from '@/src/lib/pricingContent'
import { fullUsd } from './RomSellPriceParts'
import VehicleSellPriceBlock from './VehicleSellPriceBlock'

interface Props {
  project: StoredProject
  fleet: FleetSummary
  vehicleById: Map<string, Vehicle>
}

/** ROM Configuration (Step 4) — the full-fleet internal sell-price build-up
 *  (Hardware + Integration + Software + Adders). Leads with the fleet-wide
 *  TOTAL, then one collapsed-by-default block per engineer-assigned chassis
 *  with configured pricing — expand a block to drill into that vehicle's
 *  own tier scoring and receipt math. Adders are a project-wide, once-only
 *  cost — computed here exactly once via resolveFleetSellPriceTotal, never
 *  per vehicle (see src/calc/fleetSellPrice.ts for the bug this replaced:
 *  adders used to be added on every vehicle line independently).
 *  Scoring/pricing is resolved by the shared src/lib/romSellPriceLine.ts —
 *  the PPTX export (src/lib/pptx/romSellPrice.ts) uses the same resolver so
 *  the two surfaces can't drift. */
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
      <p className="rom-sp-placeholder-warning">
        ROM — budgetary estimate, placeholder pricing. All dollar values and multipliers are
        pending real pricing input.
      </p>
      <p className="rom-sp-gap-flag">
        Complexity may be understated — not yet collected by the questionnaire:{' '}
        {GAP_FIELDS.join(', ')}.
      </p>

      {lines.length === 0 && (
        <p className="rom-sp-empty">
          None of the {assignedGroups.length} assigned vehicle{assignedGroups.length === 1 ? '' : 's'} has
          pricing configured — missing romInputs or calc.priceRange.
        </p>
      )}

      {lines.length > 0 && (
        <section className="rom-sp-pricing rom2-hero rom-sp-fleet-total">
          <div className="rom2-hero-head">
            Fleet total — {fleetTotal.totalQty} unit{fleetTotal.totalQty === 1 ? '' : 's'} across{' '}
            {lines.length} vehicle {lines.length === 1 ? 'type' : 'types'}
          </div>
          <div className="rom-sp-receipt">
            <div className="rom-sp-receipt-foot"><span>Hardware</span><span className="mono">{fullUsd(fleetTotal.hardwareTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Integration</span><span className="mono">{fullUsd(fleetTotal.integrationTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Software</span><span className="mono">{fullUsd(fleetTotal.softwareTotal)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Adders</span><span className="mono">{fullUsd(fleetTotal.addersTotal)}</span></div>
            <div className="rom-sp-receipt-total">
              <span>TOTAL ({fleetTotal.totalQty} units)</span>
              <span className="rom-sp-receipt-amount mono">{fullUsd(fleetTotal.sellTotal)}</span>
            </div>
            <div className="rom-sp-receipt-foot"><span>Per unit (blended)</span><span className="mono">{fullUsd(fleetTotal.sellPerUnit)}</span></div>
            <div className="rom-sp-receipt-foot"><span>Program range</span><span className="mono">{fullUsd(fleetTotal.band.lowTotal)} – {fullUsd(fleetTotal.band.highTotal)}</span></div>
          </div>

          <div className="rom-sp-adders">
            <span className="rom-card-eyebrow">Adders</span>
            <div className="rom-sp-adder-grid">
              {ADDERS_CONFIG.adders.map(a => (
                <label key={a.id} className="rom-sp-adder-row">
                  <input
                    type="checkbox"
                    checked={selectedAdderIds.includes(a.id)}
                    onChange={() => toggleAdder(a.id)}
                  />
                  {a.label} <span className="mono">{fullUsd(a.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      {lines.length > 0 && (
        <p className="rom-sp-detail-eyebrow">Per-vehicle detail — click a row to expand</p>
      )}

      {lines.map(line => (
        <VehicleSellPriceBlock
          key={line.vehicleId}
          line={line}
          override={overrides[line.vehicleId]}
          onOverride={patch => setOverride(line.vehicleId, patch)}
        />
      ))}
    </div>
  )
}
