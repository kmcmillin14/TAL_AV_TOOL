'use client'

// The former Dashboard's two halves (owner, 2026-11-18): the money under the quote on 05 Pricing, and how
// the fleet operates on 04 Simulation. One fleet model per page — so the two steps and the exports can
// never disagree.

import { useMemo } from 'react'
import { effDailyOpHr } from '@/src/calc/romAnalytics'
import { roiClaim } from '@/src/lib/roiClaim'
import { computeFleetModel } from '@/src/lib/fleetModel'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { EconomicsAssumptions, FinanceBento, OperationsBento } from './RomTiles'
import RomKpis from './RomKpis'

function useRomModel(project: StoredProject, vehicleById: Map<string, Vehicle>) {
  const vehicles = useMemo(() => [...vehicleById.values()], [vehicleById])
  const model = useMemo(() => computeFleetModel(project, vehicles), [project, vehicles])
  const names = useMemo(() => Object.fromEntries([...vehicleById].map(([vid, v]) => [vid, v.name])), [vehicleById])
  return { model, names, serviceLifeYears: project.serviceLifeYears ?? 10 }
}

const Empty = ({ what }: { what: string }) => <p className="rom-empty">Assign a vehicle to a flow in Sizing to see {what}.</p>

/** Pricing's Return on investment: the claim, the financials and their charts, then the economic
 *  assumptions (editable). While the quote is withheld, one line stands in for the money. */
export function RomFinance({ project, vehicleById, onPatch }: { project: StoredProject; vehicleById: Map<string, Vehicle>; onPatch: (patch: Partial<StoredProject>) => void }) {
  const { model, names, serviceLifeYears } = useRomModel(project, vehicleById)
  if (model.fleet.groups.length === 0) return <Empty what="the return on investment" />
  const claim = roiClaim(model)
  return (
    <div className="rom-view">
      {/* The answer, before the instruments. */}
      {claim.fleet && (
        <p className="rom2-claim">
          <strong>{claim.fleet}.</strong>
          {claim.cost && <span> {claim.cost}.</span>}
          {claim.payback && <span> {claim.payback}.</span>}
        </p>
      )}
      {model.gate.blocked ? (
        // The quote above already says why it is not priced; one line here, not a box of "Not priced" tiles.
        <p className="rom-empty">Payback, net benefit and cost of ownership follow once the quote is priced.</p>
      ) : (
        <>
          <RomKpis fleet={model.fleet} rom={model.rom} flows={model.flows} settings={model.settings} costs={model.costs} serviceLifeYears={serviceLifeYears} names={names} view="finance" />
          <FinanceBento rom={model.rom} vehicleById={vehicleById} serviceLifeYears={serviceLifeYears} />
        </>
      )}
      <EconomicsAssumptions project={project} onPatch={onPatch} />
    </div>
  )
}

/** Simulation's Operations view: the fleet, its gauges and how it works all day, from the static model. */
export function RomOperations({ project, vehicleById }: { project: StoredProject; vehicleById: Map<string, Vehicle> }) {
  const { model, names, serviceLifeYears } = useRomModel(project, vehicleById)
  const opHr = useMemo(() => effDailyOpHr({
    shiftsPerDay: project.shiftsPerDay ?? 1,
    hoursPerShift: project.hoursPerShift ?? 8,
    breaksPerShift: project.breaksPerShift ?? 0,
    breakDurationMin: project.breakDurationMin ?? 0,
  }), [project.shiftsPerDay, project.hoursPerShift, project.breaksPerShift, project.breakDurationMin])
  if (model.fleet.groups.length === 0) return <Empty what="how the fleet operates" />
  return (
    <div className="rom-view">
      <RomKpis fleet={model.fleet} rom={model.rom} flows={model.flows} settings={model.settings} costs={model.costs} serviceLifeYears={serviceLifeYears} names={names} view="operations" />
      <OperationsBento project={project} flows={model.flows} derivedByFlowId={model.derivedByFlowId} fleet={model.fleet} vehicleById={vehicleById} effDailyOpHr={opHr} />
    </div>
  )
}
