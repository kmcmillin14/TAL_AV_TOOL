import { describe, expect, it } from 'vitest'
import { B56_5_RULE } from '../clearance'
import { routeDistanceFt } from '../layoutEdit'
import { runInputs } from '../runInputs'
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
