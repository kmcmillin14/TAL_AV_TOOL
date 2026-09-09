import { describe, it, expect } from 'vitest'
import { PRICING_ASSUMPTIONS, ADDERS_CONFIG } from '../pricingContent'

describe('pricingContent', () => {
  it('loads and validates global-assumptions.json', () => {
    expect(PRICING_ASSUMPTIONS.integrationMultipliers).toEqual({ '1': 1.0, '2': 1.8, '3': 3.0 })
    expect(PRICING_ASSUMPTIONS.romBand.low).toBeLessThan(0)
    expect(PRICING_ASSUMPTIONS.romBand.high).toBeGreaterThan(0)
  })

  it('loads and validates adders.json', () => {
    expect(ADDERS_CONFIG.adders.length).toBeGreaterThan(0)
    for (const a of ADDERS_CONFIG.adders) {
      expect(a.amount).toBeGreaterThanOrEqual(0)
    }
  })
})
