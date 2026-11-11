import { describe, expect, it } from 'vitest'
import cb18 from '@/src/content/vehicles/cb18.json'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { defaultChargeRegime, fleetFromFlows, fleetSummary } from '../fleet'
import { flowDerived, groupSummary } from '../flowMetrics'
import type { Flow, FleetSettings } from '../types'

const V = cb18 as unknown as Vehicle
const byId = new Map([[V.id, V]])
const settings: FleetSettings = { regime: defaultChargeRegime(16), targetUtilization: 0.9, dailyOpHr: 16, chargeMethods: {} }
const flows: Flow[] = [
  { id: 'a', origin: 'A', destination: 'B', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
  { id: 'b', origin: 'C', destination: 'D', distanceFt: 500, thruPerHr: 12, routeLayout: 'high', liftHeightFt: 3, vehicleId: 'cb18' },
]

describe('fleetFromFlows', () => {
  it('is exactly the Sizing chain: flowDerived → groupSummary → fleetSummary', () => {
    const derived = new Map(flows.map(f => [f.id, flowDerived(f, V)]))
    const byHand = fleetSummary([groupSummary('cb18', flows, derived)], byId, settings)
    expect(fleetFromFlows(flows, byId, settings)).toEqual(byHand)
  })
})
