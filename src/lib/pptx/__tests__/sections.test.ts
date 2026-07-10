import { describe, it, expect } from 'vitest'
import { PPTX_SECTIONS, ROM_SLIDE, RETIRED_SLIDES, slidesToRemove, type PptxSelection } from '../sections'

const allOn = (): PptxSelection => ({
  sections: Object.fromEntries(PPTX_SECTIONS.filter(s => !s.always).map(s => [s.key, true])),
  vehicles: { cb18: true, ml2: true, m10: true, ebase7: true, '8tb50a': true, '8hbc40a': true },
})

describe('sections (customer-deck body)', () => {
  it('retired body slides are removed even with everything selected', () => {
    const removed = slidesToRemove(allOn())
    for (const n of RETIRED_SLIDES) expect(removed).toContain(n)
    expect(RETIRED_SLIDES).toEqual([20, 22, 23, 26])
    expect(removed).toContain(17)                       // Cleanfix still always dropped
    for (const n of [18, 19, 21, 24, 25, 27, 28]) expect(removed).not.toContain(n)
  })
  it('no section owns a retired slide; ROM_SLIDE names the 7 body slides', () => {
    const owned = PPTX_SECTIONS.flatMap(s => s.slides)
    for (const n of RETIRED_SLIDES) expect(owned).not.toContain(n)
    expect(ROM_SLIDE).toEqual({
      requirements: 18, vehicles: 19, fleetSizing: 21,
      materialFlow: 24, financials: 25, investment: 27, roi: 28,
    })
  })
})
