import { describe, expect, it } from 'vitest'
import { runHeadline } from '../headline'
import type { FleetGroup, FleetSummary } from '@/src/calc/types'
import type { SimResults, TypeResult } from '../types'

const group = (vehicleId: string, groupRaw: number, fleetSold: number, availability: number, runHr: number): FleetGroup =>
  ({ vehicleId, groupRaw, fleetSold, charging: { availability, runHr } }) as unknown as FleetGroup
const fleet: FleetSummary = { groups: [group('a', 2.4, 3, 0.9, 6), group('b', 1, 2, 1, 8)], targetUtilization: 0.85 } as unknown as FleetSummary
const type = (vehicleId: string, o: Partial<TypeResult>): TypeResult => ({ vehicleId, fleet: 3, target: 40, perHr: 38, delivered: 100, avgWait: 10, utilization: 0.8, socMin: 40, chargeTrips: 2, ...o }) as TypeResult

describe('Run headline: the static calc beside the simulation', () => {
  it('before a run: the static calc only, for the types placed', () => {
    const h = runHeadline(fleet, { a: 3 }, null, 50)
    expect(h.fleet).toEqual({ static: 3, tested: 3 })
    expect(h.utilization.static).toBeCloseTo(2.4 / (3 * 0.9))
    expect(h.utilization.simulated).toBeNull()
    expect(h.perHr).toEqual({ simulated: null, target: 50 })
    expect(h.battery).toEqual({ socMin: null, chargeTrips: null, runHr: 6 })
    expect(h.verdict).toBeNull()
  })

  it('after a run: totals across types, utilization by fleet, wait by moves, the lowest charge', () => {
    const res = { verdict: 'tight', gridlock: null, types: [type('a', { fleet: 4, utilization: 0.9, delivered: 300, avgWait: 20, socMin: 30 }), type('b', { fleet: 2, utilization: 0.6, delivered: 100, avgWait: 4, perHr: 10, target: 12 })] } as unknown as SimResults
    const h = runHeadline(fleet, { a: 4, b: 2 }, res, 0)
    expect(h.fleet).toEqual({ static: 5, tested: 6 })
    expect(h.utilization.static).toBeCloseTo(3.4 / (3 * 0.9 + 2))
    expect(h.utilization.simulated).toBeCloseTo((0.9 * 4 + 0.6 * 2) / 6)
    expect(h.perHr).toEqual({ simulated: 48, target: 52 })
    expect(h.waitSec).toBeCloseTo((20 * 300 + 4 * 100) / 400)
    expect(h.battery).toMatchObject({ socMin: 30, chargeTrips: 4, runHr: 6 })
    expect(h.verdict).toBe('tight')
    expect(runHeadline(fleet, { a: 4 }, { ...res, gridlock: { t: 1 } } as unknown as SimResults, 0).verdict).toBe('gridlock')
  })
})
