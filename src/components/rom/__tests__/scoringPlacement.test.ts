import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The complexity point tables explain the tier chips rendered in section 01,
 *  but lived in section 02 — a full ledger's height away from the figure they
 *  justify. Each axis now sits inside the disclosure of the section it
 *  multiplies; section 02 keeps the per-vehicle overrides, which are a
 *  different job. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const QUOTE = read('src/components/rom/RomQuotation.tsx')
const DRIVERS = read('src/components/rom/RomPriceDrivers.tsx')

describe('complexity scoring sits with its figure', () => {
  it('the ledger renders both axes', () => {
    expect(QUOTE).toContain('ComplexityAxis')
    expect(QUOTE).toMatch(/axis="software"/)
    expect(QUOTE).toMatch(/axis="integration"/)
  })

  it('section 02 no longer renders scoring', () => {
    expect(DRIVERS).not.toContain('ComplexityAxis')
    expect(DRIVERS).not.toContain('PRICING_ASSUMPTIONS')
  })

  it('section 02 still owns the overrides', () => {
    expect(DRIVERS).toContain('integrationTierOverride')
    expect(DRIVERS).toContain('softwareTierOverride')
  })
})
