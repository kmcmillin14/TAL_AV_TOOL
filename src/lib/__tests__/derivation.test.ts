import { describe, it, expect } from 'vitest'
import { cycleDerivation, chargingDerivation, bufferDerivation } from '../derivation'
import type { CycleBreakdown, FleetGroup } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const breakdown: CycleBreakdown = {
  travelLoadedSec: 30, travelEmptySec: 20, loadSec: 8, unloadSec: 6, liftTimeSec: 0,
  totalSec: 64, methodName: 'Lift', liftHeightFt: 0, routeLayout: 'medium', routeLayoutFactor: 0.5,
}

const vehicle = { calc: {
  voltageV: 100, ratedAh: 100, usableCapacityPct: 100,
  avgPowerDrawKw: 2.5, chargerPowerKw: 3.125,       // R = 4 h, Ch = 3.2 h, duty 55.6%
} } as unknown as Vehicle

const group = (over: Partial<FleetGroup> = {}): FleetGroup => ({
  vehicleId: 'x', groupRaw: 2.4, baseFleet: 3,
  charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625,
    dutyRatio: 0.5556, offShiftCharge: 1, usableKwh: 10, provisional: false, sustainable: true, reason: '' },
  fleetWithCharging: 4, chargingDelta: 1, utilizationDelta: 2, demand: 4.224, fleetSold: 6,
  binding: 'charging', ...over,
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
  it('explains the physical chain: usable → R, Ch, duty, off-shift → availability → +N', () => {
    const d = chargingDerivation(group(), vehicle, { dailyOpHr: 16 })
    const byLabel = Object.fromEntries(d.steps.filter(s => s.result != null).map(s => [s.label, s.result]))
    expect(byLabel['Usable energy']).toBe('10.00 kWh')
    expect(byLabel['Average draw']).toBe('2.50 kW')
    expect(byLabel['Charge input']).toBe('3.13 kW')
    expect(byLabel['Runtime per charge']).toBe('4.0 h')
    expect(byLabel['Recharge time']).toBe('3.2 h')
    expect(byLabel['Duty ratio']).toBe('56%')
    expect(byLabel['Off-shift charge']).toBe('100% of a charge')
    expect(byLabel['Availability']).toBe('63%')
    expect(byLabel['Extra vehicles']).toBe('+1')
    expect(d.steps.find(s => s.label === 'Fleet with charging')!.result).toBe('4')
  })

  it('charging fits the fleet: +0, no fleet-with-charging row', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 18, chargeHr: 3, availability: 1,
                          dutyRatio: 0.857, offShiftCharge: 1, usableKwh: 10, provisional: false, sustainable: true, reason: '' },
              fleetWithCharging: 3, chargingDelta: 0, utilizationDelta: 0, binding: 'utilization' }),
      vehicle, { dailyOpHr: 16 },
    )
    // NB: sec('Availability') is also a step, so filter to rows that carry a result.
    const rows = d.steps.filter(s => s.result != null)
    expect(rows.find(s => s.label === 'Availability')!.result).toBe('100%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+0')
    expect(d.steps.find(s => s.label === 'Fleet with charging')).toBeUndefined()
  })

  it('names the staggering assumption rather than burying it', () => {
    const d = chargingDerivation(group(), vehicle, { dailyOpHr: 16 })
    expect(d.note).toContain('STAGGERED')
    expect(d.note).toContain('One charger per vehicle')
  })
})

describe('bufferDerivation — the additive build-up', () => {
  it('reports base + charging + headroom, and they sum to the fleet', () => {
    const d = bufferDerivation(group(), 0.9)
    const byLabel = Object.fromEntries(d.steps.filter(s => s.result != null).map(s => [s.label, s.result]))
    expect(byLabel['Peak demand']).toBe('3')
    expect(byLabel['+ charging']).toBe('+1')
    expect(byLabel['+ headroom']).toBe('+2')
    const fleet = d.steps.find(s => s.label === 'Fleet (sold)')!
    expect(fleet.sub).toBe('3 + 1 + 2')
    expect(fleet.result).toBe('6')
    expect(fleet.emphasis).toBe(true)
    expect(d.steps.find(s => s.label === 'Binding constraint')!.result).toBe('Charging')
  })

  it('tags the dial in one vocabulary — utilization, never a buffer multiplier', () => {
    const d = bufferDerivation(group(), 0.9)
    expect(d.tag).toBe('Utilization 90%')
    expect(JSON.stringify(d)).not.toMatch(/buffer/i)
  })

  it('says headroom sits on AVAILABLE time, not clock time', () => {
    const d = bufferDerivation(group(), 0.9)
    expect(d.note).toContain('AVAILABLE time')
    expect(d.steps.find(s => s.label === '+ headroom')!.expr).toContain('AVAILABLE')
  })

  it('no battery data → charging costs nothing and says why', () => {
    const g = group({ charging: { ...group().charging, availability: null },
                      chargingDelta: 0, fleetWithCharging: 3, utilizationDelta: 1, fleetSold: 4, binding: 'utilization' })
    const d = bufferDerivation(g, 0.9)
    expect(d.steps.find(s => s.label === '+ charging')!.result).toBe('+0')
    expect(d.steps.find(s => s.label === '+ charging')!.sub).toContain('no battery data')
    expect(d.steps.find(s => s.label === 'Binding constraint')!.result).toBe('Target utilization')
  })
})
