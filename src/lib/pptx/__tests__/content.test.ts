import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillKpis } from '../content'
import type { StoredProject } from '../../storage'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

const PROJECT = {
  projectName: 'Smoke', maxLoadWeightLbs: 2500, typicalUnitType: 'Pallet',
  transferMethod: 'Lift', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.1,
  numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000,
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

describe('fillKpis (S25/26 KPI slides)', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  const fill = (zip: PizZip, model: ReturnType<typeof computeFleetModel>) => {
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    const vehicleById = new Map(vehicles.map(v => [v.id, v]))
    fillKpis(zip, model, names, vehicleById, 10)
  }

  it('fills S25/26 with native metric tiles mirroring the dashboard, re-parsing cleanly', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fill(zip, model)

    const out = reopen(zip)
    const s25 = out.file('ppt/slides/slide25.xml')!.asText()
    const s26 = out.file('ppt/slides/slide26.xml')!.asText()
    // Section eyebrows (two hero boxes like the Step-4 dashboard).
    expect(s25).toContain('FINANCIALS')
    expect(s26).toContain('FLEET &amp; FLOW')
    // Native tiles: rounded-rect cards with an accent rule, not placeholder text.
    expect(s25).toContain('KPI Tile')
    expect(s25).toContain('KPI Rule')
    expect(s25).toContain('roundRect')
    // S25 = full financial tile set.
    for (const l of ['ROM CAPEX', 'NET BENEFIT / YR', 'PAYBACK', 'LABOR OFFSET / YR', 'ANNUAL OPEX', 'TCO @ 10YR', 'COST / MOVE']) {
      expect(s25).toContain(l)
    }
    expect((s25.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(7)
    // S26 = fleet/flow tiles + status gauges + fleet-mix caption.
    for (const l of ['TOTAL FLEET', 'VEHICLE TYPES', 'FLOWS', 'THROUGHPUT', 'UTILIZATION', 'AVAILABILITY', 'CHARGING', 'REDUNDANCY']) {
      expect(s26).toContain(l)
    }
    expect((s26.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(9)
    expect(s26).toContain('Fleet mix —')
    // Body placeholder cleared so nothing ghosts behind the tiles.
    expect(s25).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
    expect(s26).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('no-ops on a removed slide (fills only what remains)', () => {
    const zip = load()
    zip.remove('ppt/slides/slide25.xml')      // simulate the section being dropped
    const model = computeFleetModel(PROJECT, vehicles)
    expect(() => fill(zip, model)).not.toThrow()
    expect(reopen(zip).file('ppt/slides/slide26.xml')!.asText()).toContain('FLEET &amp; FLOW')
  })
})
