import { describe, expect, it } from 'vitest'
import { roundCorners } from '../corners'
import { linkFlow, measureFlows, routeDistanceFt } from '../layoutEdit'
import type { SimLayout } from '../types'

/** A (0,0) → J (100,0) → B (100,100): one 90° corner at a plain junction. */
const L = (dir: 'two' | 'ab' | 'ba' = 'two'): SimLayout => ({
  points: [
    { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' },
    { id: 'J', x: 100, y: 0, type: 'junction' },
    { id: 'B', x: 100, y: 100, type: 'stand', role: 'drop' },
  ],
  segments: [{ id: 's1', a: 'A', b: 'J', dir }, { id: 's2', a: 'J', b: 'B', dir }],
})

describe('rounded corners (acceptance 13)', () => {
  it('a 90° corner is shorter than the square one by (2 − π/2) × r', () => {
    const r = 4.82                                      // CB18 turning radius
    const square = routeDistanceFt(L(), 'A', 'B')
    const round = routeDistanceFt(roundCorners(L(), r), 'A', 'B')
    expect(square - round).toBeCloseTo((2 - Math.PI / 2) * r, 1)
  })

  it('keeps one-way routes one-way through the corner', () => {
    const R = roundCorners(L('ab'), 5)
    expect(routeDistanceFt(R, 'A', 'B')).toBeLessThan(200)
    expect(routeDistanceFt(R, 'B', 'A')).toBe(Infinity)
  })

  it('leaves turn-in-place vehicles, equipment points, intersections and tight corners square', () => {
    const drawn = L()
    expect(roundCorners(drawn, 0)).toBe(drawn)
    const atStand = { ...L(), points: L().points.map(p => (p.id === 'J' ? { ...p, type: 'stand' as const } : p)) }
    expect(roundCorners(atStand, 5).segments).toHaveLength(2)
    const cross = { ...L(), points: [...L().points, { id: 'C', x: 200, y: 0, type: 'junction' as const }], segments: [...L().segments, { id: 's3', a: 'J', b: 'C', dir: 'two' as const }] }
    expect(roundCorners(cross, 5).segments).toHaveLength(3)
    expect(roundCorners(L(), 150).segments).toHaveLength(2)    // the arc would not fit on 100 ft routes
  })
})

describe('Sizing distance of a linked flow follows the rounded corner of its vehicle', () => {
  it('uses the flow vehicle turning radius; a turn-in-place vehicle drives the square corner', () => {
    const f = linkFlow(L(), { id: 'f', vehicleId: 'cb18' } as { id: string; vehicleId?: string; distanceFt?: number }, 'A', 'B')
    const r = (id?: string) => (id === 'cb18' ? 4.82 : 0)
    expect(measureFlows(L(), [f], r)[0].distanceFt).toBeCloseTo(200 - (2 - Math.PI / 2) * 4.82, 1)
    expect(measureFlows(L(), [{ ...f, vehicleId: 'turnsInPlace' }], r)[0].distanceFt).toBe(200)
  })
})
