import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import { fillRomMoney, fillFleetEngineText } from '../content'
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

describe('fillFleetEngineText + fillRomMoney (text fallback + money slides)', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('fills S21–28 placeholders and the deck re-parses cleanly', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillFleetEngineText(zip, model, names)
    fillRomMoney(zip, model, names)

    const out = reopen(zip)
    // Fleet math headings written into the body placeholders.
    expect(out.file('ppt/slides/slide21.xml')!.asText()).toContain('Raw fleet')
    expect(out.file('ppt/slides/slide22.xml')!.asText()).toContain('Charging')
    expect(out.file('ppt/slides/slide23.xml')!.asText()).toContain('Buffer')
    // Buffered total appears as the S23 hero figure.
    expect(out.file('ppt/slides/slide23.xml')!.asText()).toContain(`${model.fleet.totalFleetSold} vehicles`)
    // Money slides: CAPEX range uses the shared money() formatter ($…M/$…K).
    const s27 = out.file('ppt/slides/slide27.xml')!.asText()
    expect(s27).toContain('System CAPEX')
    expect(s27).toMatch(/\$[\d.,]+[MK]?/)
    // Theme TAL red used for the hero figures.
    expect(s27).toContain('<a:schemeClr val="accent1"/>')
  })

  it('no-ops on a removed slide (fills only what remains)', () => {
    const zip = load()
    zip.remove('ppt/slides/slide27.xml')      // simulate the section being dropped
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    expect(() => fillRomMoney(zip, model, names)).not.toThrow()
    // other money slides still filled
    expect(reopen(zip).file('ppt/slides/slide28.xml')!.asText()).toContain('payback')
  })
})
