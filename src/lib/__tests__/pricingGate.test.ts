import { describe, it, expect } from 'vitest'
import { pricingGate } from '../romComplexityFromProject'
import type { StoredProject } from '../storage'

const base = { id: 'p1' } as StoredProject

const answeredAll: StoredProject = {
  ...base,
  pickDropLocationCount: 12,
  facilitySizeSqFt: 520000,
  hasAgvExperience: false,
  sharedTrafficTypes: ['Pedestrians'],
  wmsRequired: true,
  storageTrackingRequired: false,
  interlocks: ['None'],
}

describe('pricingGate', () => {
  it('blocks both axes on an empty project', () => {
    const g = pricingGate(base)
    expect(g.integrationReady).toBe(false)
    expect(g.softwareReady).toBe(false)
    expect(g.blocked).toBe(true)
  })

  it('clears both axes once every gating input is answered', () => {
    const g = pricingGate(answeredAll)
    expect(g.missingIntegration).toEqual([])
    expect(g.missingSoftware).toEqual([])
    expect(g.blocked).toBe(false)
  })

  it('treats an explicit "None" as answered, an empty list as unasked', () => {
    expect(pricingGate({ ...answeredAll, interlocks: ['None'] }).softwareReady).toBe(true)
    expect(pricingGate({ ...answeredAll, interlocks: [] }).softwareReady).toBe(false)
    expect(pricingGate({ ...answeredAll, sharedTrafficTypes: ['None'] }).integrationReady).toBe(true)
    expect(pricingGate({ ...answeredAll, sharedTrafficTypes: [] }).integrationReady).toBe(false)
  })

  it('counts false as a real answer, undefined as missing', () => {
    expect(pricingGate({ ...answeredAll, wmsRequired: false }).softwareReady).toBe(true)
    expect(pricingGate({ ...answeredAll, wmsRequired: undefined }).missingSoftware).toContain('WMS integration')
  })

  it('blocks only the axis an input feeds', () => {
    const g = pricingGate({ ...answeredAll, pickDropLocationCount: undefined })
    expect(g.integrationReady).toBe(false)
    expect(g.softwareReady).toBe(true)
  })

  it('shared traffic blocks BOTH axes, since it scores on each', () => {
    const g = pricingGate({ ...answeredAll, sharedTrafficTypes: [] })
    expect(g.missingIntegration).toContain('Shared traffic in the area')
    expect(g.missingSoftware).toContain('Shared traffic in the area')
  })

  it('does not gate on the low-swing inputs', () => {
    // ramps (+1), custom load (+2) and barcode scanning (+2) are deliberately
    // outside the gate — too small to justify withholding a quote.
    const g = pricingGate({ ...answeredAll, rampRequired: undefined, barcodeScanningRequired: undefined })
    expect(g.blocked).toBe(false)
  })
})
