import { describe, it, expect } from 'vitest'
import { cycleDerivation, chargingDerivation, bufferDerivation } from '../derivation'
import type { CycleBreakdown, FleetGroup } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const breakdown: CycleBreakdown = {
  travelLoadedSec: 30, travelEmptySec: 20, loadSec: 8, unloadSec: 6, liftTimeSec: 0,
  totalSec: 64, methodName: 'Lift', liftHeightFt: 0, routeLayout: 'medium', routeLayoutFactor: 0.5,
}

const vehicle = { calc: { ratedAh: 200, dischargeA: 40, chargeA: 50, chargeTimeMin: undefined } } as unknown as Vehicle

const group = (over: Partial<FleetGroup> = {}): FleetGroup => ({
  vehicleId: 'x', groupRaw: 2.4, baseFleet: 3,
  charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625, aEnergy: null, aCap: null, chargingDelta: 2, sustainable: true, reason: '' },
  fleetWithCharging: 5, fleetSold: 6, ...over,
})

describe('cycleDerivation', () => {
  it('sums the cycle steps and divides throughput × cycle ÷ 3600', () => {
    const d = cycleDerivation(breakdown, {
      distanceFt: 150, thruPerHr: 20, speedLoadedFps: 5, speedUnloadedFps: 5, liftSpeedFps: null, rawVehicles: 0.356,
    })
    const cycle = d.steps.find(s => s.label === 'Cycle time')!
    expect(cycle.result).toBe('64.0s')
    expect(cycle.emphasis).toBe(true)
    const count = d.steps.find(s => s.label === 'Vehicle count')!
    expect(count.expr).toContain('÷ 3600')
    expect(count.result).toBe('0.36')
    expect(d.note).toContain('÷3600')
  })

  it('lists every input variable with its value', () => {
    const d = cycleDerivation(breakdown, {
      distanceFt: 150, thruPerHr: 20, speedLoadedFps: 5, speedUnloadedFps: 4, liftSpeedFps: null, rawVehicles: 0.356,
    })
    const inputs = d.steps.filter(s => s.kind === 'input')
    const byLabel = Object.fromEntries(inputs.map(s => [s.label, s.result]))
    expect(byLabel['Distance (one-way leg)']).toBe('150.0 ft')
    expect(byLabel['Loaded speed']).toBe('5.0 ft/s')
    expect(byLabel['Empty speed']).toBe('4.0 ft/s')
    expect(byLabel['Route pace']).toBe('×0.5')
    expect(byLabel['Load (Lift)']).toBe('8.0 s')
    expect(byLabel['Throughput']).toBe('20 /hr')
  })
})

describe('chargingDerivation', () => {
  it('explains energy / capacity / availability and +N extra', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625, aEnergy: 0.8, aCap: 0.625, chargingDelta: 2, sustainable: true, reason: '' } }),
      vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 },
    )
    expect(d.steps.find(s => s.label === 'Energy (off-shift + days-off reset)')!.result).toBe('80%')
    expect(d.steps.find(s => s.label === 'Capacity (battery vs window)')!.result).toBe('63%')
    const avail = d.steps.find(s => s.expr === 'min of the two')!
    expect(avail.label).toBe('Availability')
    expect(avail.result).toBe('63%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+2')
  })

  it('charging fits the fleet: +0, no fleet-with-charging row', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 18, chargeHr: 3, availability: 1, aEnergy: 1, aCap: 1, chargingDelta: 0, sustainable: true, reason: '' }, fleetWithCharging: 3 }),
      vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 },
    )
    expect(d.steps.find(s => s.expr === 'min of the two')!.result).toBe('100%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+0')
    expect(d.steps.find(s => s.label === 'Fleet with charging')).toBeUndefined()
  })
})

describe('bufferDerivation', () => {
  it('buffers the unrounded availability-adjusted demand, rounded up once', () => {
    // demand = groupRaw ÷ availability = 2.4 ÷ 0.625 = 3.84 (unrounded)
    const d = bufferDerivation(group(), 0.1)
    expect(d.tag).toBe('Buffer 10%')
    const demand = d.steps.find(s => s.label === 'Demand with charging')!
    expect(demand.sub).toBe('2.40 ÷ 0.63')
    expect(demand.result).toBe('3.84')
    const fleet = d.steps.find(s => s.label === 'Fleet (sold)')!
    expect(fleet.sub).toBe('⌈ 3.84 × 1.10 ⌉')
    expect(fleet.result).toBe('6')          // fixture's fleetSold (reported, not recomputed)
    expect(fleet.emphasis).toBe(true)
    expect(d.note).toContain('exactly once')
  })

  it('falls back to raw demand when availability is unknown', () => {
    const g = group({ charging: { ...group().charging, availability: null } })
    const d = bufferDerivation(g, 0.1)
    const demand = d.steps.find(s => s.label === 'Demand with charging')!
    expect(demand.expr).toBe('raw demand')
    expect(demand.result).toBe('2.40')
  })
})
