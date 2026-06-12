import { describe, it, expect } from 'vitest'
import { computeFleetModel } from '../fleetModel'
import type { StoredProject } from '../storage'
import type { Vehicle } from '../vehicleLibrary'
import cb18 from '../../content/vehicles/cb18.json'

const vehicles = [cb18 as unknown as Vehicle]

const project = {
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

describe('computeFleetModel (exporters share useFleetData’s derivation)', () => {
  it('derives flows → fleet → ROM in one pure call', () => {
    const m = computeFleetModel(project, vehicles)
    expect(m.derivedByFlowId.get('f1')?.cycleSeconds).toBeCloseTo(249.84, 1) // spec verification row 1
    expect(m.fleet.totalBaseFleet).toBeGreaterThan(0)
    expect(m.fleet.totalFleetSold).toBeGreaterThanOrEqual(m.fleet.totalBaseFleet)
    // derived defaults port: Mon–Fri → 260 days; operators 3 × 2 shifts = 6
    expect(m.costs.operatingDaysPerYear).toBe(260)
    expect(m.costs.numberOfOperators).toBe(6)
    // simple ROI: payback = capex mid / labor offset
    expect(m.rom.payback.paybackYears).toBeCloseTo(
      m.rom.pricing.totalMid / m.rom.payback.annualLaborOffset, 6)
  })

  it('empty project → zero fleet, null payback, no throw', () => {
    const empty = { ...project, flows: [], operatorsPerShift: 0 } as StoredProject
    const m = computeFleetModel(empty, vehicles)
    expect(m.fleet.totalFleetSold).toBe(0)
    expect(m.rom.payback.paybackYears).toBeNull()
  })
})
