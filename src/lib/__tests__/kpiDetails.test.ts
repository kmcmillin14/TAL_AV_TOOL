import { describe, it, expect, beforeAll } from 'vitest'
import { loadVehicleLibrary, type Vehicle } from '../vehicleLibrary'
import { computeFleetModel } from '../fleetModel'
import { kpiDetails } from '../kpiDetails'
import type { StoredProject } from '../storage'

const PROJECT = {
  shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.1, numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000,
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

describe('kpiDetails', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('builds a detail for every KPI tile', () => {
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    const d = kpiDetails(model, names)

    expect(Object.keys(d).sort()).toEqual(
      ['capex', 'costPerMove', 'energy', 'fleet', 'flows', 'net', 'offset', 'opex',
       'payback', 'resilience', 'tco', 'throughput', 'types', 'utilization'])
    // New economics KPIs carry detail too.
    expect(d.opex.formula).toContain('=')
    expect(d.resilience.rows!.some(r => r.label === 'Throughput retained')).toBe(true)
    // Fleet: build-up formula with buffer multiplier.
    expect(d.fleet.formula).toContain('buffer')
    expect(d.fleet.bars!.length).toBe(model.fleet.groups.length)
    // CAPEX: a range formula + one bar per pricing line, fractions within 0–1.
    expect(d.capex.formula).toMatch(/\$.*–.*\$/)
    expect(d.capex.bars!.length).toBe(model.rom.pricing.lines.length)
    for (const b of d.capex.bars!) expect(b.frac).toBeGreaterThan(0)
    // Payback rows present.
    expect(d.payback.rows!.some(r => r.label === 'Simple payback')).toBe(true)
    // Throughput: a bar per flow.
    expect(d.throughput.bars!.length).toBe(PROJECT.flows!.length)
  })
})
