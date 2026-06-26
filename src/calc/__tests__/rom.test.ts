import { describe, it, expect } from 'vitest'
import { romPricing, romOpex, romPayback, romSummary } from '../rom'
import { projectSchema } from '@/src/lib/validations/schemas'
import type { FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

// Minimal Vehicle stub — only the fields rom.ts reads.
function veh(id: string, minUsd: number, maxUsd: number, dischargeA = 100, voltageV = 48): Vehicle {
  return {
    id,
    calc: { dischargeA, voltageV, ratedAh: 500, chargeA: 100, priceRange: { minUsd, maxUsd } },
  } as unknown as Vehicle
}

function fleet(groups: Array<{ vehicleId: string; fleetSold: number }>): FleetSummary {
  return {
    groups: groups.map(g => ({
      vehicleId: g.vehicleId, groupRaw: 1, baseFleet: 1,
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 0.5, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: g.fleetSold, fleetSold: g.fleetSold,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: groups.reduce((s, g) => s + g.fleetSold, 0), bufferPct: 0.1,
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
  const costs = { numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 100 }
  const schedule = { dailyOpHr: 10 }

  it('sums operating-draw energy across groups and adds maintenance', () => {
    const vById = new Map([['a', veh('a', 0, 0, 100, 48)]]) // 100A × 48V = 4.8 kW
    const f = fleet([{ vehicleId: 'a', fleetSold: 2 }])
    // energyKwh = 4.8 kW × 10 h × 100 d × 2 veh = 9600 ; cost = 960
    // maintenance = capexMid(100000) × 0.08 = 8000
    const o = romOpex(f, vById, costs, schedule, 100000)
    expect(o.annualEnergyKwh).toBeCloseTo(9600, 5)
    expect(o.annualEnergyCost).toBeCloseTo(960, 5)
    expect(o.annualMaintenance).toBeCloseTo(8000, 5)
    expect(o.annualOpex).toBeCloseTo(8960, 5)
  })

  it('skips groups whose vehicle is unknown', () => {
    const o = romOpex(fleet([{ vehicleId: 'ghost', fleetSold: 3 }]), new Map(), costs, schedule, 0)
    expect(o.annualEnergyKwh).toBe(0)
  })
})

describe('romPayback', () => {
  const costs = { numberOfOperators: 6, fullyBurdenedRateUsdPerYear: 40000, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }

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
    const vById = new Map([['a', veh('a', 100000, 100000, 100, 48)]])
    const f = fleet([{ vehicleId: 'a', fleetSold: 1 }])
    const costs = { numberOfOperators: 2, fullyBurdenedRateUsdPerYear: 30000, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }
    const schedule = { dailyOpHr: 16 }
    const s = romSummary(f, vById, costs, schedule)
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
    expect(parsed.energyCostUsdPerKwh).toBeUndefined()
    expect(parsed.annualMaintenancePctOfCapex).toBeUndefined()
    expect(parsed.operatingDaysPerYear).toBeUndefined()
  })
})
