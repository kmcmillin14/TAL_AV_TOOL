import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import { computeFleetModel } from '../../fleetModel'
import { fillFinancials, fillCostDetail } from '../content'
import { fillInvestment, fillRoi } from '../tables'
import { ROM_SLIDE } from '../sections'
import type { StoredProject } from '../../storage'
import type { Vehicle } from '../../vehicleLibrary'

/** The customer deck is the one artifact that leaves the building, and before
 *  2026-10-02 it was the one surface with no pricing gate: a project whose
 *  Step 4 read "Not priced" still exported a full CAPEX range, payback, TCO and
 *  a priced TOTAL. The gate now rides on FleetModel so every deck surface
 *  inherits it. These tests pin that — they fail if any pricing slide starts
 *  printing a number again. */

const BASE = {
  projectName: 'Gate', maxLoadWeightLbs: 2500, typicalUnitType: 'Pallet',
  transferMethod: 'Lift', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.1,
  operatorsPerShift: 3, numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000,
  loads: [{ id: 'l1', unitType: 'Pallet', lengthIn: 48, widthIn: 40, heightIn: 50, weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
  ],
}

/** Answers every PRICING_GATE_INPUTS entry, so the deck prices normally. */
const QUOTABLE = {
  ...BASE,
  pickDropLocationCount: 12, facilitySizeSqFt: 120000, hasAgvExperience: true,
  sharedTrafficTypes: ['None'], wmsRequired: false, storageTrackingRequired: false,
  interlocks: ['None'],
} as unknown as StoredProject

/** Nothing answered — every gating input blank. */
const BLOCKED = BASE as unknown as StoredProject

let vehicles: Vehicle[]
let template: Buffer

beforeAll(() => {
  const dir = join(process.cwd(), 'src/content/vehicles')
  vehicles = ['cb18', 'ml2', 'm10', 'ebase7', '8tb50a', '8hbc40a']
    .map(id => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as Vehicle)
  template = readFileSync(join(process.cwd(), 'public/templates/tal-rom-template.pptx'))
})

const xmlFor = (fill: (zip: PizZip) => void, slide: number): string => {
  const zip = new PizZip(template)
  fill(zip)
  return zip.file(`ppt/slides/slide${slide}.xml`)!.asText()
}

describe('the deck inherits the pricing gate', () => {
  it('prices normally when the intake supports a quote', () => {
    const model = computeFleetModel(QUOTABLE, vehicles)
    expect(model.gate.blocked).toBe(false)
    const xml = xmlFor(z => fillFinancials(z, model), ROM_SLIDE.financials)
    expect(xml).not.toContain('Not priced')
    expect(xml).toContain('$')
  })

  it('S25 withholds the ROM investment and payback when blocked', () => {
    const model = computeFleetModel(BLOCKED, vehicles)
    expect(model.gate.blocked).toBe(true)
    const xml = xmlFor(z => fillFinancials(z, model), ROM_SLIDE.financials)
    expect(xml).toContain('Not priced')
    // The investment range must not survive anywhere on the slide.
    expect(xml).not.toMatch(/\$[\d,]+\s*(–|-)\s*\$[\d,]+/)
  })

  it('S27 withholds unit price, line total and the TOTAL row when blocked', () => {
    const model = computeFleetModel(BLOCKED, vehicles)
    const xml = xmlFor(z => fillInvestment(z, model, { cb18: 'CB18' }), ROM_SLIDE.investment)
    expect(xml).toContain('Not priced')
    expect(xml).not.toMatch(/\$[\d,]+\s*(–|-)\s*\$[\d,]+/)
  })

  it('S28 withholds payback and OPEX, and drops the payback chart, when blocked', () => {
    const model = computeFleetModel(BLOCKED, vehicles)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const xml = xmlFor(z => fillRoi(z, model, 10, png), ROM_SLIDE.roi)
    expect(xml).toContain('Not priced')
    // The curve is drawn from CAPEX — it must not ship when CAPEX is withheld.
    expect(xml).not.toContain('<p:pic>')
  })

  it('the cost-detail appendix withholds every CAPEX-derived row when blocked', () => {
    const model = computeFleetModel(BLOCKED, vehicles)
    const xml = xmlFor(z => fillCostDetail(z, ROM_SLIDE.investment, model, 10), ROM_SLIDE.investment)
    expect(xml).toContain('Not priced')
    // Every row left on this slide is CAPEX-derived, so nothing escapes the
    // gate. Energy used to be the one exception; it left the model 2026-10-04.
    expect(xml).not.toMatch(/kWh/)
    expect(xml).not.toMatch(/\$[\d,]+/)
  })

  it('labor offset survives the gate — it is not derived from CAPEX', () => {
    const model = computeFleetModel(BLOCKED, vehicles)
    const xml = xmlFor(z => fillRoi(z, model, 10, null), ROM_SLIDE.roi)
    expect(xml).toContain('Annual labor offset')
    expect(xml).toMatch(/\$[\d,]+/)
  })
})
