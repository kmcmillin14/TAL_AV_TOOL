import { describe, it, expect } from 'vitest'
import { resolveRomSellPriceLine, type RomSellPriceOverride } from '../romSellPriceLine'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { ComplexityAnswers } from '@/src/calc/complexityInputs'
import type { FleetGroup } from '@/src/calc/types'

function veh(integrationFloor: 1 | 2 | 3 = 1, softwareFloor: 1 | 2 | 3 = 1): Vehicle {
  return {
    id: 'a',
    name: 'Vehicle A',
    calc: { priceRange: { minUsd: 100_000, maxUsd: 200_000 } },
    romInputs: {
      baseCommissioningPerUnit: 1000,
      integrationFloor,
      softwareFloor,
      baseIntegrationSellPrice: 10_000,
      baseSoftwareSellPrice: 5_000,
    },
  } as unknown as Vehicle
}

function group(fleetSold = 2): FleetGroup {
  return {
    vehicleId: 'a', groupRaw: fleetSold, baseFleet: fleetSold,
    charging: { method: 'plugged', runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: true, reason: '' },
    fleetWithCharging: fleetSold, demandEnergy: null, demandRotation: fleetSold,
    fleetSold, binding: 'utilization',
  }
}

const flatAnswers: ComplexityAnswers = {
  wmsIntegrationRequired: false, storageTrackingRequired: false, barcodeScanningRequired: false,
  hasPlcInterlock: false, trafficType: [], ramps: false, customLoad: false,
  hasAgvExperience: true, facilitySqFt: 0, pickDropLocationCount: 0,
}

describe('resolveRomSellPriceLine — tier overrides respect the vehicle floor', () => {
  it('an override tier is clamped UP to the vehicle floor, never allowed below it', () => {
    const override: RomSellPriceOverride = { integrationTierOverride: 1 }
    const line = resolveRomSellPriceLine(veh(3, 1), group(), 2, flatAnswers, override, [])
    expect(line?.integrationResult.tier).toBe(3) // floor wins over the Tier-1 override
    expect(line?.integrationResult.flooredBy).toBe('vehicle integration floor')
  })

  it('an override tier above the floor is honored as-is', () => {
    const override: RomSellPriceOverride = { softwareTierOverride: 3 }
    const line = resolveRomSellPriceLine(veh(1, 1), group(), 2, flatAnswers, override, [])
    expect(line?.softwareResult.tier).toBe(3)
    expect(line?.softwareResult.flooredBy).toBeNull()
  })

  it('integration and software overrides carry INDEPENDENT reasons', () => {
    const override: RomSellPriceOverride = {
      integrationTierOverride: 3, integrationOverrideReason: 'site survey confirmed complexity',
      softwareTierOverride: 2, softwareOverrideReason: 'no WMS integration required',
    }
    const line = resolveRomSellPriceLine(veh(1, 1), group(), 2, flatAnswers, override, [])
    expect(line?.integrationResult.tier).toBe(3)
    expect(line?.softwareResult.tier).toBe(2)
    // Both reasons survive on the override object itself (not lost/merged).
    expect(override.integrationOverrideReason).toBe('site survey confirmed complexity')
    expect(override.softwareOverrideReason).toBe('no WMS integration required')
  })
})
