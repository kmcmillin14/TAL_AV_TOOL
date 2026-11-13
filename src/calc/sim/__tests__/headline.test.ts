import { describe, expect, it } from 'vitest'
import { runHeadline } from '../headline'
import type { FleetGroup, FleetSummary } from '@/src/calc/types'
import type { SimResults, TypeResult } from '../types'

const group = (vehicleId: string, groupRaw: number, fleetSold: number, availability: number, runHr: number): FleetGroup =>
  ({ vehicleId, groupRaw, fleetSold, charging: { availability, runHr } }) as unknown as FleetGroup
const fleet: FleetSummary = { groups: [group('a', 2.4, 3, 0.9, 6), group('b', 1, 2, 1, 8)], targetUtilization: 0.85 } as unknown as FleetSummary
const pass = { orders: true, utilization: true, battery: true as boolean | null }
const type = (vehicleId: string, o: Partial<TypeResult>): TypeResult => ({
  vehicleId, fleet: 3, target: 40, perHr: 40, done: 100, avgWait: 10, utilization: 0.8, socMin: 40, chargeTrips: 2,
  checks: pass, battery: { dayStarts: [100, 98, 97], chargeWaitSec: 0, floorPct: 20, why: null }, verdict: 'meets', ...o,
}) as TypeResult
const run = (types: TypeResult[], o: Partial<SimResults> = {}) => ({ verdict: 'meets', gridlock: null, types, ...o }) as unknown as SimResults
const flowsA = [{ vehicleId: 'a', thruPerHr: 40 }]

describe('Run headline: the static calc beside the simulation, and the three checks', () => {
  it('before a run: the static calc only, for the types placed', () => {
    const h = runHeadline(fleet, { a: 3 }, null, [...flowsA, { vehicleId: 'z', thruPerHr: 99 }], 125)
    expect(h.fleet).toEqual({ static: 3, tested: 3 })
    expect(h.utilization.static).toBeCloseTo(2.4 / (3 * 0.9))
    expect(h.perHr).toMatchObject({ simulated: null, target: 50, pass: null })
    expect(h.battery).toMatchObject({ socMin: null, runHr: 6, pass: null })
    expect(h.outcome).toBeNull()
  })

  it('all three pass: right-sized; one fewer passing too: oversized by 1', () => {
    const r = run([type('a', {})])
    expect(runHeadline(fleet, { a: 3 }, r, flowsA, 100).outcome).toBe('right')
    expect(runHeadline(fleet, { a: 3 }, r, flowsA, 100, { oneFewer: { a: 'meets' } }).outcome).toBe('over')
    expect(runHeadline(fleet, { a: 3 }, r, flowsA, 100, { oneFewer: { a: 'short' } }).outcome).toBe('right')
  })

  it('totals across types: utilization by fleet, wait by moves done, the lowest charge', () => {
    const r = run([type('a', { fleet: 4, utilization: 0.9, done: 300, avgWait: 20, socMin: 30 }), type('b', { fleet: 2, utilization: 0.6, done: 100, avgWait: 4, perHr: 12, target: 12 })])
    const h = runHeadline(fleet, { a: 4, b: 2 }, r, [{ vehicleId: 'a', thruPerHr: 40 }, { vehicleId: 'b', thruPerHr: 12 }], 100)
    expect(h.fleet).toEqual({ static: 5, tested: 6 })
    expect(h.utilization.static).toBeCloseTo(3.4 / (3 * 0.9 + 2))
    expect(h.utilization.simulated).toBeCloseTo((0.9 * 4 + 0.6 * 2) / 6)
    expect(h.waitSec).toBeCloseTo((20 * 300 + 4 * 100) / 400)
    expect(h.battery).toMatchObject({ socMin: 30, chargeTrips: 4 })
  })

  it('a fleet that cannot keep up: utilization over 100%, undersized, and the check that sets the fleet', () => {
    const r = run([type('a', { fleet: 1, utilization: 0.97, perHr: 16, checks: { ...pass, orders: false } })], { verdict: 'short' })
    const h = runHeadline(fleet, { a: 1 }, r, flowsA, 100)
    expect(h.utilization.simulated).toBeCloseTo(0.97 * 40 / 16)
    expect(h).toMatchObject({ outcome: 'under', perHr: { pass: false }, utilization: { pass: false, tone: 'bad' } })
    expect(h.setsFleet).toEqual({ check: 'orders', n: 3 })                       // orders and utilization both need 3; the first named wins
  })

  it('over the target utilization alone fails; the target can be changed for the simulation', () => {
    const r = run([type('a', { utilization: 0.88 })])
    expect(runHeadline(fleet, { a: 3 }, r, flowsA, 100).outcome).toBe('under')
    expect(runHeadline(fleet, { a: 3 }, r, flowsA, 100, { targetUtilization: 0.9 }).outcome).toBe('right')
  })

  it('battery: not judged under two days; a failure names why', () => {
    const short = run([type('a', { checks: { ...pass, battery: null } })])
    expect(runHeadline(fleet, { a: 3 }, short, flowsA, 100)).toMatchObject({ outcome: 'right', battery: { pass: null } })
    const flat = run([type('a', { checks: { ...pass, battery: false }, battery: { dayStarts: [], chargeWaitSec: 0, floorPct: 20, why: 'a vehicle reached the 20% floor' } })])
    const h = runHeadline(fleet, { a: 3 }, flat, flowsA, 100)
    expect(h).toMatchObject({ outcome: 'under', setsFleet: { check: 'battery', n: 4 }, battery: { why: 'a vehicle reached the 20% floor' } })
  })

  it('nothing run reads as not run; a type placing no vehicle is left out', () => {
    const empty = runHeadline(fleet, { a: 3 }, run([]), [], 100)
    expect(empty).toMatchObject({ notRun: true, outcome: 'notRun', verdictTone: 'bad' })
    expect(runHeadline(fleet, { a: 3 }, null, [], 100, { unrunnable: true }).outcome).toBe('notRun')
    expect(runHeadline(fleet, { a: 0, b: 2 }, run([type('a', { fleet: 0, socMin: 0 }), type('b', { fleet: 2, socMin: 55 })]), [], 100).battery.socMin).toBe(55)
  })
})
