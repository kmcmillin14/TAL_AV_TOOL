import { describe, it, expect } from 'vitest'
import { shareOfTotal } from '../RomQuotation'

/** Hardware is ~88% of a typical quote and Software ~4.5%, and the page said
 *  neither — the reader had to do the arithmetic against a total 300px away.
 *  Rounded hard on purpose: these are placeholder dollars, so a decimal point
 *  would promise precision the inputs do not have. */
describe('shareOfTotal', () => {
  it('rounds to whole percent', () => {
    expect(shareOfTotal(2102500, 2376500)).toBe('88%')
    expect(shareOfTotal(107500, 2376500)).toBe('5%')
  })

  it('shows a floor rather than 0% for a real but tiny amount', () => {
    expect(shareOfTotal(1000, 2376500)).toBe('<1%')
  })

  it('is blank for nothing, and for an empty quote — never NaN', () => {
    expect(shareOfTotal(0, 2376500)).toBe('')
    expect(shareOfTotal(0, 0)).toBe('')
    expect(shareOfTotal(500, 0)).toBe('')
  })
})
