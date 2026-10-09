import { describe, it, expect } from 'vitest'
import { chargingForGroup, defaultChargeMethod, defaultChargeRegime, fleetSummary, type BatterySpec } from '../fleet'
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

describe('chargingForGroup (v4 physical-input availability)', () => {
  /** 10 kWh usable, 1 kW draw, 1 kW charger → R = Ch = 10 h, duty 50%. */
  const BASE: BatterySpec = {
    voltageV: 100, ratedAh: 100, usableCapacityPct: 100,
    avgPowerDrawKw: 1, chargerPowerKw: 1,
  }
  const call = (over: Partial<BatterySpec>, staffedHr: number) =>
    chargingForGroup({ battery: { ...BASE, ...over }, method: 'plugged', staffedHr })

  it('24/7 → the bare duty ratio; no off-shift to credit', () => {
    const r = call({}, 24)
    expect(r.dutyRatio).toBeCloseTo(0.5, 10)
    expect(r.offShiftCharge).toBe(0)
    expect(r.availability).toBeCloseTo(0.5, 10)
    expect(r.sustainable).toBe(true)
  })

  it('a long off-shift fully recharges, so the start charge is free', () => {
    // H = 8 → 16 h idle ≥ 10 h recharge → z = 1, and R = 10 h ≥ H.
    const r = call({}, 8)
    expect(r.offShiftCharge).toBe(1)
    expect(r.availability).toBe(1)
  })

  it('a partial off-shift gives a partial start charge', () => {
    const r = call({}, 18)                 // 6 h idle / 10 h recharge → z = 0.6
    expect(r.offShiftCharge).toBeCloseTo(0.6, 10)
    expect(r.availability!).toBeGreaterThan(r.dutyRatio!)
    expect(r.availability!).toBeLessThan(1)
  })

  it('a faster charger raises the duty ratio; capacity does not', () => {
    expect(call({ chargerPowerKw: 3 }, 24).dutyRatio).toBeCloseTo(0.75, 10)
    expect(call({ ratedAh: 1000 }, 24).dutyRatio).toBeCloseTo(0.5, 10)
  })

  it('reports which physical input is missing, and stays unsustainable', () => {
    for (const [over, reason] of [
      [{ ratedAh: 0 }, 'capacity'], [{ usableCapacityPct: 0 }, 'usable'],
      [{ avgPowerDrawKw: 0 }, 'average draw'], [{ chargerPowerKw: 0 }, 'charge input'],
    ] as const) {
      const r = call(over, 16)
      expect(r.sustainable).toBe(false)
      expect(r.availability).toBeNull()
      expect(r.reason.toLowerCase()).toContain(reason)
    }
  })
})

describe('fleetSummary (v4 — one constraint, additive waterfall)', () => {
  const grp = (vehicleId: string, groupRaw: number, baseFleet: number): GroupSummary => ({
    vehicleId, flowsCount: 1, baseThru: 0, avgCycleSec: null, groupRaw, baseFleet, headroom: null,
  })
  /** 10 kWh usable; draw/charge in kW set the duty ratio directly. */
  const veh = (id: string, avgPowerDrawKw: number, chargerPowerKw: number): Vehicle =>
    ({ id, calc: { voltageV: 100, ratedAh: 100, usableCapacityPct: 100,
                   avgPowerDrawKw, chargerPowerKw, chargerType: 'opportunity' } } as unknown as Vehicle)

  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', targetUtilization: 0.8, dailyOpHr: 24, chargeMethods: {}, ...over,
  })

  it('base + charging + headroom === sold, for every group and in total', () => {
    const byId = new Map([['a', veh('a', 1, 1)], ['b', veh('b', 1, 4)]])
    const s = fleetSummary([grp('a', 4, 4), grp('b', 4, 4)], byId, settings())
    expect(s.groups).toHaveLength(2)
    for (const g of s.groups) {
      expect(g.baseFleet + g.chargingDelta + g.utilizationDelta).toBe(g.fleetSold)
    }
    expect(s.totalBaseFleet + s.totalChargingDelta + s.totalUtilizationDelta).toBe(s.totalFleetSold)
  })

  it('charging binds at 24/7 — duty 50% doubles the fleet before headroom', () => {
    const byId = new Map([['a', veh('a', 1, 1)]])
    const g = fleetSummary([grp('a', 4, 4)], byId, settings()).groups[0]
    expect(g.charging.availability).toBeCloseTo(0.5, 10)
    expect(g.fleetWithCharging).toBe(8)        // ⌈4 / 0.5⌉
    expect(g.chargingDelta).toBe(4)
    expect(g.fleetSold).toBe(10)               // ⌈4 / (0.5 × 0.8)⌉
    expect(g.utilizationDelta).toBe(2)
    expect(g.binding).toBe('charging')
  })

  it('charging costs nothing when the battery covers the window', () => {
    const byId = new Map([['a', veh('a', 1, 1)]])
    const g = fleetSummary([grp('a', 8, 8)], byId, settings({ dailyOpHr: 8 })).groups[0]
    expect(g.charging.availability).toBe(1)
    expect(g.chargingDelta).toBe(0)
    expect(g.fleetSold).toBe(10)               // ⌈8 / 0.8⌉ — headroom only
    expect(g.binding).toBe('utilization')
  })

  it('REGRESSION: the charging delta does NOT move with the utilization dial', () => {
    // Charging is costed FIRST so it stays a pure platform property. v3 reported
    // a charging number that shifted whenever the headroom policy changed.
    const byId = new Map([['a', veh('a', 1, 1)]])
    const deltas = [0.7, 0.8, 0.9, 1.0].map(u =>
      fleetSummary([grp('a', 4, 4)], byId, settings({ targetUtilization: u })).groups[0].chargingDelta)
    expect(new Set(deltas).size).toBe(1)
    expect(deltas[0]).toBe(4)
  })

  it('a faster charger needs fewer vehicles for the same work', () => {
    const byId = new Map([['slow', veh('slow', 1, 1)], ['fast', veh('fast', 1, 9)]])
    const s = fleetSummary([grp('slow', 4, 4), grp('fast', 4, 4)], byId, settings())
    const [slow, fast] = ['slow', 'fast'].map(id => s.groups.find(g => g.vehicleId === id)!)
    expect(fast.fleetSold).toBeLessThan(slow.fleetSold)
    expect(fast.chargingDelta).toBeLessThan(slow.chargingDelta)
  })

  it('rounds ONCE at the end and baseFleet stays the physical floor', () => {
    const byId = new Map([['a', veh('a', 1, 1)]])
    const groups = [grp('a', 4.05, 5)]
    const s = fleetSummary(groups, byId, settings({ dailyOpHr: 8, targetUtilization: 0.87 }))
    expect(s.groups[0].charging.availability).toBe(1)
    expect(s.groups[0].fleetSold).toBe(5)      // ⌈4.05 / 0.87⌉ = ⌈4.66⌉ = 5
    const s0 = fleetSummary(groups, byId, settings({ dailyOpHr: 8, targetUtilization: 1 }))
    expect(s0.groups[0].fleetSold).toBe(5)     // max(baseFleet 5, ⌈4.05⌉)
  })

  it('no battery data → charging costs nothing, headroom still applies', () => {
    const s = fleetSummary([grp('a', 4, 4)], new Map(), settings())
    const g = s.groups[0]
    expect(g.charging.sustainable).toBe(false)
    expect(g.chargingDelta).toBe(0)
    expect(g.fleetSold).toBe(5)                // ⌈4 / 0.8⌉
    expect(g.binding).toBe('utilization')
  })

  it('REGRESSION: no v3 energy branch survives on the group', () => {
    const byId = new Map([['a', veh('a', 1, 1)]])
    const g = fleetSummary([grp('a', 4, 4)], byId, settings()).groups[0]
    expect('demandEnergy' in g).toBe(false)
    expect('demandRotation' in g).toBe(false)
    expect('aEnergy' in g.charging).toBe(false)
    expect('aCap' in g.charging).toBe(false)
  })

  it('skips groups with no base fleet', () => {
    const s = fleetSummary([grp('a', 0, 0)], new Map(), settings())
    expect(s.groups).toHaveLength(0)
    expect(s.totalFleetSold).toBe(0)
  })
})

describe('defaultChargeRegime', () => {
  it('derives continuous for full-day coverage, overnight otherwise', () => {
    expect(defaultChargeRegime(24)).toBe('continuous')
    expect(defaultChargeRegime(16)).toBe('overnight')
    expect(defaultChargeRegime(8)).toBe('overnight')
  })
})
