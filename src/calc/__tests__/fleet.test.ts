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

describe('chargingForGroup (v2 availability)', () => {
  // 100 Ah × 0.8 = 80 usableAh; dischargeA 10 → runHr 8; chargeA 10 → chargeHr 8.
  const base = {
    groupRaw: 4, baseFleet: 4,
    ratedAh: 100, dischargeA: 10, chargeA: 10, chargeTimeMin: undefined as number | undefined,
    method: 'plugged' as const, breakHrs: 0,
  }

  it('1 shift Mon–Fri, battery lasts the shift → A=1, no extra vehicles', () => {
    const r = chargingForGroup({ ...base, hProd: 8, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBe(1)               // (80/5 + 240)/(8·20)=1.6→1
    expect(r.aCap).toBe(1)                  // runHr 8 ≥ 8
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
  })

  it('2 shifts Mon–Fri, small battery → capacity binds → adds vehicles', () => {
    // chargeRate = 10 × 0.85 = 8.5 → chargeHr = 80/8.5 = 9.412.
    const r = chargingForGroup({ ...base, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBeCloseTo(0.7432, 4)   // (80/5 + 24·8.5)/(16·18.5)
    expect(r.aCap).toBeCloseTo(0.4595, 4)      // 8/(8+9.412)
    expect(r.availability).toBeCloseTo(0.4595, 4)
    expect(r.chargingDelta).toBe(5)            // ⌈4/0.4595⌉ − 4
  })

  it('24/7 (no rest day) → no weekend credit → duty ratio', () => {
    const r = chargingForGroup({ ...base, hProd: 24, consecutiveOpDays: Infinity })
    expect(r.aEnergy).toBeCloseTo(0.4595, 4)   // (0 + 24·8.5)/(24·18.5)
    expect(r.availability).toBeCloseTo(0.4595, 4)
  })

  it('weekend reset lowers fleet vs running 7 days (big battery, A_cap=1)', () => {
    const friday = chargingForGroup({ ...base, ratedAh: 225, hProd: 16, consecutiveOpDays: 5 }) // usableAh 180, runHr 18
    const everyday = chargingForGroup({ ...base, ratedAh: 225, hProd: 16, consecutiveOpDays: Infinity })
    expect(friday.aCap).toBe(1)             // runHr 18 ≥ 16
    expect(friday.availability).toBeCloseTo(0.8108, 4)  // (180/5 + 204)/296
    expect(everyday.availability).toBeCloseTo(0.6892, 4) // (0 + 204)/296
    expect(friday.availability!).toBeGreaterThan(everyday.availability!)
  })

  it('faster charger raises availability', () => {
    // chargeA 40 × 0.85 = 34 → chargeHr 80/34 = 2.353.
    const r = chargingForGroup({ ...base, chargeA: 40, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aCap).toBeCloseTo(0.7727, 4)   // 8/(8+2.353)
    expect(r.availability).toBeCloseTo(0.7727, 4)
  })

  it('chargeTimeMin overrides chargeA for the charge rate', () => {
    // 80 usableAh in 120 min = 40 A nameplate → ×0.85 = 34 (same as chargeA 40 case).
    const r = chargingForGroup({ ...base, chargeA: 10, chargeTimeMin: 120, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aCap).toBeCloseTo(0.7727, 4)
  })

  it('credits breaks as extra Ah (raises runHrEff)', () => {
    const noBreak = chargingForGroup({ ...base, hProd: 8, breakHrs: 0, consecutiveOpDays: 5 })
    const withBreak = chargingForGroup({ ...base, dischargeA: 16, hProd: 7, breakHrs: 1, consecutiveOpDays: 5 })
    expect(withBreak.runHr).not.toBeNull()  // break credit applied; no NaN
    expect(noBreak.availability).toBe(1)
  })

  it('missing / invalid data → not sustainable, no NaN, delta 0', () => {
    expect(chargingForGroup({ ...base, ratedAh: 0, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, dischargeA: 0, hProd: 8, consecutiveOpDays: 5 }).chargingDelta).toBe(0)
    expect(chargingForGroup({ ...base, chargeA: 0, chargeTimeMin: undefined, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, hProd: 0, consecutiveOpDays: 5 }).sustainable).toBe(false)
  })
})

describe('fleetSummary', () => {
  const grp = (vehicleId: string, groupRaw: number, baseFleet: number): GroupSummary => ({
    vehicleId, flowsCount: 1, baseThru: 0, avgCycleSec: null, groupRaw, baseFleet, headroom: null,
  })
  const veh = (id: string, calc: Partial<Vehicle['calc']>, chargerType: string): Vehicle =>
    ({ id, calc: { ratedAh: 100, dischargeA: 10, chargeA: 40, chargeTimeMin: 120, chargerType, ...calc } } as unknown as Vehicle)

  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.10, dailyOpHr: 24, breakHrs: 0,
    consecutiveOpDays: Infinity, chargeMethods: {}, ...over,
  })

  it('runs base → +charging → ×buffer → ⌈⌉ and totals', () => {
    const groups = [grp('a', 4, 4)]
    // 24/7 default; chargeA 10 × 0.85 = 8.5, dischargeA 10 → A ≈ 0.4595 → fleetWithCharging 9.
    const byId = new Map([['a', veh('a', { chargeA: 10, chargeTimeMin: undefined }, 'opportunity')]])
    const s = fleetSummary(groups, byId, settings())
    const g = s.groups[0]
    expect(g.charging.chargingDelta).toBe(5)        // ⌈4/0.4595⌉ − 4
    expect(g.fleetWithCharging).toBe(9)
    expect(g.fleetSold).toBe(10)                    // ⌈(4 ÷ 0.4595) × 1.10⌉ = ⌈9.58⌉
    expect(s.totalChargingDelta).toBe(5)
    expect(s.totalFleetSold).toBe(10)
  })

  it('rounds ONCE at the end — buffer multiplies unrounded demand, not the ceiled base', () => {
    // A = 1 (ample battery): demand 4.05 → ⌈4.05 × 1.15⌉ = ⌈4.66⌉ = 5.
    // The old per-stage ceiling gave ⌈⌈4.05⌉ × 1.15⌉ = ⌈5.75⌉ = 6.
    const groups = [grp('a', 4.05, 5)]
    const byId = new Map([['a', veh('a', { chargeA: 40, chargeTimeMin: undefined }, 'plugged')]])
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0.15, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s.groups[0].charging.availability).toBe(1)
    expect(s.groups[0].fleetSold).toBe(5)
    // baseFleet stays the physical floor: buffer 0 can never sell below it.
    const s0 = fleetSummary(groups, byId, settings({ bufferPct: 0, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s0.groups[0].fleetSold).toBe(5)          // max(baseFleet 5, ⌈4.05⌉)
  })

  it('bufferPct 0 is a no-op; ample coverage → no charging adder', () => {
    const groups = [grp('a', 4, 4)]
    // 1-shift Mon–Fri, ample battery → A = 1 → no adder.
    const byId = new Map([['a', veh('a', { chargeA: 40, chargeTimeMin: undefined }, 'plugged')]])
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s.groups[0].charging.chargingDelta).toBe(0)
    expect(s.groups[0].fleetSold).toBe(4)
  })

  it('skips groups with no base fleet', () => {
    const s = fleetSummary([grp('a', 0, 0)], new Map(), settings())
    expect(s.groups).toHaveLength(0)
    expect(s.totalFleetSold).toBe(0)
  })
})

describe('defaultChargeRegime', () => {
  it('derives continuous for full-day coverage, overnight otherwise', () => {
    expect(defaultChargeRegime(24)).toBe('continuous')   // 3 × 8 h
    expect(defaultChargeRegime(16)).toBe('overnight')    // 2 × 8 h
    expect(defaultChargeRegime(8)).toBe('overnight')
  })
})
