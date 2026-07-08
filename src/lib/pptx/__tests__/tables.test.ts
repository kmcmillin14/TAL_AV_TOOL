import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillRequirements, fillMatrix, fillMaterialFlow, fillFleetEngine, fillInvestment, fillRoi, fillMethodology, fillFlowMath } from '../tables'
import { cloneSlide } from '../ooxml'
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
    // Restyled tables: white header (ink text) + TAL-red underline rule, no zebra.
    const s18 = out.file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('<a:lnB w="19050" cap="flat"><a:solidFill><a:srgbClr val="EB0A1E"/></a:solidFill></a:lnB>') // red header rule
    expect(s18).not.toContain('F6F6F7')                         // zebra gone
    expect(s18).toContain('<a:srgbClr val="E4E4E7"/>')          // hairline body dividers
    expect(s18).toContain('<a:srgbClr val="2B2B2B"/>')          // ink text
    expect(s18).toContain('<a:noFill/>')                        // header/body cells unpainted
  })

  it('S18 leads with headline spec tiles + a table for the rest', () => {
    const zip = load()
    fillRequirements(zip, PROJECT)
    const s18 = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    // headline tiles
    expect(s18).toContain('KPI Tile')
    expect(s18).toContain('MAX LOAD')
    expect(s18).toContain('2,500')            // max load figure (unit "lbs" is a separate run)
    expect(s18).toContain('FOOTPRINT (L×W×H)')
    // remaining requirements still in the table
    expect(s18).toContain('Refrigerated')
    expect(s18).toContain('Pallet')
    expect(s18).toContain('01 — APPLICATION REQUIREMENTS')     // eyebrow
  })

  it('S19 colors each verdict and S20 builds a gate×vehicle grid', () => {
    const zip = load()
    fillMatrix(zip, PROJECT, vehicles)
    const out = reopen(zip)
    const s19 = out.file('ppt/slides/slide19.xml')!.asText()
    expect(s19).toMatch(/2E7D32|C77700|C62828/)        // a verdict fill color
    expect(s19).toMatch(/GREEN|YELLOW|RED/)            // a verdict label
    // Modern KPI-tile summary band (verdict counts) above the table.
    expect(s19).toContain('KPI Tile')
    expect(s19).toContain('PASS')
    expect(s19).toContain('REVIEW')
    expect(s19).toContain('CANDIDATES')
    expect(s19).toContain('02 — VEHICLE SELECTION')            // eyebrow
    const s20 = out.file('ppt/slides/slide20.xml')!.asText()
    expect(s20).toContain('02 — VEHICLE SELECTION')
    expect(s20).toContain('not evaluated')                     // glyph legend caption
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
      // progression tile row + one derivation table; placeholder gone
      expect((xml.match(/<a:tbl>/g) ?? []).length).toBe(1)
      expect(xml).toContain('KPI Tile')              // progression tiles
      expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
      expect(xml).toContain('RAW FLEET')             // progression Raw…=Fleet sold
      expect(xml).toContain('= FLEET SOLD')
      expect(xml).toContain('What it means')         // derivation columns
      expect(xml).toContain('03 — FLEET ENGINE · TIER')        // eyebrow
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

  it('fillMethodology builds the variables/formula/why reference table on a cloned slide', () => {
    const zip = load()
    const slide = cloneSlide(zip, 18)!
    fillMethodology(zip, slide)
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('<a:tbl>')
    expect(xml).toContain('Variables')                    // header
    expect(xml).toContain('(Q × cycle) ÷ 3600')           // a formula
    expect(xml).toContain('Availability')                 // a variable name
    expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)       // body placeholder cleared
  })

  it('fillFlowMath shows each flow\'s substituted cycle formula and demand', () => {
    const zip = load()
    const slide = cloneSlide(zip, 18)!
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillFlowMath(zip, slide, model, vehicles, names, model.flows)
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('<a:tbl>')
    expect(xml).toContain('Dock → Rack A')                 // a flow, by route
    expect(xml).toContain('÷ 3600')                        // demand formula with figures
    // a row per assigned flow (PROJECT has 2) + header
    expect((xml.match(/<a:tr\b/g) ?? []).length).toBe(1 + model.flows.filter(f => f.vehicleId).length)
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
