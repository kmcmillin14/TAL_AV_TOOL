import { describe, expect, it } from 'vitest'
import { B56_5_RULE } from '../clearance'
import { routeDistanceFt } from '../layoutEdit'
import { clearanceRule, payloadFt, runFleet, runInputs } from '../runInputs'
import type { SimLayout } from '../types'
import { LIBRARY } from './fixtures'

const byId = new Map(LIBRARY.map(v => [v.id, v]))
const L: SimLayout = {
  points: [
    { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'J', x: 100, y: 0, type: 'junction' },
    { id: 'B', x: 100, y: 100, type: 'stand', role: 'drop' },
  ],
  segments: [{ id: 's1', a: 'A', b: 'J', dir: 'two', lane: 'single' }, { id: 's2', a: 'J', b: 'B', dir: 'two', lane: 'single' }],
}
const flow = { id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }

describe('runInputs', () => {
  it('rounds corners to the fleet turning radius and keeps only linked flows', () => {
    const r = runInputs(L, [flow, { id: 'typed' }], byId, B56_5_RULE, 0)
    expect(r.flows.map(f => f.id)).toEqual(['f'])
    expect(routeDistanceFt(r.layout, 'A', 'B')).toBeLessThan(200)
  })

  it('applies the B56.5 rule: a wall inside the envelope blocks the route', () => {
    const walled = { ...L, objects: [{ id: 'w', x: 20, y: 1, w: 60, h: 1 }] }
    const r = runInputs(walled, [flow], byId, B56_5_RULE, 0)
    expect(r.clearances.find(c => c.segId === 's1')?.status).toBe('violation')
    expect(routeDistanceFt(r.layout, 'A', 'B')).toBe(Infinity)
  })
})

describe('clearanceRule and payloadFt', () => {
  it('uses the stored rule, else the owner rule; a null full-speed value falls back', () => {
    expect(clearanceRule()).toBe(B56_5_RULE)
    expect(clearanceRule({ thresholdFps: 3, lowSpeedIn: 8, fullSpeedIn: null, sharedBetweenVehicles: false })).toEqual({ thresholdFps: 3, lowSpeedIn: 8, fullSpeedIn: 19.69, sharedBetweenVehicles: false })
  })
  it('takes the longest and widest load, each on its own', () => {
    expect(payloadFt([{ lengthIn: 48, widthIn: 40 }, { widthIn: 60 }])).toEqual({ length: 4, width: 5 })
    expect(payloadFt([])).toBeNull()
  })
})

describe('runFleet', () => {
  it('places only types with a linked flow, the stepper value winning over the engine', () => {
    expect(runFleet({ cb18: 3, '8hbc40a': 2 }, { cb18: 5 }, ['cb18', 'cb18'])).toEqual({ cb18: 5 })
    expect(runFleet({ cb18: 3 }, {}, ['cb18', 'm10'])).toEqual({ cb18: 3, m10: 0 })
  })
})
