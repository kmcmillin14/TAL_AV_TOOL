import { describe, it, expect } from 'vitest'
import { aggregateFleetSellPrice, type FleetSellPriceLineInput } from '../fleetSellPrice'
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

/** Builds a minimal aggregator line input (bypasses computeSellPriceRom —
 *  this test isolates the aggregator, not the per-line calc). Defaults every
 *  line to its own unique platform (so pre-2026-09-10 tests that expect
 *  integration to sum across lines keep working); pass a shared `platform`
 *  to exercise the shared-integration rule. */
function line(
  vehicleId: string, hardware: number, integration: number, software: number, qty: number,
  platform = vehicleId, integrationTier = 1
): FleetSellPriceLineInput {
  const lineSubtotal = hardware + integration + software
  const pricing: RomPricingResult = {
    hardwareSellTotal: hardware,
    integrationSellTotal: integration,
    softwareSellTotal: software,
    lineSubtotal,
    sellPerUnit: lineSubtotal / qty,
    band: { lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 }, // unused by the aggregator
  }
  return { vehicleId, pricing, qty, fleetManagerPlatform: platform, integrationTier }
}

describe('aggregateFleetSellPrice', () => {
  // Vehicle A mirrors cb18's qty-6 hand-check; Vehicle B is a second chassis
  // on a DIFFERENT platform — integration sums across distinct platforms.
  const lines = [
    line('a', 1_125_000, 90_000, 24_000, 6),
    line('b', 500_000, 39_000, 19_200, 3),
  ]

  it('sums Hardware/Software across every line; Integration sums across DISTINCT platforms', () => {
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
    const t = aggregateFleetSellPrice([line('a', 1_125_000, 90_000, 24_000, 6)], [], adders, assumptions)
    expect(t.sellTotal).toBe(1_239_000)
    expect(t.totalQty).toBe(6)
  })

  it('returns zeros for an empty fleet without throwing', () => {
    const t = aggregateFleetSellPrice([], [], adders, assumptions)
    expect(t.sellTotal).toBe(0)
    expect(t.totalQty).toBe(0)
    expect(t.sellPerUnit).toBe(0)
    expect(t.band).toEqual({ lowTotal: 0, highTotal: 0, lowPerUnit: 0, highPerUnit: 0 })
    expect(t.integrationByPlatform).toEqual([])
  })
})

describe('aggregateFleetSellPrice — shared fleet-manager-platform integration (2026-09-10)', () => {
  it('charges Integration ONCE for a fleet all on the same platform, not summed per vehicle type', () => {
    // Three vehicle types, all "BlueBotics ANT" — mirrors every vehicle in
    // the library today. Cheaper-integration types ride along free; only the
    // highest-tier line's own integration dollar amount is charged.
    const lines = [
      line('cb18', 750_000, 90_000, 24_000, 4, 'BlueBotics ANT', 2),
      line('m10', 600_000, 70_200, 19_200, 6, 'BlueBotics ANT', 2),
      line('8hbc40a', 1_050_000, 99_900, 25_600, 5, 'BlueBotics ANT', 2),
    ]
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    // Highest tier is a 3-way tie at tier 2 — the tiebreaker is the higher
    // dollar amount, so 8hbc40a's 99,900 wins, not the sum of all three.
    expect(t.integrationTotal).toBe(99_900)
    expect(t.hardwareTotal).toBe(2_400_000) // Hardware still sums normally
    expect(t.softwareTotal).toBe(68_800)    // Software still sums normally
  })

  it('picks the highest-TIER line within a platform group even if a lower tier has a bigger dollar amount', () => {
    const lines = [
      line('cheap-but-complex', 100_000, 50_000, 5_000, 1, 'BlueBotics ANT', 3),
      line('expensive-but-simple', 900_000, 10_000, 5_000, 1, 'BlueBotics ANT', 1),
    ]
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.integrationTotal).toBe(50_000)
    expect(t.integrationByPlatform).toEqual([
      { platform: 'BlueBotics ANT', vehicleIds: ['cheap-but-complex', 'expensive-but-simple'], billedVehicleId: 'cheap-but-complex', amount: 50_000 },
    ])
  })

  it('charges Integration once PER platform group — mixed platforms never share', () => {
    const lines = [
      line('cb18', 750_000, 90_000, 24_000, 4, 'BlueBotics ANT', 2),
      line('m10', 600_000, 70_200, 19_200, 6, 'BlueBotics ANT', 2),
      line('forklift', 300_000, 40_000, 10_000, 2, 'Toyota Fleet Manager', 1),
    ]
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    // BlueBotics group charges once (90,000, the higher of the tied tier-2
    // pair) + the Toyota group's own single line (40,000) = 130,000.
    expect(t.integrationTotal).toBe(130_000)
    expect(t.integrationByPlatform).toHaveLength(2)
  })

  it('integrationByPlatform reports which vehicle is billed and which ride free', () => {
    const lines = [
      line('cb18', 750_000, 90_000, 24_000, 4, 'BlueBotics ANT', 3),
      line('m10', 600_000, 70_200, 19_200, 6, 'BlueBotics ANT', 2),
    ]
    const t = aggregateFleetSellPrice(lines, [], adders, assumptions)
    expect(t.integrationByPlatform).toEqual([
      { platform: 'BlueBotics ANT', vehicleIds: ['cb18', 'm10'], billedVehicleId: 'cb18', amount: 90_000 },
    ])
  })
})
