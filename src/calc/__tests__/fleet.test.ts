import { describe, it, expect } from 'vitest'
import { chargingForGroup, defaultChargeMethod, defaultChargeRegime, fleetSummary } from '../fleet'
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

describe('chargingForGroup (v3 hours-based availability)', () => {
  // runTimeHr 8, chargeTimeMin 480 → chargeHr 8 (run:charge 1:1 for easy math).
  const base = {
    groupRaw: 4, baseFleet: 4,
    runTimeHr: 8, chargeTimeMin: 480 as number | undefined,
    method: 'plugged' as const, breakHrs: 0,
  }

  it('1 shift Mon–Fri, battery lasts the shift → A=1, no extra vehicles', () => {
    const r = chargingForGroup({ ...base, hProd: 8, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBe(1)               // (24 + 8/5)/(8·2) = 1.6 → capped 1
    expect(r.aCap).toBe(1)                  // runHr 8 ≥ 8
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
  })

  it('2 shifts Mon–Fri, small battery → rotation binds', () => {
    const r = chargingForGroup({ ...base, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBeCloseTo(0.8, 6)      // (24 + 1.6)/(16·2)
    expect(r.aCap).toBeCloseTo(0.5, 6)         // 8/(8+8)
    expect(r.availability).toBeCloseTo(0.5, 6)
    expect(r.chargingDelta).toBe(4)            // ⌈4/0.5⌉ − 4
  })

  it('24/7 (no rest day) → no off-shift or weekend credit → run:charge ratio', () => {
    const r = chargingForGroup({ ...base, hProd: 24, consecutiveOpDays: Infinity })
    expect(r.aEnergy).toBeCloseTo(0.5, 6)      // 24/(24·2)
    expect(r.availability).toBeCloseTo(0.5, 6)
  })

  it('weekend reset lowers fleet vs running 7 days (big battery, slow charger, A_cap=1)', () => {
    // runTimeHr 18 covers the 16 h window; chargeHr 24 makes energy bind.
    const friday = chargingForGroup({ ...base, runTimeHr: 18, chargeTimeMin: 1440, hProd: 16, consecutiveOpDays: 5 })
    const everyday = chargingForGroup({ ...base, runTimeHr: 18, chargeTimeMin: 1440, hProd: 16, consecutiveOpDays: Infinity })
    expect(friday.aCap).toBe(1)                            // 18 ≥ 16
    expect(friday.availability).toBeCloseTo(0.7714, 4)     // (24 + 24/5)/(16·(1+24/18))
    expect(everyday.availability).toBeCloseTo(0.6429, 4)   // 24/(16·(1+24/18))
    expect(friday.availability!).toBeGreaterThan(everyday.availability!)
  })

  it('C=1 (rest day after every operating day) maximizes the weekend credit', () => {
    const daily = chargingForGroup({ ...base, hProd: 20, consecutiveOpDays: 1 })
    const never = chargingForGroup({ ...base, hProd: 20, consecutiveOpDays: Infinity })
    expect(daily.aEnergy).toBeCloseTo(0.8, 6)    // (24 + 8/1)/(20·2)
    expect(never.aEnergy).toBeCloseTo(0.6, 6)    // 24/(20·2)
  })

  it('faster charger raises availability', () => {
    const r = chargingForGroup({ ...base, chargeTimeMin: 120, hProd: 16, consecutiveOpDays: 5 })
    expect(r.chargeHr).toBeCloseTo(2, 6)
    expect(r.aCap).toBeCloseTo(0.8, 6)         // 8/(8+2)
    expect(r.availability).toBeCloseTo(0.8, 6)
  })

  it('credits breaks as top-up time (raises runHrEff to cover the window)', () => {
    // runHrEff = 8 + 1·(8/2) = 12 ≥ 7 → A_cap = 1.
    const r = chargingForGroup({ ...base, chargeTimeMin: 120, hProd: 7, breakHrs: 1, consecutiveOpDays: 5 })
    expect(r.aCap).toBe(1)
    expect(r.availability).toBe(1)
  })

  it('missing / invalid data → not sustainable, no NaN, delta 0', () => {
    expect(chargingForGroup({ ...base, runTimeHr: 0, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, chargeTimeMin: undefined, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, chargeTimeMin: 0, hProd: 8, consecutiveOpDays: 5 }).chargingDelta).toBe(0)
    expect(chargingForGroup({ ...base, hProd: 0, consecutiveOpDays: 5 }).sustainable).toBe(false)
  })
})

describe('fleetSummary (v3 max-of-constraints composition)', () => {
  const grp = (vehicleId: string, groupRaw: number, baseFleet: number): GroupSummary => ({
    vehicleId, flowsCount: 1, baseThru: 0, avgCycleSec: null, groupRaw, baseFleet, headroom: null,
  })
  const veh = (id: string, runTimeHr: number, chargeTimeMin: number, chargerType = 'opportunity'): Vehicle =>
    ({ id, calc: { runTimeHr, chargeTimeMin, chargerType } } as unknown as Vehicle)

  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.25, dailyOpHr: 24, breakHrs: 0,
    consecutiveOpDays: Infinity, chargeMethods: {}, ...over,
  })

  it('rotation binds on 24/7: buffer stacks on the rotation constraint', () => {
    const byId = new Map([['a', veh('a', 8, 480)]])
    const s = fleetSummary([grp('a', 4, 4)], byId, settings({ bufferPct: 0.10 }))
    const g = s.groups[0]
    expect(g.charging.availability).toBeCloseTo(0.5, 6)
    expect(g.charging.chargingDelta).toBe(4)   // ⌈4/0.5⌉ − 4 (reported stage)
    expect(g.fleetWithCharging).toBe(8)
    expect(g.fleetSold).toBe(9)                // max(8/0.5=8, 4·1.10/0.5=8.8) → ⌈8.8⌉
    expect(g.binding).toBe('rotation')
    expect(s.totalChargingDelta).toBe(4)
    expect(s.totalFleetSold).toBe(9)
  })

  it('energy binds: buffer does NOT multiply the energy constraint (the overlap fix)', () => {
    // runTimeHr 18 covers H=16 → A_cap=1; chargeHr 24, C=∞ → A_energy=0.6429.
    const byId = new Map([['a', veh('a', 18, 1440)]])
    const s = fleetSummary([grp('a', 8, 8)], byId, settings({ dailyOpHr: 16 }))
    const g = s.groups[0]
    expect(g.charging.aCap).toBe(1)
    expect(g.charging.aEnergy).toBeCloseTo(0.6429, 4)
    // max(8/0.6429 = 12.44, 8·1.25/1 = 10) → ⌈12.44⌉ = 13. Old product formula sold 16.
    expect(g.fleetSold).toBe(13)
    expect(g.binding).toBe('energy')
  })

  it('utilization binds when charging is free (single shift, fast charger)', () => {
    const byId = new Map([['a', veh('a', 8, 120)]])
    const s = fleetSummary([grp('a', 8, 8)], byId, settings({ dailyOpHr: 8, consecutiveOpDays: 5 }))
    const g = s.groups[0]
    expect(g.charging.availability).toBe(1)
    expect(g.charging.chargingDelta).toBe(0)
    expect(g.fleetSold).toBe(10)               // max(8, 8·1.25) = 10
    expect(g.binding).toBe('utilization')
  })

  it('rounds ONCE at the end and baseFleet stays the physical floor', () => {
    const byId = new Map([['a', veh('a', 8, 120)]])
    const groups = [grp('a', 4.05, 5)]
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0.15, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s.groups[0].fleetSold).toBe(5)      // ⌈4.05 × 1.15⌉ = ⌈4.66⌉ = 5
    const s0 = fleetSummary(groups, byId, settings({ bufferPct: 0, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s0.groups[0].fleetSold).toBe(5)     // max(baseFleet 5, ⌈4.05⌉)
  })

  it('vehicle not found → unsustainable → utilization-only sizing', () => {
    const s = fleetSummary([grp('a', 4, 4)], new Map(), settings())
    const g = s.groups[0]
    expect(g.charging.sustainable).toBe(false)
    expect(g.fleetSold).toBe(5)                // max(4, ⌈4 × 1.25⌉)
    expect(g.binding).toBe('utilization')
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
