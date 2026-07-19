import { describe, it, expect } from 'vitest'
import { cycleDerivation, chargingDerivation, bufferDerivation } from '../derivation'
import type { CycleBreakdown, FleetGroup } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const breakdown: CycleBreakdown = {
  travelLoadedSec: 30, travelEmptySec: 20, loadSec: 8, unloadSec: 6, liftTimeSec: 0,
  totalSec: 64, methodName: 'Lift', liftHeightFt: 0, routeLayout: 'medium', routeLayoutFactor: 0.5,
}

const vehicle = { calc: { runTimeHr: 4, chargeTimeMin: 192 } } as unknown as Vehicle

const group = (over: Partial<FleetGroup> = {}): FleetGroup => ({
  vehicleId: 'x', groupRaw: 2.4, baseFleet: 3,
  charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625, aEnergy: 0.8, aCap: 0.625, chargingDelta: 2, sustainable: true, reason: '' },
  fleetWithCharging: 5, fleetSold: 6, binding: 'rotation', ...over,
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
  it('explains rotation / weekly energy / availability and +N extra', () => {
    const d = chargingDerivation(group(), vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 })
    const byLabel = Object.fromEntries(d.steps.filter(s => s.result != null).map(s => [s.label, s.result]))
    expect(byLabel['Runtime per charge']).toBe('4.0 h')
    expect(byLabel['Recharge time']).toBe('3.2 h')
    expect(byLabel['Rotation (run : charge)']).toBe('63%')
    expect(byLabel['Weekly energy (off-shift + day-off reset)']).toBe('80%')
    const avail = d.steps.find(s => s.expr === 'min of the two')!
    expect(avail.result).toBe('63%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+2')
  })

  it('charging fits the fleet: +0, no fleet-with-charging row', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 18, chargeHr: 3, availability: 1, aEnergy: 1, aCap: 1, chargingDelta: 0, sustainable: true, reason: '' }, fleetWithCharging: 3, binding: 'utilization' }),
      vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 },
    )
    expect(d.steps.find(s => s.expr === 'min of the two')!.result).toBe('100%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+0')
    expect(d.steps.find(s => s.label === 'Fleet with charging')).toBeUndefined()
  })
})

describe('bufferDerivation', () => {
  it('takes the larger constraint and names the binding one', () => {
    // rotation: 2.4 × 1.10 ÷ 0.625 = 4.224 ; energy: 2.4 ÷ 0.8 = 3.0 → rotation binds
    const d = bufferDerivation(group(), 0.1)
    const rot = d.steps.find(s => s.label === 'Peak need with headroom')!
    expect(rot.result).toBe('4.22')
    const en = d.steps.find(s => s.label === 'Weekly energy sustain')!
    expect(en.result).toBe('3.00')
    const fleet = d.steps.find(s => s.label === 'Fleet (sold)')!
    expect(fleet.sub).toBe('⌈ 4.22 ⌉')
    expect(fleet.result).toBe('6')            // fixture's fleetSold (reported, not recomputed)
    expect(fleet.emphasis).toBe(true)
    expect(d.steps.find(s => s.label === 'Binding constraint')!.result).toBe('Charging rotation')
    expect(d.note).toContain('exactly once')
  })

  it('falls back to utilization-only sizing when availability is unknown', () => {
    const g = group({ charging: { ...group().charging, availability: null, aEnergy: null, aCap: null }, binding: 'utilization' })
    const d = bufferDerivation(g, 0.1)
    const rot = d.steps.find(s => s.label === 'Peak need with headroom')!
    expect(rot.result).toBe('2.64')           // 2.4 × 1.10 (no availability divisor)
    expect(d.steps.find(s => s.label === 'Weekly energy sustain')!.result).toBe('—')
  })
})
