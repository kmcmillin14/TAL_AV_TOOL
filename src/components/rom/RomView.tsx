'use client'

// The former Dashboard's two halves (owner, 2026-11-18): the money under the quote on 05 Pricing, and how
// the fleet operates on 04 Simulation. One fleet model, one pricing gate, one schedule — so the two steps
// and the exports can never disagree.

import { useMemo } from 'react'
import { effDailyOpHr, defaultOperatingDaysPerYear } from '@/src/calc/romAnalytics'
import { dashboardClaim } from '@/src/lib/dashboardClaim'
import { computeFleetModel } from '@/src/lib/fleetModel'
import { pricingGate } from '@/src/lib/romComplexityFromProject'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import RomBento from './RomBento'
import RomKpis from './RomKpis'

interface Props {
  project: StoredProject
  vehicleById: Map<string, Vehicle>
  view: 'finance' | 'operations'
  onPatch?: (patch: Partial<StoredProject>) => void
}

export default function RomView({ project, vehicleById, view, onPatch }: Props) {
  const vehicles = useMemo(() => [...vehicleById.values()], [vehicleById])
  const model = useMemo(() => computeFleetModel(project, vehicles), [project, vehicles])
  const gate = pricingGate(project)
  const names = useMemo(() => Object.fromEntries([...vehicleById].map(([vid, v]) => [vid, v.name])), [vehicleById])
  const opHr = effDailyOpHr({
    shiftsPerDay: project.shiftsPerDay ?? 1,
    hoursPerShift: project.hoursPerShift ?? 8,
    breaksPerShift: project.breaksPerShift ?? 0,
    breakDurationMin: project.breakDurationMin ?? 0,
    operatorsPerShift: project.operatorsPerShift ?? 0,
    operatingDaysPerYear: project.operatingDaysPerYear ?? defaultOperatingDaysPerYear(project.operatingDaysPattern, project.operatingDaysCustom),
  })
  const serviceLifeYears = project.serviceLifeYears ?? 10

  if (model.fleet.groups.length === 0) {
    return <p className="rom-view-empty">Assign a vehicle to a flow in Sizing to see {view === 'finance' ? 'the return on investment' : 'how the fleet operates'}.</p>
  }
  const claim = view === 'finance' ? dashboardClaim(model) : null
  return (
    <div className={`rom-view is-${view}`}>
      {/* The answer, before the instruments. */}
      {claim?.fleet && (
        <p className="rom2-claim">
          <strong>{claim.fleet}.</strong>
          {claim.cost && <span> {claim.cost}.</span>}
          {claim.payback && <span> {claim.payback}.</span>}
        </p>
      )}
      {view === 'finance' && gate.blocked ? (
        // The quote above already says why it is not priced; one line here, not four "Not priced" tiles.
        <p className="rom-view-empty">Payback, net benefit and cost of ownership follow once the quote is priced.</p>
      ) : <div className="rom2-kpiband">
        <RomKpis fleet={model.fleet} rom={model.rom} flows={model.flows} settings={model.settings} costs={model.costs} serviceLifeYears={serviceLifeYears} vehicleById={vehicleById} names={names} view={view} gate={gate} />
      </div>}
      <RomBento project={project} flows={model.flows} derivedByFlowId={model.derivedByFlowId} fleet={model.fleet} rom={model.rom} gate={gate} vehicleById={vehicleById} effDailyOpHr={opHr} serviceLifeYears={serviceLifeYears} view={view} onPatch={onPatch} />
    </div>
  )
}
