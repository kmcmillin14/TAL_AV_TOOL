import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillRequirements, fillMatrix, fillFlows } from '../tables'
import type { StoredProject } from '../../storage'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

const PROJECT = {
  projectName: 'Smoke', maxLoadWeightLbs: 2500, typicalUnitType: 'Pallet',
  transferMethod: 'Lift', deliveryPattern: 'Floor-Floor', minAisleWidthFt: 10,
  temperatureEnvironment: 'refrigerated', rampRequired: true, maxRampGrade: 5,
  outdoorRequired: false, shiftsPerDay: 2, hoursPerShift: 8, certifications: ['UL'],
  loads: [{ id: 'l1', unitType: 'Pallet', lengthIn: 48, widthIn: 40, heightIn: 50, weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

describe('P2 table fillers (end-to-end on the real template)', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('fills S18/19/20/24 with native tables that re-parse cleanly', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillRequirements(zip, PROJECT)
    fillMatrix(zip, PROJECT, vehicles)
    fillFlows(zip, model, names)

    const out = reopen(zip) // PizZip re-parse = valid zip + well-formed parts
    for (const n of [18, 19, 20, 24]) {
      expect(out.file(`ppt/slides/slide${n}.xml`)!.asText()).toContain('<a:tbl>')
    }
  })

  it('S18 lists captured requirements imperial-first', () => {
    const zip = load()
    fillRequirements(zip, PROJECT)
    const s18 = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('2,500 lbs')
    expect(s18).toContain('Refrigerated')
    expect(s18).toContain('Pallet')
  })

  it('S19 colors each verdict and S20 builds a gate×vehicle grid', () => {
    const zip = load()
    fillMatrix(zip, PROJECT, vehicles)
    const out = reopen(zip)
    const s19 = out.file('ppt/slides/slide19.xml')!.asText()
    expect(s19).toMatch(/2E7D32|C77700|C62828/)        // a verdict fill color
    expect(s19).toMatch(/GREEN|YELLOW|RED/)            // a verdict label
    const s20 = out.file('ppt/slides/slide20.xml')!.asText()
    expect(s20).toMatch(/✓|✗|~/)                       // pass/fail/review glyphs
    // one Gate column + one column per candidate vehicle
    const cols = (s20.match(/<a:gridCol\b/g) ?? []).length
    expect(cols).toBe(1 + vehicles.filter(v => ['8tb50a', '8hbc40a', 'm10', 'ml2', 'ebase7', 'cb18'].includes(v.id)).length)
  })

  it('S24 lists the flows with route and vehicle', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillFlows(zip, model, names)
    const s24 = reopen(zip).file('ppt/slides/slide24.xml')!.asText()
    expect(s24).toContain('Dock → Rack A')
    expect(s24).toContain('Mixed')                     // medium route label
  })
})
