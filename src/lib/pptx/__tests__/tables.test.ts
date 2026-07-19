import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import {
  fillRequirements,
  fillVehicleCards, fillVerdictAppendix, fillGateGrid,
  fillFleetSizing, buildTierDerivations, fillDerivation,
  fillMaterialFlow, fillInvestment, fillRoi,
  fillMethodology, fillFlowMath,
} from '../tables'
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
  // Labor cost data — required for a non-null paybackYears (drives S28 takeaway).
  operatorsPerShift: 3, fullyBurdenedRateUsdPerYear: 65000,
  loads: [{ id: 'l1', unitType: 'Pallet', lengthIn: 48, widthIn: 40, heightIn: 50, weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

describe('P2 table fillers (end-to-end on the real template)', () => {
  let vehicles: Vehicle[]
  let names: Record<string, string>
  beforeAll(async () => {
    vehicles = await loadVehicleLibrary()
    names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
  })

  // ── S18 — trimmed requirements table ───────────────────────────────────────

  it('S18 = claim title + ≤8-row design-driver table + footnote (no tiles)', () => {
    const zip = load()
    fillRequirements(zip, PROJECT)
    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    expect(xml).toContain('01 — APPLICATION')
    expect(xml).toMatch(/Moving 2,500-lb pallets/)            // claim in the title
    expect(xml).not.toContain('KPI Tile')                     // tiles retired here
    for (const l of ['Max load', 'Payload / unit type', 'Transfer method']) expect(xml).toContain(l)
    // ≤ 8 data rows + header
    expect((xml.match(/<a:tr h=/g) ?? []).length).toBeLessThanOrEqual(9)
    expect(xml).toContain('project file holds the full input set')
  })

  it('S18 table structure is well-formed (red underline, no zebra)', () => {
    const zip = load()
    fillRequirements(zip, PROJECT)
    const s18 = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('<a:tbl>')
    expect(s18).toContain('<a:lnB w="19050" cap="flat"><a:solidFill><a:srgbClr val="EB0A1E"/></a:solidFill></a:lnB>') // red header rule
    expect(s18).not.toContain('F6F6F7')                         // zebra gone
    expect(s18).toContain('<a:srgbClr val="E4E4E7"/>')          // hairline body dividers
    expect(s18).toContain('<a:srgbClr val="2B2B2B"/>')          // ink text
    expect(s18).toContain('<a:noFill/>')                        // header/body cells unpainted
  })

  // ── S19 — fit cards + screening appendix ───────────────────────────────────

  it('S19 = one card per assigned chassis with quick specs, no verdicts', () => {
    const zip = load()
    fillVehicleCards(zip, PROJECT, vehicles, {})       // PROJECT assigns cb18 + ml2
    const xml = reopen(zip).file('ppt/slides/slide19.xml')!.asText()
    expect(xml).toContain('02 — VEHICLE SELECTION')
    expect(xml).toContain('2 vehicles fit your application')  // claim in the title
    expect(xml).toContain('screening matrix in appendix')
    // names of the two assigned chassis appear; unassigned chassis don't
    const cb18 = vehicles.find(v => v.id === 'cb18')!, m10 = vehicles.find(v => v.id === 'm10')!
    expect(xml).toContain(cb18.name)
    expect(xml).not.toContain(m10.name)
    // spec block, not qualification verdicts
    for (const l of ['Capacity', 'Transfer', 'Lift', 'Battery']) expect(xml).toContain(l)
    expect(xml).toContain(`${cb18.calc.maxWeightLbs.toLocaleString()} lbs`)
    expect(xml).toContain('Serves 1 of 2 flows')
    for (const s of ['QUALIFIED', 'REVIEW REQUIRED', 'Screening flags', 'Meets every requirement']) {
      expect(xml).not.toContain(s)
    }
  })

  it('S19 no-ops when no vehicle is assigned', () => {
    const zip = load()
    const before = zip.file('ppt/slides/slide19.xml')!.asText()
    fillVehicleCards(zip, { projectName: 'E' } as unknown as StoredProject, vehicles, {})
    expect(zip.file('ppt/slides/slide19.xml')!.asText()).toBe(before)
  })

  it('screening appendix = verdict table + gate grid on cloned slides', () => {
    const zip = load()
    const verdict = cloneSlide(zip, 18)!, grid = cloneSlide(zip, 18)!
    fillVerdictAppendix(zip, verdict, PROJECT, vehicles)
    fillGateGrid(zip, grid, PROJECT, vehicles)
    const out = reopen(zip)
    const vx = out.file(`ppt/slides/slide${verdict}.xml`)!.asText()
    const gx = out.file(`ppt/slides/slide${grid}.xml`)!.asText()
    expect(vx).toContain('APPENDIX — VEHICLE SCREENING')
    for (const v of vehicles) expect(vx).toContain(v.name)     // all chassis, not just assigned
    expect(gx).toContain('APPENDIX — VEHICLE SCREENING')
    expect(gx).toContain('✓ pass')
  })

  // ── S21 — fleet-sizing waterfall + derivation appendix ─────────────────────

  it('S21 = fleet claim + 4-tile waterfall with plain-English descs + mix caption', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillFleetSizing(zip, model, names)
    const xml = reopen(zip).file('ppt/slides/slide21.xml')!.asText()
    expect(xml).toContain('03 — FLEET SIZING')
    expect(xml).toMatch(/Your operation needs a fleet of \d+/)
    for (const l of ['WORKLOAD', '+ CHARGING', '× HEADROOM', '= FLEET']) expect(xml).toContain(l)
    expect((xml.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(4)
    expect(xml).toContain('batteries recover')                 // human desc, not formula
    expect(xml).toContain('Fleet mix —')
    expect(xml).toContain('full derivation in appendix')
    expect(xml).not.toContain('What it means')                 // derivation table gone from body
  })

  it('tier derivations render on appendix slides', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const tiers = buildTierDerivations(model, vehicles, names)
    expect(tiers.map(t => t.name)).toEqual(['RAW FLEET', 'CHARGING', 'BUFFER'])
    const slide = cloneSlide(zip, 18)!
    fillDerivation(zip, slide, tiers[0])
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('APPENDIX — SIZING DERIVATION')
    expect(xml).toContain('What it means')
  })

  // ── S24 — flow table is the single proof (diagram dropped 2026-07-10) ──────

  it('S24 shows full inputs → output per flow + the fleet build-up strip', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillMaterialFlow(zip, model, names)
    const xml = reopen(zip).file('ppt/slides/slide24.xml')!.asText()
    expect(xml).toContain('04 — MATERIAL FLOW')
    expect(xml).toMatch(/2 flows move 35 loads every hour/)
    for (const l of ['Route', 'Distance', 'Moves/hr', 'Layout', 'Lift', 'Vehicle', 'Raw', '+ Chg', 'Vehicles']) {
      expect(xml).toContain(`<a:t>${l}</a:t>`)
    }
    expect(xml).toContain('300 ft')                        // input: flow 1 distance
    expect(xml).toContain('Mixed')                         // input: route layout label
    expect(xml).toMatch(/<a:t>\d+\.\d\d<\/a:t>/)           // output: fractional raw demand
    expect(xml).toMatch(/<a:t>\+\d+\.\d\d<\/a:t>/)         // output: per-flow charging share
    // TOTAL row in the table (Σ moves/hr · Σ raw · Σ charging · fleet sold) — no tile strip
    expect(xml).toContain('<a:t>TOTAL</a:t>')
    expect(xml).toContain('<a:t>35</a:t>')                 // Σ moves/hr for the fixture's 2 flows
    expect(xml).not.toContain('KPI Tile')
    expect(xml).not.toContain('<p:pic>')                   // no diagram image
    expect(xml).not.toMatch(/<a:t>STEP \d+<\/a:t>/)        // template STEP label stripped
    expect(xml).toContain('cycle math in the appendix')
  })

  // ── S27/S28 — title claims wired ───────────────────────────────────────────

  it('S27/S28 lead with claims in the title placeholder (takeaway zone gone)', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillInvestment(zip, model, names)
    fillRoi(zip, model, 10, null)
    const s27 = reopen(zip).file('ppt/slides/slide27.xml')!.asText()
    const s28 = reopen(zip).file('ppt/slides/slide28.xml')!.asText()
    expect(s27).toMatch(/\$.+ for \d+ vehicles/)
    expect(s27).toContain('TOTAL')
    expect(s27).toContain('ROM pricing range pending final configuration')
    expect(s28).toMatch(/back over 10 years|Simple payback in/)
    expect(s28).toContain('Annual operating cost')
    expect(s28).toContain('gross of operating cost')
  })

  it('S27 builds the per-line pricing table with a TOTAL row', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillInvestment(zip, model, names)
    const s27 = reopen(zip).file('ppt/slides/slide27.xml')!.asText()
    expect(s27).toContain('<a:tbl>')
    expect(s27).toContain('Line Total (ROM)')
    expect(s27).toContain('TOTAL')
    expect(s27).toMatch(/\$[\d.,]+[MK]?/)              // money-formatted range
    expect(s27).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)   // placeholder cleared
    expect(s27).toContain('06 — INVESTMENT')             // eyebrow
  })

  it('S28 ROI table fills alone, and embeds the chart when a PNG is supplied', () => {
    const model = computeFleetModel(PROJECT, vehicles)
    // table-only (non-DOM): no image
    const a = load()
    fillRoi(a, model, 10)
    const s28a = reopen(a).file('ppt/slides/slide28.xml')!.asText()
    expect(s28a).toContain('Simple payback')
    expect(s28a).not.toContain('<p:pic>')
    expect(s28a).toContain('06 — RETURN ON INVESTMENT')   // eyebrow
    // with a chart PNG
    const b = load()
    const png = new Uint8Array(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'))
    fillRoi(b, model, 10, png)
    expect(reopen(b).file('ppt/slides/slide28.xml')!.asText()).toContain('<p:pic>')
  })

  // ── Appendix helpers (unchanged) ────────────────────────────────────────────

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
    expect(xml).toContain('APPENDIX — METHODOLOGY')        // eyebrow
  })

  it('fillFlowMath shows each flow\'s substituted cycle formula and demand', () => {
    const zip = load()
    const slide = cloneSlide(zip, 18)!
    const model = computeFleetModel(PROJECT, vehicles)
    fillFlowMath(zip, slide, model, vehicles, names, model.flows)
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('<a:tbl>')
    expect(xml).toContain('Dock → Rack A')                 // a flow, by route
    expect(xml).toContain('÷ 3600')                        // demand formula with figures
    // a row per assigned flow (PROJECT has 2) + header
    expect((xml.match(/<a:tr\b/g) ?? []).length).toBe(1 + model.flows.filter(f => f.vehicleId).length)
    expect(xml).toContain('APPENDIX — CYCLE MATH')          // eyebrow
  })
})
