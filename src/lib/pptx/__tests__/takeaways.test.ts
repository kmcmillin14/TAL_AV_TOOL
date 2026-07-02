import { describe, it, expect, beforeAll } from 'vitest'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import type { StoredProject } from '../../storage'
import type { TextRun } from '../ooxml'
import { financialsTakeaway, fleetFlowTakeaway, investmentTakeaway, roiTakeaway } from '../takeaways'

const text = (runs: TextRun[] | null) => (runs ?? []).map(r => r.t).join('')

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

describe('money-slide takeaways', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('full model → complete sentences with figures as bold red runs', () => {
    const m = computeFleetModel(FULL, vehicles)
    const fin = financialsTakeaway(m)!
    expect(text(fin)).toMatch(/^A \$.+ investment returns \$.+\/yr net — payback in \d+\.\d years\.$/)
    expect(fin.some(r => r.bold && r.color === 'EB0A1E')).toBe(true)

    expect(text(fleetFlowTakeaway(m))).toMatch(/^\d+ vehicles across \d+ types handle 35 moves\/hr at \d+% utilization\.$/)
    expect(text(investmentTakeaway(m))).toMatch(/^Total ROM investment: \$.+ for \d+ vehicles\.$/)
    expect(text(roiTakeaway(m, 10))).toMatch(/^Breaks even in \d+\.\d years — \+\$.+ cumulative over 10 years\.$/)
  })

  it('partial model → clauses drop, no placeholder text', () => {
    const m = computeFleetModel(NO_LABOR, vehicles)
    expect(roiTakeaway(m, 10)).toBeNull()                       // no payback at all
    const fin = text(financialsTakeaway(m))
    expect(fin).not.toContain('payback')                        // clause dropped
    expect(fin).not.toContain('returns')                        // no net benefit clause
    expect(fin).toMatch(/^A \$.+ investment\.$/)
  })

  it('empty project → every builder returns null', () => {
    const m = computeFleetModel(EMPTY, vehicles)
    expect(financialsTakeaway(m)).toBeNull()
    expect(fleetFlowTakeaway(m)).toBeNull()
    expect(investmentTakeaway(m)).toBeNull()
    expect(roiTakeaway(m, 10)).toBeNull()
  })
})
