import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillFinancials, fillCostDetail } from '../content'
import { cloneSlide } from '../ooxml'
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

describe('fillFinancials (S25) + fillCostDetail (appendix)', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('S25 = title claim + exactly 3 tiles + honesty footnote', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillFinancials(zip, model)
    const s25 = reopen(zip).file('ppt/slides/slide25.xml')!.asText()
    expect(s25).toContain('05 — FINANCIALS')
    expect(s25).toMatch(/Payback in about \d+\.\d years/)     // claim in the title placeholder
    for (const l of ['ROM INVESTMENT', 'LABOR OFFSET / YR', 'SIMPLE PAYBACK']) expect(s25).toContain(l)
    expect((s25.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(3)
    expect(s25).toContain('cost detail in appendix')
    expect(s25).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('cost-detail appendix carries the relocated financial figures', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const slide = cloneSlide(zip, 18)!
    fillCostDetail(zip, slide, model, 10)
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('APPENDIX — COST DETAIL')
    for (const l of ['Net benefit / yr', 'Annual operating cost', 'TCO @ 10 yr', 'Cost per move', 'Energy']) {
      expect(xml).toContain(l)
    }
  })

  it('no-ops on a removed slide', () => {
    const zip = load()
    zip.remove('ppt/slides/slide25.xml')
    const model = computeFleetModel(PROJECT, vehicles)
    expect(() => fillFinancials(zip, model)).not.toThrow()
  })
})
