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
  charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625, chargingDelta: 2, sustainable: true, reason: '' },
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
})

describe('chargingDerivation', () => {
  it('plugged, overlapping: availability = runtime ÷ (runtime + recharge), +N extra', () => {
    const d = chargingDerivation(group(), vehicle, { regime: 'continuous', dailyOpHr: 16 })
    const avail = d.steps.find(s => s.label === 'Availability')!
    expect(avail.expr).toBe('runtime ÷ (runtime + recharge)')
    expect(avail.result).toBe('63%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+2')
  })

  it('overnight where one charge covers the day: 100% availability, +0', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 18, chargeHr: 3, availability: 1, chargingDelta: 0, sustainable: true, reason: '' }, fleetWithCharging: 3 }),
      vehicle, { regime: 'overnight', dailyOpHr: 16 },
    )
    expect(d.steps.find(s => s.label === 'Recharges off-shift')!.result).toBe('100%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+0')
  })
})

describe('bufferDerivation', () => {
  it('rounds (base + charging) × (1 + buffer) up to fleet sold', () => {
    const d = bufferDerivation(group(), 0.1)
    expect(d.tag).toBe('Buffer 10%')
    const fleet = d.steps.find(s => s.label === 'Fleet (sold)')!
    expect(fleet.sub).toBe('⌈ 5 × 1.10 ⌉')
    expect(fleet.result).toBe('6')
    expect(fleet.emphasis).toBe(true)
  })
})
