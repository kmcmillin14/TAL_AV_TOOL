import { describe, it, expect } from 'vitest'
import { buildIntegrationTriggers, buildSoftwareTriggers, type ComplexityAnswers } from '../complexityInputs'

function answers(overrides: Partial<ComplexityAnswers> = {}): ComplexityAnswers {
  return {
    wmsIntegrationRequired: false,
    storageTrackingRequired: false,
    barcodeScanningRequired: false,
    hasPlcInterlock: false,
    trafficType: [],
    ramps: false,
    customLoad: false,
    hasAgvExperience: false,
    facilitySqFt: 0,
    pickDropLocationCount: 0,
    ...overrides,
  }
}

describe('buildIntegrationTriggers', () => {
  it('maps direct answer flags', () => {
    const t = buildIntegrationTriggers(
      answers({ trafficType: ['pedestrian', 'forklift'], ramps: true, customLoad: true, hasAgvExperience: true }),
      1
    )
    expect(t.trafficPedestrian).toBe(true)
    expect(t.trafficForklift).toBe(true)
    expect(t.ramps).toBe(true)
    expect(t.customLoad).toBe(true)
    expect(t.noAgvExperience).toBe(false) // hasAgvExperience true → noAgvExperience false
  })

  it('defaults hasAgvExperience=false to a triggered noAgvExperience', () => {
    const t = buildIntegrationTriggers(answers(), 1)
    expect(t.noAgvExperience).toBe(true)
  })

  it('never emits door/elevator/site-count keys (owner decision: no doors, no site count)', () => {
    const t = buildIntegrationTriggers(answers(), 1)
    expect(t).not.toHaveProperty('door')
    expect(t).not.toHaveProperty('elevator')
    expect(t).not.toHaveProperty('siteCount')
    expect(t).not.toHaveProperty('multiSite')
  })

  describe('fleet-size band boundaries (qty)', () => {
    it('qty 5 triggers no fleet band', () => {
      const t = buildIntegrationTriggers(answers(), 5)
      expect(t.fleetBand6to10).toBeUndefined()
      expect(t.fleetBand11to20).toBeUndefined()
      expect(t.fleetBand21plus).toBeUndefined()
    })
    it('qty 6 triggers fleetBand6to10', () => {
      const t = buildIntegrationTriggers(answers(), 6)
      expect(t.fleetBand6to10).toBe(true)
    })
    it('qty 11 triggers fleetBand11to20', () => {
      const t = buildIntegrationTriggers(answers(), 11)
      expect(t.fleetBand11to20).toBe(true)
      expect(t.fleetBand6to10).toBeUndefined()
    })
    it('qty 21 triggers fleetBand21plus', () => {
      const t = buildIntegrationTriggers(answers(), 21)
      expect(t.fleetBand21plus).toBe(true)
      expect(t.fleetBand11to20).toBeUndefined()
    })
  })

  describe('facility sqft band boundaries', () => {
    it('99_999 sqft triggers no band', () => {
      const t = buildIntegrationTriggers(answers({ facilitySqFt: 99_999 }), 1)
      expect(t.sqftBand100kTo250k).toBeUndefined()
    })
    it('100_000 sqft triggers sqftBand100kTo250k', () => {
      const t = buildIntegrationTriggers(answers({ facilitySqFt: 100_000 }), 1)
      expect(t.sqftBand100kTo250k).toBe(true)
    })
    it('250_000 sqft triggers sqftBand250kTo500k', () => {
      const t = buildIntegrationTriggers(answers({ facilitySqFt: 250_000 }), 1)
      expect(t.sqftBand250kTo500k).toBe(true)
      expect(t.sqftBand100kTo250k).toBeUndefined()
    })
    it('500_000 sqft triggers sqftBand500kPlus', () => {
      const t = buildIntegrationTriggers(answers({ facilitySqFt: 500_000 }), 1)
      expect(t.sqftBand500kPlus).toBe(true)
      expect(t.sqftBand250kTo500k).toBeUndefined()
    })
  })

  describe('pick/drop location count band boundaries', () => {
    it('9 triggers no band', () => {
      const t = buildIntegrationTriggers(answers({ pickDropLocationCount: 9 }), 1)
      expect(t.pickDropBand10to25).toBeUndefined()
    })
    it('10 triggers pickDropBand10to25', () => {
      const t = buildIntegrationTriggers(answers({ pickDropLocationCount: 10 }), 1)
      expect(t.pickDropBand10to25).toBe(true)
    })
    it('25 triggers pickDropBand25to50', () => {
      const t = buildIntegrationTriggers(answers({ pickDropLocationCount: 25 }), 1)
      expect(t.pickDropBand25to50).toBe(true)
      expect(t.pickDropBand10to25).toBeUndefined()
    })
    it('50 triggers pickDropBand50plus', () => {
      const t = buildIntegrationTriggers(answers({ pickDropLocationCount: 50 }), 1)
      expect(t.pickDropBand50plus).toBe(true)
      expect(t.pickDropBand25to50).toBeUndefined()
    })
  })
})

describe('buildSoftwareTriggers', () => {
  it('maps direct software-layer flags only', () => {
    const t = buildSoftwareTriggers(
      answers({
        wmsIntegrationRequired: true,
        storageTrackingRequired: true,
        barcodeScanningRequired: true,
        hasPlcInterlock: true,
        trafficType: ['otherAgv'],
      })
    )
    expect(t).toEqual({
      wmsIntegration: true,
      storageTracking: true,
      barcodeScanning: true,
      otherAgvTraffic: true,
      automationInterface: true,
    })
  })

  it('never emits a multiSite key (owner decision: no site count)', () => {
    const t = buildSoftwareTriggers(answers())
    expect(t).not.toHaveProperty('multiSite')
  })
})
