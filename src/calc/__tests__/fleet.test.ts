import { describe, it, expect } from 'vitest'
import { chargingForGroup, defaultChargeMethod, fleetSummary } from '../fleet'
import type { GroupSummary, FleetSettings } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

describe('defaultChargeMethod', () => {
  it('maps opportunity → opportunity, everything else → plugged', () => {
    expect(defaultChargeMethod('opportunity')).toBe('opportunity')
    expect(defaultChargeMethod('shift_swap')).toBe('plugged')
    expect(defaultChargeMethod('manual')).toBe('plugged')
    expect(defaultChargeMethod(undefined)).toBe('plugged')
  })
})

describe('chargingForGroup', () => {
  // ratedAh 100 × 0.8 DoD = 80 usableAh; dischargeA 10 → runHr 8.
  const base = {
    groupRaw: 4, baseFleet: 4,
    ratedAh: 100, dischargeA: 10, chargeA: 40, chargeTimeMin: 120,
  }

  it('overnight + runtime covers the day → no extra vehicles', () => {
    const r = chargingForGroup({ ...base, method: 'plugged', regime: 'overnight', dailyOpHr: 8 })
    expect(r.runHr).toBeCloseTo(8, 5)
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
    expect(r.sustainable).toBe(true)
  })

  it('plugged + continuous → availability = runHr/(runHr+chargeHr)', () => {
    const r = chargingForGroup({ ...base, method: 'plugged', regime: 'continuous', dailyOpHr: 24 })
    expect(r.chargeHr).toBeCloseTo(2, 5)            // 120 min
    expect(r.availability).toBeCloseTo(8 / 10, 5)   // 0.8
    expect(r.chargingDelta).toBe(1)                 // ⌈4 / 0.8⌉ − 4 = 1
  })

  it('opportunity + continuous → availability = chargeA/(chargeA+dischargeA)', () => {
    const r = chargingForGroup({ ...base, chargeA: 10, method: 'opportunity', regime: 'continuous', dailyOpHr: 24 })
    expect(r.availability).toBeCloseTo(10 / 20, 5)  // 0.5
    expect(r.chargingDelta).toBe(4)                 // ⌈4 / 0.5⌉ − 4 = 4
  })

  it('overnight but runtime < day → still uses availability model', () => {
    const r = chargingForGroup({ ...base, method: 'plugged', regime: 'overnight', dailyOpHr: 16 })
    expect(r.chargingDelta).toBe(1)
  })

  it('missing data → not sustainable, no NaN, delta 0', () => {
    const r = chargingForGroup({ ...base, ratedAh: 0, method: 'plugged', regime: 'continuous', dailyOpHr: 24 })
    expect(r.sustainable).toBe(false)
    expect(r.runHr).toBeNull()
    expect(r.chargingDelta).toBe(0)
  })
})

describe('fleetSummary', () => {
  const grp = (vehicleId: string, groupRaw: number, baseFleet: number): GroupSummary => ({
    vehicleId, flowsCount: 1, baseThru: 0, avgCycleSec: null, groupRaw, baseFleet, headroom: null,
  })
  const veh = (id: string, calc: Partial<Vehicle['calc']>, chargerType: string): Vehicle =>
    ({ id, calc: { ratedAh: 100, dischargeA: 10, chargeA: 40, chargeTimeMin: 120, chargerType, ...calc } } as unknown as Vehicle)

  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.10, dailyOpHr: 24, chargeMethods: {}, ...over,
  })

  it('runs base → +charging → ×buffer → ⌈⌉ and totals', () => {
    const groups = [grp('a', 4, 4)]
    const byId = new Map([['a', veh('a', { chargeA: 10 }, 'opportunity')]]) // A = 10/20 = 0.5
    const s = fleetSummary(groups, byId, settings())
    const g = s.groups[0]
    expect(g.charging.chargingDelta).toBe(4)        // ⌈4/0.5⌉ − 4
    expect(g.fleetWithCharging).toBe(8)
    expect(g.fleetSold).toBe(9)                     // ⌈8 × 1.10⌉ = 9
    expect(s.totalBaseFleet).toBe(4)
    expect(s.totalChargingDelta).toBe(4)
    expect(s.totalFleetSold).toBe(9)
  })

  it('bufferPct 0 is a no-op; per-vehicle method override applies', () => {
    const groups = [grp('a', 4, 4)]
    const byId = new Map([['a', veh('a', {}, 'opportunity')]])
    // Override to plugged: A = 8/(8+2) = 0.8 → delta 1 → fleetWithCharging 5.
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0, chargeMethods: { a: 'plugged' } }))
    expect(s.groups[0].charging.method).toBe('plugged')
    expect(s.groups[0].fleetWithCharging).toBe(5)
    expect(s.groups[0].fleetSold).toBe(5)           // buffer 0 → no change
  })

  it('skips groups with no base fleet', () => {
    const s = fleetSummary([grp('a', 0, 0)], new Map(), settings())
    expect(s.groups).toHaveLength(0)
    expect(s.totalFleetSold).toBe(0)
  })
})
