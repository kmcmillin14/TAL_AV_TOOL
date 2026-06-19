import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillRequirements, fillMatrix, fillMaterialFlow, fillFleetEngine, fillInvestment, fillRoi } from '../tables'
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
    fillMaterialFlow(zip, model, names)

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

  it('fills S21/22/23 with a tier caption, progression strip, and worked derivation', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillFleetEngine(zip, model, vehicles, names)
    const out = reopen(zip)

    for (const n of [21, 22, 23]) {
      const xml = out.file(`ppt/slides/slide${n}.xml`)!.asText()
      // progression strip + derivation table = two tables; placeholder gone
      expect((xml.match(/<a:tbl>/g) ?? []).length).toBe(2)
      expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
      expect(xml).toContain('TOTAL')                 // progression Raw…=Total
      expect(xml).toContain('What it means')         // derivation columns
    }
    // Each tier names itself and shows its headline derivation step.
    const s21 = out.file('ppt/slides/slide21.xml')!.asText()
    expect(s21).toContain('TIER 1')
    expect(s21).toContain('Cycle time')
    expect(s21).toContain('throughput × cycle ÷ 3600')
    expect(s21).toContain('Inputs —')                  // all variables in the caption
    expect(s21).toContain('Loaded speed')
    const s22 = out.file('ppt/slides/slide22.xml')!.asText()
    expect(s22).toContain('TIER 2')
    expect(s22).toContain('Availability')
    const s23 = out.file('ppt/slides/slide23.xml')!.asText()
    expect(s23).toContain('TIER 3')
    expect(s23).toContain('Fleet (sold)')
  })

  it('S27 builds the per-line pricing table with a TOTAL row', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillInvestment(zip, model, names)
    const s27 = reopen(zip).file('ppt/slides/slide27.xml')!.asText()
    expect(s27).toContain('<a:tbl>')
    expect(s27).toContain('Line Total (ROM)')
    expect(s27).toContain('TOTAL')
    expect(s27).toMatch(/\$[\d.,]+[MK]?/)              // money-formatted range
    expect(s27).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)   // placeholder cleared
  })

  it('S28 ROI table fills alone, and embeds the chart when a PNG is supplied', () => {
    const model = computeFleetModel(PROJECT, vehicles)
    // table-only (non-DOM): no image
    const a = load()
    fillRoi(a, model)
    const s28a = reopen(a).file('ppt/slides/slide28.xml')!.asText()
    expect(s28a).toContain('Simple payback')
    expect(s28a).not.toContain('<p:pic>')
    // with a chart PNG
    const b = load()
    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'))
    fillRoi(b, model, png)
    expect(reopen(b).file('ppt/slides/slide28.xml')!.asText()).toContain('<p:pic>')
  })

  it('S24 lists the flows with route and vehicle', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillMaterialFlow(zip, model, names)
    const s24 = reopen(zip).file('ppt/slides/slide24.xml')!.asText()
    expect(s24).toContain('Dock → Rack A')
    expect(s24).toContain('Mixed')                     // medium route label
    expect(s24).not.toContain('<p:pic>')               // no image when none supplied
  })

  it('S24 embeds the diagram image (media part + picture) when a PNG is supplied', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'))
    fillMaterialFlow(zip, model, names, png)
    const out = reopen(zip)
    const s24 = out.file('ppt/slides/slide24.xml')!.asText()
    expect(s24).toContain('<p:pic>')
    expect(s24).toMatch(/r:embed="rId\d+"/)
    // media part written and referenced by the slide rels
    const media = Object.keys(out.files).filter(n => /^ppt\/media\/image\d+\.png$/.test(n))
    expect(media.length).toBeGreaterThan(0)
    expect(out.file('ppt/slides/_rels/slide24.xml.rels')!.asText()).toMatch(/media\/image\d+\.png/)
  })
})
