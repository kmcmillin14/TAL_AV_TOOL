import { describe, expect, it } from 'vitest'
import { createSim, runFor } from '../engine'
import { results } from '../results'
import type { SimFlow, SimLayout } from '../types'
import { LIBRARY, settings } from './fixtures'

/**
 * A one-way loop (east along the bottom, west along the top) with two stops in series on the top
 * lane (R1 then R2, one behind the other — a rack aisle with two racks), docks on the bottom lane and
 * chargers on a spur. Before the ordered-queue rule a vehicle bound for the far stop reserved it while
 * queued behind one working the near stop, which then could not drive on: a gridlock.
 */
export function loopWithStopsInSeries(): { layout: SimLayout; flows: SimFlow[] } {
  const layout: SimLayout = {
    points: [
      { id: 'SW', x: 0, y: 60, type: 'junction' }, { id: 'SE', x: 200, y: 60, type: 'junction' },
      { id: 'NE', x: 200, y: 0, type: 'junction' }, { id: 'NW', x: 0, y: 0, type: 'junction' },
      { id: 'IN', x: 40, y: 60, type: 'dock', role: 'pick', name: 'Dock In' },
      { id: 'OUT', x: 90, y: 60, type: 'dock', role: 'drop', name: 'Dock Out' },
      { id: 'J', x: 150, y: 60, type: 'junction' },
      { id: 'C1', x: 150, y: 80, type: 'charger', name: 'Charger 1' }, { id: 'J2', x: 170, y: 60, type: 'junction' },
      { id: 'C2', x: 170, y: 80, type: 'charger', name: 'Charger 2' }, { id: 'J3', x: 185, y: 60, type: 'junction' },
      { id: 'C3', x: 185, y: 80, type: 'charger', name: 'Charger 3' },
      { id: 'R1', x: 130, y: 0, type: 'stand', role: 'pickDrop', name: 'R1' },
      { id: 'R2', x: 110, y: 0, type: 'stand', role: 'pickDrop', name: 'R2' },
    ],
    segments: [
      { id: 'a', a: 'SW', b: 'IN', dir: 'ab' }, { id: 'b', a: 'IN', b: 'OUT', dir: 'ab' }, { id: 'c', a: 'OUT', b: 'J', dir: 'ab' },
      { id: 'd', a: 'J', b: 'J2', dir: 'ab' }, { id: 'e', a: 'J2', b: 'J3', dir: 'ab' }, { id: 'f', a: 'J3', b: 'SE', dir: 'ab' },
      { id: 'g', a: 'SE', b: 'NE', dir: 'ab' }, { id: 'h', a: 'NE', b: 'R1', dir: 'ab' }, { id: 'i', a: 'R1', b: 'R2', dir: 'ab' },
      { id: 'k', a: 'R2', b: 'NW', dir: 'ab' }, { id: 'l', a: 'NW', b: 'SW', dir: 'ab' },
      { id: 's1', a: 'J', b: 'C1', dir: 'two', lane: 'single' }, { id: 's2', a: 'J2', b: 'C2', dir: 'two', lane: 'single' },
      { id: 's3', a: 'J3', b: 'C3', dir: 'two', lane: 'single' },
    ],
  }
  const f = (id: string, from: string, to: string, thruPerHr: number): SimFlow => ({ id, fromPointId: from, toPointId: to, thruPerHr, vehicleId: 'cb18' })
  // R2 (the far stop) is visited more than R1, so vehicles bound for it often queue behind one at R1.
  return { layout, flows: [f('in1', 'IN', 'R1', 10), f('in2', 'IN', 'R2', 22), f('out1', 'R1', 'OUT', 10), f('out2', 'R2', 'OUT', 22)] }
}

describe('ordered queue: stops in series on one lane (owner, 2026-11-18)', () => {
  it.each([1, 2, 3, 4, 5])('no gridlock over a day with three vehicles (seed %i)', seed => {
    const { layout, flows } = loopWithStopsInSeries()
    const S = createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, seed, arrivals: 'random', staffedHr: 24 }))!
    runFor(S, 24 * 3600)
    const R = results(S)
    expect(R.gridlock).toBeNull()
    expect(R.types[0].done).toBeGreaterThan(400)
  })
})
