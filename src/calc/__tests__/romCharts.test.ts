import { describe, it, expect } from 'vitest'
import {
  flowDiagramSeries, dutyCycleSeries, utilizationSeries, chargingSeries,
  batterySocSeries, capexBarsSeries, paybackSeries, tcoSeries,
} from '../romCharts'
import type { CycleBreakdown, FleetSummary, Flow, FlowDerived } from '../types'
import type { RomSummary } from '../rom'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

function flow(id: string, origin: string, destination: string, thruPerHr: number, vehicleId: string): Flow {
  return { id, origin, destination, distanceFt: 100, thruPerHr, routeLayout: 'medium', liftHeightFt: 0, vehicleId }
}
function vstub(id: string, name: string): Vehicle {
  return { id, name, calc: {} } as unknown as Vehicle
}
function fleetWith(fleetSold: Record<string, number>): FleetSummary {
  return {
    groups: Object.entries(fleetSold).map(([vehicleId, n]) => ({
      vehicleId, groupRaw: n, baseFleet: n,
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 1, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: n, fleetSold: n,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: Object.values(fleetSold).reduce((s, n) => s + n, 0), bufferPct: 0.1,
  }
}
function bd(over: Partial<CycleBreakdown>): CycleBreakdown {
  return { travelLoadedSec: 0, travelEmptySec: 0, loadSec: 0, unloadSec: 0, liftTimeSec: 0, totalSec: 0,
    methodName: '', liftHeightFt: 0, routeLayout: 'medium', routeLayoutFactor: 0.5, ...over }
}

describe('flowDiagramSeries', () => {
  it('groups edges by origin with thru/hr, dest, vehicle name and fleet qty', () => {
    const flows = [flow('f1', 'A', 'C', 43, 'cb18'), flow('f2', 'A', 'D', 38, 'cb18')]
    const vById = new Map([['cb18', vstub('cb18', 'CB18 AGF')]])
    const s = flowDiagramSeries(flows, vById, fleetWith({ cb18: 10 }))
    expect(s.origins).toHaveLength(1)
    expect(s.origins[0].label).toBe('A')
    expect(s.origins[0].edges).toHaveLength(2)
    expect(s.origins[0].edges[0]).toMatchObject({ destLabel: 'C', thruPerHr: 43, vehicleName: 'CB18 AGF', vehicleId: 'cb18', qty: 10 })
  })

  it('skips flows without a vehicle or origin', () => {
    const s = flowDiagramSeries([flow('f1', '', 'C', 10, 'cb18')], new Map(), fleetWith({}))
    expect(s.origins).toHaveLength(0)
  })
})

describe('dutyCycleSeries', () => {
  it('weights activity seconds by throughput and adds a charging fraction', () => {
    const flows = [flow('f1', 'A', 'C', 100, 'cb18')]
    const dByF = new Map<string, FlowDerived>([['f1', { cycleSeconds: 100, rawVehicles: 1,
      breakdown: bd({ travelLoadedSec: 40, travelEmptySec: 20, loadSec: 10, unloadSec: 10, liftTimeSec: 20, totalSec: 100 }) }]])
    const f = fleetWith({ cb18: 1 })
    f.groups[0].charging.availability = 0.8
    const s = dutyCycleSeries(flows, dByF, f)
    const frac = (k: string) => s.segments.find(x => x.key === k)!.fraction
    expect(frac('charging')).toBeCloseTo(0.2, 5)
    expect(frac('driveLoaded') + frac('driveEmpty')).toBeCloseTo(0.6 * 0.8, 5)
    const sum = s.segments.reduce((a, x) => a + x.fraction, 0)
    expect(sum).toBeCloseTo(1, 5)
  })
})

describe('utilizationSeries', () => {
  it('emits raw demand, base, and sold per vehicle type', () => {
    const f = fleetWith({ cb18: 4 })
    f.groups[0].groupRaw = 2.4; f.groups[0].baseFleet = 3; f.groups[0].fleetSold = 4
    const s = utilizationSeries(f, new Map([['cb18', vstub('cb18', 'CB18')]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', rawDemand: 2.4, baseFleet: 3, fleetSold: 4 })
  })
})

describe('chargingSeries', () => {
  it('emits per-type runtime, recharge, method, availability', () => {
    const f = fleetWith({ cb18: 2 })
    Object.assign(f.groups[0].charging, { runHr: 6, chargeHr: 4, method: 'plugged', availability: 0.6 })
    const s = chargingSeries(f, new Map([['cb18', vstub('cb18', 'CB18')]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', runHr: 6, chargeHr: 4, method: 'plugged', availability: 0.6 })
  })
})

describe('batterySocSeries', () => {
  it('samples a depletion-to-DOD-floor then recharge sawtooth across the day', () => {
    const f = fleetWith({ cb18: 1 })
    Object.assign(f.groups[0].charging, { runHr: 5, chargeHr: 2.5 })
    const s = batterySocSeries(f, new Map([['cb18', vstub('cb18', 'CB18')]]), 10, 0.5)
    expect(s.rows[0].dodFloor).toBeCloseTo(0.2, 5)
    expect(s.rows[0].points[0]).toMatchObject({ hr: 0, soc: 1 })
    for (const p of s.rows[0].points) { expect(p.soc).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(p.soc).toBeLessThanOrEqual(1 + 1e-9) }
    expect(s.rows[0].points[s.rows[0].points.length - 1].hr).toBeCloseTo(10, 5)
  })
})

const romFix: RomSummary = {
  pricing: { lines: [{ vehicleId: 'cb18', fleetSold: 10, unitMin: 165000, unitMax: 210000, lineMin: 1650000, lineMax: 2100000 }],
             totalMin: 1650000, totalMax: 2100000, totalMid: 1875000 },
  opex: { annualEnergyKwh: 1, annualEnergyCost: 1000, annualMaintenance: 150000, annualOpex: 151000 },
  payback: { annualLaborOffset: 600000, netAnnualBenefit: 449000, paybackYears: 1875000 / 449000 },
}

describe('capexBarsSeries', () => {
  it('emits per-vehicle line ranges + totals', () => {
    const s = capexBarsSeries(romFix, new Map([['cb18', vstub('cb18', 'CB18')]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', qty: 10, lineMin: 1650000, lineMax: 2100000 })
    expect(s.totalMin).toBe(1650000); expect(s.totalMax).toBe(2100000)
  })
})

describe('paybackSeries', () => {
  it('cumulative cash flow starts at −CAPEX and rises by net benefit; marks break-even', () => {
    const s = paybackSeries(romFix, 7)
    expect(s.points[0]).toMatchObject({ year: 0 })
    expect(s.points[0].cumulative).toBeCloseTo(-1875000, 5)
    expect(s.points[1].cumulative).toBeCloseTo(-1875000 + 449000, 5)
    expect(s.breakEvenYear).toBeCloseTo(1875000 / 449000, 5)
  })
})

describe('tcoSeries', () => {
  it('accumulates capex + opex vs labor offset by year', () => {
    const s = tcoSeries(romFix, 7)
    expect(s.points[2]).toMatchObject({ year: 2, capex: 1875000 })
    expect(s.points[2].cumOpex).toBeCloseTo(151000 * 2, 5)
    expect(s.points[2].cumLaborOffset).toBeCloseTo(600000 * 2, 5)
    expect(s.points[2].net).toBeCloseTo(1875000 + 151000 * 2 - 600000 * 2, 5)
  })
})
