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

  it('fills S25/26 with native metric tiles and the deck re-parses cleanly', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    fillKpis(zip, model, names)

    const out = reopen(zip)
    const s25 = out.file('ppt/slides/slide25.xml')!.asText()
    const s26 = out.file('ppt/slides/slide26.xml')!.asText()
    // Section eyebrows.
    expect(s25).toContain('FLEET KPIS')
    expect(s26).toContain('FLEET MIX')
    // Native tiles: rounded-rect cards with an accent rule, not placeholder text.
    expect(s25).toContain('KPI Tile')
    expect(s25).toContain('KPI Rule')
    expect(s25).toContain('roundRect')
    expect(s25).toContain('TOTAL FLEET')              // a tile label
    expect(s25).toContain('THROUGHPUT')
    expect(s25).toContain('Base')                     // build-up caption
    // Body placeholder cleared so nothing ghosts behind the tiles.
    expect(s25).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
    expect(s26).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
    // S26 has a tile per fleet chassis (PROJECT assigns cb18 + ml2 = 2 groups).
    expect((s26.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(model.fleet.groups.length)
  })

  it('no-ops on a removed slide (fills only what remains)', () => {
    const zip = load()
    zip.remove('ppt/slides/slide25.xml')      // simulate the section being dropped
    const model = computeFleetModel(PROJECT, vehicles)
    const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
    expect(() => fillKpis(zip, model, names)).not.toThrow()
    expect(reopen(zip).file('ppt/slides/slide26.xml')!.asText()).toContain('FLEET MIX')
  })
})
