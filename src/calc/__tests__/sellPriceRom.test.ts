import { describe, it, expect } from 'vitest'
import { computeSellPriceRom, vehiclePricingMidpoint } from '../sellPriceRom'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { PricingAssumptions, AddersConfig, RomInputs } from '@/src/lib/validations/pricingSchemas'
import type { TierResult } from '../scoreTier'

// Mirrors src/content/pricing/global-assumptions.json's numeric shape (a
// self-contained fixture so this test doesn't silently drift if the content
// file's placeholders change).
const assumptions: PricingAssumptions = {
  schemaVersion: 1,
  currency: 'USD',
  integrationMultipliers: { '1': 1.0, '2': 1.8, '3': 3.0 },
  softwareMultipliers: { '1': 1.0, '2': 1.6, '3': 2.5 },
  integrationScoring: { points: {}, thresholds: { tier2: 5, tier3: 11 } },
  softwareScoring: { points: {}, thresholds: { tier2: 4, tier3: 9 } },
  romBand: { low: -0.10, high: 0.25 },
  rounding: 5000,
  cutsheetRepresentativeQty: [2, 6, 15],
}

const noAdders: AddersConfig = { schemaVersion: 1, adders: [] }

function tierResult(tier: 1 | 2 | 3): TierResult {
  return { score: 0, tier, reasons: [], notTriggered: [], flooredBy: null }
}

// Mirrors src/content/vehicles/cb18.json (priceRange 165000-210000, mid 187500).
// baseIntegrationSellPrice includes commissioning — there is no separate
// baseCommissioningPerUnit field (owner: commissioning and integration are
// the same cost bucket, 2026-09-09).
function cb18(): Vehicle {
  return {
    id: 'cb18',
    calc: { priceRange: { minUsd: 165_000, maxUsd: 210_000 } },
    romInputs: {
      integrationFloor: 1,
      softwareFloor: 1,
      baseIntegrationSellPrice: 50_000,
      baseSoftwareSellPrice: 15_000,
    } satisfies RomInputs,
  } as unknown as Vehicle
}

describe('vehiclePricingMidpoint', () => {
  it('averages min/max', () => {
    expect(vehiclePricingMidpoint(cb18())).toBe(187_500)
  })
})

describe('computeSellPriceRom — hand-checked qty 6, Integration T2, Software T2, no adders', () => {
  const result = computeSellPriceRom({
    vehicle: cb18(),
    romInputs: cb18().romInputs as RomInputs,
    qty: 6,
    integrationResult: tierResult(2),
    softwareResult: tierResult(2),
    selectedAdderIds: [],
    assumptions,
    adders: noAdders,
  })

  it('hardware = midpoint × qty (no commissioning line — folded into Integration) = 187500×6', () => {
    expect(result.hardwareSellTotal).toBe(1_125_000)
  })
  it('integration = base (incl. commissioning) × multiplier[2] = 50000×1.8', () => {
    expect(result.integrationSellTotal).toBe(90_000)
  })
  it('software = base × multiplier[2] = 15000×1.6', () => {
    expect(result.softwareSellTotal).toBe(24_000)
  })
  it('adders = 0', () => {
    expect(result.addersTotal).toBe(0)
  })
  it('sellTotal sums all four lines', () => {
    expect(result.sellTotal).toBe(1_239_000)
  })
  it('sellPerUnit = sellTotal / qty', () => {
    expect(result.sellPerUnit).toBe(206_500)
  })
  it('band rounds to the nearest $5,000 (low -10% / high +25%)', () => {
    // 1,239,000 × 0.90 = 1,115,100 → nearest 5000 = 1,115,000
    expect(result.band.lowTotal).toBe(1_115_000)
    // 1,239,000 × 1.25 = 1,548,750 → nearest 5000 = 1,550,000
    expect(result.band.highTotal).toBe(1_550_000)
    // per-unit computed AFTER rounding the totals, then rounded again
    expect(result.band.lowPerUnit).toBe(185_000)
    expect(result.band.highPerUnit).toBe(260_000)
  })
})

describe('computeSellPriceRom — adders sum', () => {
  it('adds only the selected adders', () => {
    const adders: AddersConfig = {
      schemaVersion: 1,
      adders: [
        { id: 'a', label: 'A', amount: 1000 },
        { id: 'b', label: 'B', amount: 2000 },
        { id: 'c', label: 'C', amount: 4000 },
      ],
    }
    const result = computeSellPriceRom({
      vehicle: cb18(),
      romInputs: cb18().romInputs as RomInputs,
      qty: 1,
      integrationResult: tierResult(1),
      softwareResult: tierResult(1),
      selectedAdderIds: ['a', 'c'],
      assumptions,
      adders,
    })
    expect(result.addersTotal).toBe(5000) // 1000 + 4000, b excluded
  })
})

describe('computeSellPriceRom — guards', () => {
  it('throws on qty <= 0', () => {
    expect(() =>
      computeSellPriceRom({
        vehicle: cb18(),
        romInputs: cb18().romInputs as RomInputs,
        qty: 0,
        integrationResult: tierResult(1),
        softwareResult: tierResult(1),
        selectedAdderIds: [],
        assumptions,
        adders: noAdders,
      })
    ).toThrow()
  })
})
