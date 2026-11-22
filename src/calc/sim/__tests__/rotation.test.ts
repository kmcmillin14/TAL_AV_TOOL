import { describe, expect, it } from 'vitest'
import medium from '@/src/content/samples/simulate-racks-medium.json'
import { simLayoutSchema } from '@/src/lib/validations/simSchemas'
import { B56_5_RULE } from '../clearance'
import { createSim, step } from '../engine'
import { runInputs } from '../runInputs'
import type { SimLayout } from '../types'
import { LIBRARY } from './fixtures'

describe('off-shift charger rotation (owner, 2026-11-22)', () => {
  it('with more vehicles than chargers, every vehicle starts the next day nearly full, and none trade chargers all night', () => {
    const byId = new Map(LIBRARY.map(v => [v.id, v]))
    const layout = simLayoutSchema.parse(medium.layout) as SimLayout
    const inputs = runInputs(layout, medium.flows as never, byId, B56_5_RULE, {}, [])
    const vid = inputs.flows[0].vehicleId
    // The medium site has 6 chargers and 2 parking spots: 7 vehicles leaves one parked each night.
    const S = createSim(inputs.layout, inputs.flows, [...byId.values()], { fleet: { [vid]: 7 }, demandPct: 100, seed: 1, arrivals: 'regular', pacePct: 70, trafficPct: 0, safetyFt: 3, staffedHr: 8, daysPerWeek: 7, shiftHr: 8, targetUtilization: 0.9 } as never)!
    while (S.t < 86400) step(S)
    const max = S.veh[0].prof.battery!.maxSocPct
    expect(Math.min(...S.veh.map(v => v.soc))).toBeGreaterThan(max - 6)
    expect(S.veh.every(v => v.mode === 'home')).toBe(true)
  }, 120000)
})
