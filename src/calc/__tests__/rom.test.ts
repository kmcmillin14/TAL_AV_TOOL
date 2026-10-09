import { describe, it, expect } from 'vitest'
import { romPricing, romOpex, romPayback, romSummary } from '../rom'
import { projectSchema } from '@/src/lib/validations/schemas'
import type { FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

// Minimal Vehicle stub — only the fields rom.ts reads.
function veh(id: string, minUsd: number, maxUsd: number, runTimeHr = 4, voltageV = 48): Vehicle {
  return {
    id,
    calc: { runTimeHr, voltageV, ratedAh: 500, priceRange: { minUsd, maxUsd } },
  } as unknown as Vehicle
}

function fleet(groups: Array<{ vehicleId: string; fleetSold: number }>): FleetSummary {
  return {
    groups: groups.map(g => ({
      vehicleId: g.vehicleId, groupRaw: 1, baseFleet: 1,
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 0.5, dutyRatio: null, offShiftCharge: null, usableKwh: null, provisional: false, sustainable: true, reason: '' },
      fleetWithCharging: g.fleetSold, chargingDelta: 0, utilizationDelta: 0, demand: g.fleetSold, fleetSold: g.fleetSold, binding: 'utilization' as const,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0, totalUtilizationDelta: 0,
    totalFleetSold: groups.reduce((s, g) => s + g.fleetSold, 0), targetUtilization: 0.9091,
  }
}

describe('romPricing', () => {
  it('multiplies fleetSold by the price range and sums lines', () => {
    const vById = new Map([['a', veh('a', 100, 200)], ['b', veh('b', 50, 75)]])
    const p = romPricing(fleet([{ vehicleId: 'a', fleetSold: 3 }, { vehicleId: 'b', fleetSold: 2 }]), vById)
    expect(p.lines[0]).toMatchObject({ vehicleId: 'a', fleetSold: 3, lineMin: 300, lineMax: 600 })
    expect(p.totalMin).toBe(400)   // 300 + 100
    expect(p.totalMax).toBe(750)   // 600 + 150
    expect(p.totalMid).toBe(575)   // (400+750)/2
  })

  it('treats a missing vehicle / price as zero', () => {
    const p = romPricing(fleet([{ vehicleId: 'ghost', fleetSold: 4 }]), new Map())
    expect(p.totalMin).toBe(0)
    expect(p.totalMax).toBe(0)
    expect(p.lines[0].unitMin).toBe(0)
  })
})

describe('romOpex', () => {
  const costs = { numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 100 }

  it('is maintenance only — a share of CAPEX mid', () => {
    const o = romOpex(costs, 100000)
    expect(o.annualMaintenance).toBeCloseTo(8000, 5)
    expect(o.annualOpex).toBeCloseTo(8000, 5)
  })

  /** Energy left the OPEX model 2026-10-04 (owner decision): every term was an
   *  unverified estimate — nameplate battery kW standing in for duty-cycle draw,
   *  and a flat $/kWh nobody entered. OPEX must not pick up an energy term again
   *  without real figures behind it. */
  it('REGRESSION: OPEX carries no energy term', () => {
    const o = romOpex(costs, 100000)
    expect(Object.keys(o).sort()).toEqual(['annualMaintenance', 'annualOpex'])
    expect(o.annualOpex).toBe(o.annualMaintenance)
  })

  it('is zero when there is no CAPEX to take a share of', () => {
    expect(romOpex(costs, 0).annualOpex).toBe(0)
  })
})

describe('romPayback', () => {
  const costs = { numberOfOperators: 6, fullyBurdenedRateUsdPerYear: 40000, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }

  // Simple model (user-confirmed): payback = system cost ÷ (operators × burdened
  // cost). OPEX stays informational — it does not net against the offset.
  it('payback = CAPEX mid / labor offset, ignoring OPEX', () => {
    // laborOffset = 6 operators × $40,000 = $240,000/yr; 600,000 / 240,000 = 2.5 yr
    const p = romPayback(costs, 600000)
    expect(p.annualLaborOffset).toBeCloseTo(240000, 5)
    expect(p.paybackYears).toBeCloseTo(2.5, 5)
  })

  it('returns null payback when there is no labor offset', () => {
    const p = romPayback({ ...costs, numberOfOperators: 0 }, 600000)
    expect(p.paybackYears).toBeNull()
  })
})

describe('romSummary', () => {
  it('wires pricing → opex → payback together', () => {
    const vById = new Map([['a', veh('a', 100000, 100000, 4, 48)]])
    const f = fleet([{ vehicleId: 'a', fleetSold: 1 }])
    const costs = { numberOfOperators: 2, fullyBurdenedRateUsdPerYear: 30000, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }
    const s = romSummary(f, vById, costs)
    expect(s.pricing.totalMid).toBe(100000)
    expect(s.opex.annualMaintenance).toBeCloseTo(8000, 5)
    expect(s.payback.annualLaborOffset).toBeCloseTo(2 * 30000, 5) // 60000
  })
})

describe('ROM economic-assumption defaults', () => {
  it('assumptions stay UNSET when absent — schema defaults would pin into storage and mask the UI/derived fallbacks', () => {
    const parsed = projectSchema.parse({})
    expect(parsed.numberOfOperators).toBeUndefined()
    expect(parsed.fullyBurdenedRateUsdPerYear).toBeUndefined()
    expect(parsed.annualMaintenancePctOfCapex).toBeUndefined()
    expect(parsed.operatingDaysPerYear).toBeUndefined()
  })
})
