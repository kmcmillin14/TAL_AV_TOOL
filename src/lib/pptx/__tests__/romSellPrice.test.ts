import { describe, it, expect } from 'vitest'
import { resolveAllRomSellPriceLines as buildRomSellPriceLines } from '@/src/lib/romSellPriceLine'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary } from '@/src/calc/types'

function veh(id: string, hasRomInputs: boolean): Vehicle {
  return {
    id,
    name: id.toUpperCase(),
    calc: { priceRange: { minUsd: 100_000, maxUsd: 200_000 } },
    ...(hasRomInputs
      ? {
          romInputs: {
            baseCommissioningPerUnit: 1000,
            integrationFloor: 1,
            softwareFloor: 1,
            baseIntegrationSellPrice: 10_000,
            baseSoftwareSellPrice: 5_000,
          },
        }
      : {}),
  } as unknown as Vehicle
}

function fleet(groups: Array<{ vehicleId: string; fleetSold: number }>): FleetSummary {
  return {
    groups: groups.map(g => ({
      vehicleId: g.vehicleId, groupRaw: g.fleetSold, baseFleet: g.fleetSold,
      charging: { method: 'plugged', runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: g.fleetSold, demandEnergy: null, demandRotation: g.fleetSold,
      fleetSold: g.fleetSold, binding: 'utilization' as const,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: groups.reduce((s, g) => s + g.fleetSold, 0), bufferPct: 0.25,
  }
}

function project(overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id: 'p1', createdAt: '', updatedAt: '', versionNumber: 'v1',
    step1Complete: false, step2Complete: false, step3Complete: false, step4Complete: false,
    ...overrides,
  } as StoredProject
}

describe('buildRomSellPriceLines', () => {
  it('excludes vehicles with no valid romInputs', () => {
    const vehicleById = new Map([['a', veh('a', true)], ['b', veh('b', false)]])
    const lines = buildRomSellPriceLines(project(), fleet([{ vehicleId: 'a', fleetSold: 2 }, { vehicleId: 'b', fleetSold: 3 }]), vehicleById)
    expect(lines.map(l => l.vehicleId)).toEqual(['a'])
  })

  it('excludes zero-qty groups', () => {
    const vehicleById = new Map([['a', veh('a', true)]])
    const lines = buildRomSellPriceLines(project(), fleet([{ vehicleId: 'a', fleetSold: 0 }]), vehicleById)
    expect(lines).toEqual([])
  })

  it('computes a line for an assigned, priced vehicle', () => {
    const vehicleById = new Map([['a', veh('a', true)]])
    const lines = buildRomSellPriceLines(project(), fleet([{ vehicleId: 'a', fleetSold: 2 }]), vehicleById)
    expect(lines).toHaveLength(1)
    expect(lines[0].qty).toBe(2)
    expect(lines[0].pricing.hardwareSellTotal).toBe((150_000 + 1000) * 2) // midpoint + commissioning × qty
    expect(lines[0].pricing.sellTotal).toBeGreaterThan(0)
  })

  it('never throws for an empty fleet', () => {
    expect(() => buildRomSellPriceLines(project(), fleet([]), new Map())).not.toThrow()
  })

  it('scores the fleet-size complexity band against the TOTAL program fleet, not any one line\'s own qty', () => {
    // Two chassis, 8 + 7 = 15 total — neither line individually reaches the
    // fleetBand11to20 threshold (11), but the combined deployment does.
    const vehicleById = new Map([['a', veh('a', true)], ['b', veh('b', true)]])
    const lines = buildRomSellPriceLines(
      project(),
      fleet([{ vehicleId: 'a', fleetSold: 8 }, { vehicleId: 'b', fleetSold: 7 }]),
      vehicleById
    )
    expect(lines).toHaveLength(2)
    // noAgvExperience (+2, gap default) + fleetBand11to20 (+3) = 5 → tier2 threshold.
    for (const l of lines) expect(l.integrationResult.tier).toBe(2)
  })
})
