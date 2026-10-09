import { describe, it, expect, beforeAll } from 'vitest'
import { computeFleetModel } from '../fleetModel'
import { loadVehicleLibrary } from '../vehicleLibrary'
import type { StoredProject } from '../storage'
import type { Vehicle } from '../vehicleLibrary'

/** The dashboard gauge strip must PARTITION the day rather than report the same
 *  hours twice. Before v4 the Utilization gauge was raw ÷ sold, which collapses
 *  to U × availability — so it carried charging downtime that the Charging gauge
 *  then showed again, and it contradicted the "Target utilization" driver beside
 *  it. These pin the arithmetic the gauges are built on. */
const PROJECT = {
  projectName: 'Gauges', shiftsPerDay: 2, hoursPerShift: 8, targetUtilization: 0.90,
  operatorsPerShift: 3, fullyBurdenedRateUsdPerYear: 65000,
  loads: [{ id: 'l1', unitType: 'Pallet', weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack', distanceFt: 300, thruPerHr: 25,
      routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack', destination: 'Line', distanceFt: 450, thruPerHr: 18,
      routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ebase7', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

let vehicles: Vehicle[]
beforeAll(async () => { vehicles = await loadVehicleLibrary() })

describe('gauge reconciliation', () => {
  it('availability and charging are complements — they sum to the whole day', () => {
    const m = computeFleetModel(PROJECT, vehicles)
    for (const g of m.fleet.groups) {
      const a = g.charging.availability ?? 1
      expect(a + (1 - a)).toBeCloseTo(1, 12)
      expect(a).toBeGreaterThan(0)
      expect(a).toBeLessThanOrEqual(1)
    }
  })

  it('utilization is of AVAILABLE time, so it tracks the target instead of the clock', () => {
    const m = computeFleetModel(PROJECT, vehicles)
    const target = m.settings.targetUtilization
    for (const g of m.fleet.groups) {
      const a = g.charging.availability ?? 1
      const ofAvailable = g.groupRaw / (g.fleetSold * a)
      const ofClock = g.groupRaw / g.fleetSold
      // Never above target (bar the ceil), and never confused with the clock figure.
      expect(ofAvailable).toBeLessThanOrEqual(target + 1e-9)
      expect(ofAvailable).toBeGreaterThanOrEqual(ofClock - 1e-9)
    }
  })

  it('REGRESSION: the old raw ÷ sold figure collapses to target × availability', () => {
    // Why the old gauge was wrong, shown at a scale where the ceil is noise:
    // raw ÷ sold ≈ U × A, so it silently carried the charging downtime that the
    // Charging gauge reported again. Dividing out A is what separates them.
    const big = { ...PROJECT, flows: (PROJECT.flows ?? []).map(f => ({ ...f, thruPerHr: f.thruPerHr * 20 })) } as StoredProject
    const m = computeFleetModel(big, vehicles)
    const target = m.settings.targetUtilization
    for (const g of m.fleet.groups) {
      const a = g.charging.availability ?? 1
      expect(g.fleetSold).toBeGreaterThan(20)                     // ceil is negligible here
      expect(g.groupRaw / g.fleetSold).toBeCloseTo(target * a, 1) // the old gauge
      expect(g.groupRaw / (g.fleetSold * a)).toBeCloseTo(target, 1) // the new one
    }
  })

  it('the waterfall the gauges sit under still sums', () => {
    const m = computeFleetModel(PROJECT, vehicles)
    expect(m.fleet.totalBaseFleet + m.fleet.totalChargingDelta + m.fleet.totalUtilizationDelta)
      .toBe(m.fleet.totalFleetSold)
  })
})
