import { describe, it, expect, beforeAll } from 'vitest'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import type { StoredProject } from '../../storage'
import {
  requirementsTitle, vehiclesTitle, fleetTitle, flowTitle,
  financialsTitle, investmentTitle, roiTitle, FALLBACK_TITLE,
} from '../takeaways'

// Sized fleet with labor economics → every takeaway computable.
const FULL = {
  projectName: 'Smoke', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.1,
  numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000,
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

// Fleet sized but no operators → no labor offset → no payback.
const NO_LABOR = { ...FULL, numberOfOperators: undefined } as unknown as StoredProject

const EMPTY = { projectName: 'Empty' } as unknown as StoredProject

describe('slide title claims', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('full model → short second-person claims (≤ 60 chars, no trailing period)', () => {
    const m = computeFleetModel(FULL, vehicles)
    const titles = [
      fleetTitle(m), flowTitle(m), financialsTitle(m), investmentTitle(m), roiTitle(m, 10),
    ]
    for (const t of titles) {
      expect(t).toBeTruthy()
      expect(t!.length).toBeLessThanOrEqual(60)
      expect(t!.endsWith('.')).toBe(false)
    }
    expect(fleetTitle(m)).toMatch(/^Your operation needs a fleet of \d+$/)
    expect(flowTitle(m)).toMatch(/^2 flows move \d+ loads every hour$/)
    expect(financialsTitle(m)).toMatch(/^Payback in about \d+\.\d years$/)
    expect(investmentTitle(m)).toMatch(/^\$.+ for \d+ vehicles$/)
    expect(roiTitle(m, 10)).toMatch(/^\$.+ back over 10 years$/)
    expect(vehiclesTitle(2)).toBe('2 vehicles fit your application')
    expect(vehiclesTitle(1)).toBe('One vehicle fits your application')
  })

  it('requirements claim from load + schedule', () => {
    const p = { projectName: 'R', maxLoadWeightLbs: 2500, typicalUnitType: 'Pallet',
      shiftsPerDay: 2, hoursPerShift: 8 } as unknown as StoredProject
    // Plain 'Pallet' → 'pallets' (no "standard " prefix to strip)
    expect(requirementsTitle(p)).toBe('Moving 2,500-lb pallets, 16 hours a day')
    expect(requirementsTitle({ ...p, shiftsPerDay: undefined } as unknown as StoredProject))
      .toBe('Moving 2,500-lb pallets')
    expect(requirementsTitle({ projectName: 'R' } as unknown as StoredProject)).toBeNull()
    // 'Standard Pallet' → strips "Standard " prefix → 'pallets'
    const pStandard = { ...p, typicalUnitType: 'Standard Pallet' } as unknown as StoredProject
    expect(requirementsTitle(pStandard)).toBe('Moving 2,500-lb pallets, 16 hours a day')
    // 'IBC' → acronym (all caps) preserved → 'IBCs'
    const pIbc = { ...p, typicalUnitType: 'IBC' } as unknown as StoredProject
    expect(requirementsTitle(pIbc)).toContain('IBCs')
    // 'Other' with no description → null
    const pOther = { ...p, typicalUnitType: 'Other', otherUnitTypeDescription: undefined } as unknown as StoredProject
    expect(requirementsTitle(pOther)).toBeNull()
  })

  it('flowTitle singular uses "moves" (verb agreement)', () => {
    const oneFlow = { ...FULL, flows: [FULL.flows![0]] } as unknown as StoredProject
    const m = computeFleetModel(oneFlow, vehicles)
    expect(flowTitle(m)).toMatch(/^1 flow moves \d+ loads every hour$/)
  })

  it('degrades: no payback → investment-range financials claim; nulls when empty', () => {
    const m = computeFleetModel(NO_LABOR, vehicles)
    expect(financialsTitle(m)).toMatch(/^A \$.+ ROM investment$/)
    expect(roiTitle(m, 10)).toBeNull()

    const e = computeFleetModel(EMPTY, vehicles)
    expect(fleetTitle(e)).toBeNull()
    expect(flowTitle(e)).toBeNull()
    expect(financialsTitle(e)).toBeNull()
    expect(investmentTitle(e)).toBeNull()
    expect(vehiclesTitle(0)).toBeNull()
  })

  it('every slide has a descriptive fallback', () => {
    expect(Object.values(FALLBACK_TITLE).every(t => t.length > 0)).toBe(true)
  })
})
