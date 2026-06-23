import { describe, it, expect } from 'vitest'
import { applyDrivers, scenarioKpis, diffKpis } from '../scenario'
import { computeFleetModel } from '../fleetModel'
import type { StoredProject } from '../storage'
import type { Vehicle } from '../vehicleLibrary'
import cb18 from '../../content/vehicles/cb18.json'

const vehicles = [cb18 as unknown as Vehicle]

const base = {
  id: 'p1', createdAt: '', updatedAt: '', versionNumber: 'v1',
  step1Complete: true, step2Complete: true, step3Complete: false, step4Complete: false,
  shiftsPerDay: 2, hoursPerShift: 8,
  operatorsPerShift: 3,
  operatingDaysPattern: 'Mon–Fri',
  bufferPct: 0.10,
  flows: [
    { id: 'f1', origin: 'A', destination: 'B', distanceFt: 590, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
  ],
} as unknown as StoredProject

describe('applyDrivers', () => {
  it('overrides only the provided keys and does not mutate the source', () => {
    const out = applyDrivers(base, { fullyBurdenedRateUsdPerYear: 90000 })
    expect(out.fullyBurdenedRateUsdPerYear).toBe(90000)
    expect(out.bufferPct).toBe(base.bufferPct)            // untouched
    expect(base.fullyBurdenedRateUsdPerYear).toBeUndefined() // source unchanged
  })

  it('ignores undefined / NaN driver values', () => {
    const out = applyDrivers(base, { bufferPct: undefined, shiftsPerDay: NaN })
    expect(out.bufferPct).toBe(base.bufferPct)
    expect(out.shiftsPerDay).toBe(base.shiftsPerDay)
  })

  it('clears a pinned numberOfOperators when operators/shifts are part of the scenario', () => {
    const pinned = { ...base, numberOfOperators: 99 } as StoredProject
    const out = applyDrivers(pinned, { operatorsPerShift: 4 })
    // derived (4 × 2 shifts = 8) should flow, not the pinned 99
    const m = computeFleetModel(out, vehicles)
    expect(m.costs.numberOfOperators).toBe(8)
  })
})

describe('scenarioKpis', () => {
  it('pulls the comparable scalar KPIs from a model', () => {
    const m = computeFleetModel(base, vehicles)
    const k = scenarioKpis(m)
    expect(k.totalFleetSold).toBe(m.fleet.totalFleetSold)
    expect(k.vehicleTypes).toBe(m.fleet.groups.length)
    expect(k.capexMid).toBeCloseTo(m.rom.pricing.totalMid, 6)
    expect(k.annualOpex).toBeCloseTo(m.rom.opex.annualOpex, 6)
    expect(k.netAnnualBenefit).toBeCloseTo(
      m.rom.payback.annualLaborOffset - m.rom.opex.annualOpex, 6)
    expect(k.paybackYears).toBe(m.rom.payback.paybackYears)
  })
})

describe('scenario recompute (what-if)', () => {
  it('higher labor rate → larger offset → shorter payback', () => {
    const b = scenarioKpis(computeFleetModel(base, vehicles))
    const s = scenarioKpis(computeFleetModel(applyDrivers(base, { fullyBurdenedRateUsdPerYear: 120000 }), vehicles))
    expect(b.paybackYears).not.toBeNull()
    expect(s.paybackYears).not.toBeNull()
    expect(s.paybackYears!).toBeLessThan(b.paybackYears!)
    expect(s.annualLaborOffset).toBeGreaterThan(b.annualLaborOffset)
  })

  it('higher buffer never shrinks the fleet or CAPEX (buffer drives fleet size)', () => {
    const b = scenarioKpis(computeFleetModel(base, vehicles))
    const s = scenarioKpis(computeFleetModel(applyDrivers(base, { bufferPct: 0.6 }), vehicles))
    expect(s.totalFleetSold).toBeGreaterThanOrEqual(b.totalFleetSold)
    expect(s.capexMax).toBeGreaterThanOrEqual(b.capexMax)
  })
})

describe('diffKpis', () => {
  it('reports scenario − baseline per KPI, with null payback handled', () => {
    const b = scenarioKpis(computeFleetModel(base, vehicles))
    const s = scenarioKpis(computeFleetModel(applyDrivers(base, { fullyBurdenedRateUsdPerYear: 120000 }), vehicles))
    const d = diffKpis(b, s)
    expect(d.annualLaborOffset).toBeCloseTo(s.annualLaborOffset - b.annualLaborOffset, 6)
    expect(d.paybackYears).toBeCloseTo(s.paybackYears! - b.paybackYears!, 6)

    // null baseline payback → delta null (can't subtract)
    const noOffset = scenarioKpis(computeFleetModel({ ...base, operatorsPerShift: 0 } as StoredProject, vehicles))
    expect(noOffset.paybackYears).toBeNull()
    expect(diffKpis(noOffset, s).paybackYears).toBeNull()
  })
})
