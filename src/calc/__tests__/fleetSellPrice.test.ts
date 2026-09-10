import { describe, it, expect } from 'vitest'
import { aggregateFleetSellPrice } from '../fleetSellPrice'
import type { RomPricingResult } from '../sellPriceRom'
import type { AddersConfig, PricingAssumptions } from '@/src/lib/validations/pricingSchemas'

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

const adders: AddersConfig = {
  schemaVersion: 1,
  adders: [
    { id: 'warranty', label: 'Extended Warranty', amount: 1_000 },
    { id: 'training', label: 'Extended Training', amount: 4_000 },
    { id: 'unused', label: 'Unused adder', amount: 999 },
  ],
}

/** Builds a minimal per-line pricing result (bypasses computeSellPriceRom —
 *  this test isolates the aggregator, not the per-line calc). */
function line(hardware: number, integration: number, software: number, qty: number): { pricing: RomPricingResult; qty: number } {
  const lineSubtotal = hardware + integration + software
  return {
    qty,
    pricing: {
      hardwareSellTotal: hardware,
      integrationSellTotal: integration,
      softwareSellTotal: software,
      lineSubtotal,
      sellPerUnit: lineSubtotal / qty,
      band: { lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 }, // unused by the aggregator
    },
  }
}

describe('aggregateFleetSellPrice', () => {
  // Vehicle A mirrors cb18's qty-6 hand-check; Vehicle B is a second chassis.
  const lines = [
    line(1_125_000, 90_000, 24_000, 6),
    line(500_000, 39_000, 19_200, 3),
  ]

  it('sums each component across every line', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.hardwareTotal).toBe(1_625_000)
    expect(t.integrationTotal).toBe(129_000)
    expect(t.softwareTotal).toBe(43_200)
  })

  it('adds a selected adder EXACTLY ONCE regardless of fleet size (the bug this replaces)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    // Previously each of the 2 vehicle lines would have added 1000+4000=5000
    // independently, totaling 10,000. Correct behavior: 5,000, once.
    expect(t.addersTotal).toBe(5_000)
  })

  it('ignores an adder id not in the selected list', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty'], adders, assumptions)
    expect(t.addersTotal).toBe(1_000)
  })

  it('totalQty sums every line\'s qty', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.totalQty).toBe(9)
  })

  it('sellTotal = hardware + integration + software + adders (once)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    // 1,625,000 + 129,000 + 43,200 + 5,000 = 1,802,200
    expect(t.sellTotal).toBe(1_802_200)
  })

  it('sellPerUnit = sellTotal / totalQty (fleet-wide, not per-line)', () => {
    const t = aggregateFleetSellPrice(lines, ['warranty', 'training'], adders, assumptions)
    expect(t.sellPerUnit).toBeCloseTo(1_802_200 / 9, 6)
  })

  it('band is computed ONCE on the fleet aggregate, not summed from per-line bands', () => {
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    // sellTotal (no adders) = 1,797,200 × 0.90 = 1,617,480 → nearest 5000 = 1,615,000
    expect(t.band.lowTotal).toBe(1_615_000)
    // 1,797,200 × 1.25 = 2,246,500 → nearest 5000 = 2,245,000
    expect(t.band.highTotal).toBe(2_245_000)
  })

  it('handles a single-line fleet, matching that line\'s own subtotal plus adders', () => {
    const t = aggregateFleetSellPrice([line(1_125_000, 90_000, 24_000, 6)], [], adders, assumptions)
    expect(t.sellTotal).toBe(1_239_000)
    expect(t.totalQty).toBe(6)
  })

  it('returns zeros for an empty fleet without throwing', () => {
    const t = aggregateFleetSellPrice([], [], adders, assumptions)
    expect(t.sellTotal).toBe(0)
    expect(t.totalQty).toBe(0)
    expect(t.sellPerUnit).toBe(0)
    expect(t.band).toEqual({ lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 })
  })
})
