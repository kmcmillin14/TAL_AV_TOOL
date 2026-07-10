// Fills the P2 ROM step slides with native editable tables:
//   S18  Application Requirements  (requirement → value, ≤8 rows)
//   S19  Vehicle Selection          (fit cards — assigned chassis only)
//   S21  Fleet Sizing               (waterfall: Workload + Charging × Buffer = Fleet)
//   S24  Material Flow Diagram      (trimmed flow list: # · Route · Moves/hr · Vehicle)
//   S27  Investment Summary         (pricing table)
//   S28  ROI                        (payback chart + 3-row table)
// Tables are appended as native <a:tbl> graphic frames positioned in the slide
// body (the title/footer placeholders stay intact). Pure data → XML.
import type PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { FleetModel } from '@/src/lib/fleetModel'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { GATES } from '@/src/calc/gates'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { money } from '@/src/lib/vehicleDisplay'
import { cycleDerivation, chargingDerivation, bufferDerivation, type Derivation } from '@/src/lib/derivation'
import { METHODOLOGY } from '@/src/content/methodology'
import { VEHICLE_SLIDE, ROM_SLIDE } from './sections'
import {
  TAL_RED,
  type TableCell,
  type TextRun,
  textBox, addImage, containRect, pngSize, nextShapeId, appendShapesToSlide,
} from './ooxml'
import { frame, setTitle, BODY, GAP, GRAY } from './layout'
import {
  requirementsTitle, vehiclesTitle, fleetTitle, flowTitle,
  investmentTitle, roiTitle, FALLBACK_TITLE,
} from './takeaways'

const FLOW_IMG_H = 2100000   // height reserved for the S24 diagram image
const ROI_IMG_H = 1900000    // height reserved for the S28 payback chart

// Verdict palette — shared by the S19 verdict-cell fills and the gate grid glyphs
// (pass = GREEN, review = YELLOW, fail = RED).
const STATUS_COLOR = { GREEN: '2E7D32', YELLOW: 'C77700', RED: 'C62828' } as const

const ft = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ft`

const TEMP_LABEL: Record<string, string> = {
  ambient: 'Ambient', refrigerated: 'Refrigerated', freezer: 'Freezer',
}

const MAX_REQ_ROWS = 8

/** S18 — the ~8 requirements that drive the design, as one table. The claim is
 *  the title; the full captured input set stays in the app's project file. */
export function fillRequirements(zip: PizZip, project: StoredProject): void {
  setTitle(zip, ROM_SLIDE.requirements, requirementsTitle(project), FALLBACK_TITLE.requirements)
  const rows: TableCell[][] = [[{ t: 'Requirement' }, { t: 'Value' }]]
  const add = (k: string, v?: string | null) => {
    if (v && rows.length <= MAX_REQ_ROWS) rows.push([{ t: k, bold: true }, { t: v }])
  }

  if ((project.maxLoadWeightLbs ?? 0) > 0) add('Max load', `${project.maxLoadWeightLbs!.toLocaleString()} lbs`)
  add('Payload / unit type', project.typicalUnitType?.trim())
  add('Transfer method', project.transferMethod?.trim())

  const pick = project.pickHeightFt, drop = project.dropHeightFt
  if (pick != null || drop != null) add('Lift / transfer', `${ft(pick ?? 0)} → ${ft(drop ?? 0)}`)
  else if ((project.maxLiftHeightFt ?? 0) > 0) add('Lift / transfer', `to ${ft(project.maxLiftHeightFt!)}`)

  const hrPerDay = Math.min(24, (project.shiftsPerDay ?? 0) * (project.hoursPerShift ?? 0))
  if (hrPerDay > 0) add('Schedule', `${hrPerDay} hr/day (${project.shiftsPerDay} × ${project.hoursPerShift})`)

  const env = project.temperatureEnvironment ?? (project.freezerCapable ? 'freezer' : undefined)
  if (env) add('Temperature', TEMP_LABEL[env] ?? env)
  if (project.outdoorRequired != null) add('Operating environment', project.outdoorRequired ? 'Outdoor' : 'Indoor')
  if (project.rampRequired != null || (project.maxRampGrade ?? 0) > 0) {
    const yes = project.rampRequired === true || (project.maxRampGrade ?? 0) > 0
    add('Ramp on site', yes ? ((project.maxRampGrade ?? 0) > 0 ? `Yes — ${project.maxRampGrade}% grade` : 'Yes') : 'No')
  }
  if (rows.length === 1) rows.push([{ t: '—' }, { t: 'No requirements captured yet (Step 1).' }])

  const f = frame(zip, ROM_SLIDE.requirements)
  f.eyebrow('01 — APPLICATION')
  f.rule()
  f.table([3600000, 7220400], rows, { rowH: 360000 })
  f.caption('Captured in discovery · the project file holds the full input set')
}

// ── Vehicle Fit Cards (S19) + Screening Appendix ────────────────────────────

const CARD_IMG_H = 1500000    // vehicle photo zone per fit card
const CARD_TXT_H = 1900000    // name + verdict + why text zone

/** Distinct chassis the engineer assigned to flows, in first-assignment order. */
function assignedVehicleIds(project: StoredProject): string[] {
  const ids: string[] = []
  for (const fl of project.flows ?? []) {
    if (fl.vehicleId && !ids.includes(fl.vehicleId)) ids.push(fl.vehicleId)
  }
  return ids
}

/** S19 — one fit card per ASSIGNED chassis (photo · name · verdict · why-line).
 *  The tool never picks a vehicle: no assignments → the slide is left untouched
 *  (the exporter drops it). Photos are optional (text-only cards in non-DOM). */
export function fillVehicleCards(
  zip: PizZip, project: StoredProject, vehicles: Vehicle[],
  photos: Record<string, Uint8Array | null>,
): void {
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const assigned = assignedVehicleIds(project).filter(id => vById.has(id))
  if (assigned.length === 0) return
  const app = appRequirementsFromProject(project)
  const flowsTotal = (project.flows ?? []).length

  setTitle(zip, ROM_SLIDE.vehicles, vehiclesTitle(assigned.length), FALLBACK_TITLE.vehicles)
  const f = frame(zip, ROM_SLIDE.vehicles)
  f.eyebrow('02 — VEHICLE SELECTION')
  f.rule()

  const ids = assigned.slice(0, 4)                      // 4 cards max across the body
  const w = Math.round((BODY.cx - (ids.length - 1) * GAP) / ids.length)
  const yTop = f.y
  ids.forEach((id, i) => {
    const v = vById.get(id)
    if (!v) return
    const x = BODY.x + i * (w + GAP)
    const png = photos[id]
    if (png) {
      const { w: nw, h: nh } = pngSize(png)
      addImage(zip, ROM_SLIDE.vehicles, png, containRect(nw, nh, { x, y: yTop, cx: w, cy: CARD_IMG_H }))
    }
    const q = qualifyVehicle(v, app)
    const verdict = q.status === 'GREEN' ? 'QUALIFIED'
      : q.status === 'YELLOW' ? 'QUALIFIED — REVIEW' : 'REVIEW REQUIRED'
    const hardFails = dedupe(q.hardGates.filter(g => !g.skipped && !g.passed).map(g => g.name))
    const softFails = dedupe(q.softPreferences.filter(g => !g.skipped && !g.passed).map(g => g.name))
    const why = q.status === 'GREEN' ? 'Meets every requirement screened'
      : q.status === 'YELLOW' ? `Review on site: ${softFails.join(', ')}`
      : `Screening flags: ${hardFails.join(', ')}`
    const served = (project.flows ?? []).filter(fl => fl.vehicleId === id).length
    const paras: TextRun[][] = [
      [{ t: v.name, bold: true, sz: 1400 }],
      [{ t: verdict, bold: true, sz: 1000, color: STATUS_COLOR[q.status] }],
      [],
      [{ t: why, sz: 1000 }],
      [{ t: `Serves ${served} of ${flowsTotal} flow${flowsTotal === 1 ? '' : 's'}`, sz: 950, color: GRAY }],
    ]
    appendShapesToSlide(zip, ROM_SLIDE.vehicles, textBox({
      id: nextShapeId(zip, ROM_SLIDE.vehicles),
      x, y: yTop + CARD_IMG_H + GAP, cx: w, cy: CARD_TXT_H, paras,
    }))
  })
  f.skip(CARD_IMG_H + GAP + CARD_TXT_H)

  const screenedOut = vehicles.length - assigned.length
  f.caption(`Selected from ${vehicles.length} chassis screened`
    + (screenedOut > 0 ? ` (${screenedOut} not selected)` : '')
    + ' · screening matrix in appendix')
}

/** Appendix — the full per-chassis verdict table (was body S19). */
export function fillVerdictAppendix(
  zip: PizZip, slide: number, project: StoredProject, vehicles: Vehicle[],
): void {
  const results = qualifyAll(project, vehicles)
  const rows: TableCell[][] = [[{ t: 'Vehicle' }, { t: 'Verdict', align: 'ctr' }, { t: 'Notes' }]]
  for (const { vehicle, q } of results) {
    const hardFails = q.hardGates.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const softFails = q.softPreferences.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const notes = q.status === 'RED' ? `Fails: ${dedupe(hardFails).join(', ')}`
      : q.status === 'YELLOW' ? `Review: ${dedupe([...softFails, ...partialLoadNote(q)]).join(', ')}`
      : 'All gates pass'
    rows.push([
      { t: vehicle.name, bold: true },
      { t: q.status, align: 'ctr', fill: STATUS_COLOR[q.status], color: 'FFFFFF', bold: true },
      { t: notes },
    ])
  }
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — VEHICLE SCREENING')
  f.table([3000000, 2000000, 5820400], rows)
  f.caption('Every chassis in the library, screened against the captured requirements')
}

/** Appendix — the gate × vehicle grid (was body S20). */
export function fillGateGrid(
  zip: PizZip, slide: number, project: StoredProject, vehicles: Vehicle[],
): void {
  const results = qualifyAll(project, vehicles)
  const byVeh = results.map(({ vehicle, q }) => {
    const map = new Map<string, { passed: boolean; skipped: boolean; severity: string }>()
    for (const g of [...q.hardGates, ...q.softPreferences]) {
      const prev = map.get(g.gateId)
      map.set(g.gateId, prev
        ? { passed: prev.passed && g.passed, skipped: prev.skipped && g.skipped, severity: g.severity }
        : { passed: g.passed, skipped: g.skipped, severity: g.severity })
    }
    return { vehicle, map }
  })
  const activeGates = GATES.filter(spec => byVeh.some(v => !(v.map.get(spec.id)?.skipped ?? true)))

  const header: TableCell[] = [{ t: 'Gate' }, ...byVeh.map(v => ({ t: shortName(v.vehicle.name), align: 'ctr' as const }))]
  const gridRows: TableCell[][] = [header]
  for (const spec of activeGates) {
    gridRows.push([
      { t: spec.name, bold: true },
      ...byVeh.map(v => glyphCell(v.map.get(spec.id))),
    ])
  }
  if (activeGates.length === 0) gridRows.push([{ t: 'No requirements captured yet (Step 1).' }, ...byVeh.map(() => ({ t: '' }))])

  const vehColW = Math.round((BODY.cx - 3000000) / byVeh.length)
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — VEHICLE SCREENING')
  f.table([3000000, ...byVeh.map(() => vehColW)], gridRows, { center: true, rowH: 340000 })
  f.caption('✓ pass   ·   ~ review   ·   ✗ fail   ·   –  not evaluated')
}

// ── Fleet Sizing Waterfall (S21) + Derivation Appendix ──────────────────────

const WATERFALL_H = 1600000
// Worked-derivation table: Step · What it means · Calculation · Result.
const DERIV_COL = [2600000, 3400000, 3220400, 1600000]

export interface TierDerivation {
  name: 'RAW FLEET' | 'CHARGING' | 'BUFFER'
  meaning: string
  deriv: Derivation | null
  example: string
}

/** S21 — the whole sizing story on one slide: claim title, the
 *  Workload + Charging × Buffer = Fleet waterfall as explained tiles, and the
 *  fleet mix. The math lives in the sizing-derivation appendix. */
export function fillFleetSizing(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, flows, settings } = model
  setTitle(zip, ROM_SLIDE.fleetSizing, fleetTitle(model), FALLBACK_TITLE.fleet)
  const f = frame(zip, ROM_SLIDE.fleetSizing)
  f.eyebrow('03 — FLEET SIZING')
  f.rule()
  const thru = Math.round(flows.reduce((s, fl) => s + (fl.thruPerHr || 0), 0))
  const chg = fleet.totalChargingDelta
  f.tiles([
    { value: String(fleet.totalBaseFleet), label: 'WORKLOAD', compact: true,
      desc: `vehicles to carry ${thru} moves/hr across ${flows.length} flow${flows.length === 1 ? '' : 's'}` },
    { value: chg > 0 ? `+${chg}` : '+0', label: '+ CHARGING', compact: true,
      desc: 'keeps the fleet moving while batteries recover' },
    { value: `×${(1 + settings.bufferPct).toFixed(2)}`, label: '× BUFFER', compact: true,
      desc: 'absorbs peaks and maintenance windows' },
    { value: String(fleet.totalFleetSold), label: '= FLEET', accent: true, compact: true,
      desc: 'recommended fleet size' },
  ], { h: WATERFALL_H })
  const mix = fleet.groups.map(g => `${names[g.vehicleId] ?? g.vehicleId} ×${g.fleetSold}`).join('   ·   ')
  f.caption([
    mix ? `Fleet mix — ${mix}` : 'Assign vehicles to flows (Step 3) to size the fleet.',
    'Sized from your throughput, distances, and shift pattern · full derivation in appendix',
  ])
}

/** The three worked tier derivations (representative examples), for the appendix. */
export function buildTierDerivations(
  model: FleetModel, vehicles: Vehicle[], names: Record<string, string>,
): TierDerivation[] {
  const { flows, derivedByFlowId, fleet, settings } = model
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const rawFlow = flows.find(fl => fl.vehicleId && derivedByFlowId.get(fl.id)?.breakdown)
  const rawVeh = rawFlow?.vehicleId ? vById.get(rawFlow.vehicleId) : undefined
  const rawBreak = rawFlow ? derivedByFlowId.get(rawFlow.id)?.breakdown : null
  const rawDeriv = rawFlow && rawVeh && rawBreak
    ? cycleDerivation(rawBreak, {
        distanceFt: rawFlow.distanceFt, thruPerHr: rawFlow.thruPerHr,
        speedLoadedFps: rawVeh.calc.speedLoadedFps,
        speedUnloadedFps: rawVeh.calc.speedUnloadedFps ?? rawVeh.calc.speedLoadedFps,
        liftSpeedFps: rawVeh.calc.liftSpeedFps ?? null,
        rawVehicles: derivedByFlowId.get(rawFlow.id)?.rawVehicles ?? null,
      })
    : null
  const grp = fleet.groups[0]
  const grpVeh = grp ? vById.get(grp.vehicleId) : undefined
  const grpExample = grp ? `Example: ${names[grp.vehicleId] ?? grp.vehicleId}` : ''
  return [
    { name: 'RAW FLEET', deriv: rawDeriv,
      meaning: 'Each flow’s cycle time → vehicles needed (throughput \xd7 cycle \xf7 3600), summed per chassis and rounded up = raw base fleet.',
      example: rawFlow ? `Example: ${rawVeh?.name ?? rawFlow.vehicleId} \xb7 ${rawFlow.origin || '—'} → ${rawFlow.destination || '—'}` : '' },
    { name: 'CHARGING', deriv: grp && grpVeh ? chargingDerivation(grp, grpVeh, settings) : null,
      meaning: 'Battery runtime vs recharge sets availability; dividing demand by availability adds the vehicles needed to cover charging downtime.',
      example: grpExample },
    { name: 'BUFFER', deriv: grp ? bufferDerivation(grp, settings.bufferPct) : null,
      meaning: '(base + charging) \xd7 (1 + buffer), rounded up — spare capacity for maintenance, training, and demand spikes = fleet sold.',
      example: grpExample },
  ]
}

/** One tier's worked derivation on an appendix slide (was a body tier slide). */
export function fillDerivation(zip: PizZip, slide: number, tier: TierDerivation): void {
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — SIZING DERIVATION')
  f.table(DERIV_COL,
    tier.deriv ? derivationRows(tier.deriv)
      : [[{ t: 'How it’s calculated' }], [{ t: 'Assign vehicles to flows (Step 3) to show the worked calculation.' }]],
    { rowH: 260000 })
  const lines = [tier.meaning + (tier.example ? `   \xb7   ${tier.example}` : '')]
  const inputs = (tier.deriv?.steps ?? []).filter(s => s.kind === 'input')
  if (inputs.length) lines.push(`Inputs — ${inputs.map(s => `${s.label} ${s.result}`).join('  \xb7  ')}`)
  f.caption(lines)
}

/** A Derivation → table rows (section/input rows dropped — inputs go in the
 *  caption; emphasis steps in red). */
function derivationRows(d: Derivation): TableCell[][] {
  const rows: TableCell[][] = [[{ t: 'Step' }, { t: 'What it means' }, { t: 'Calculation' }, { t: 'Result', align: 'r' }]]
  for (const s of d.steps) {
    if (s.kind === 'section' || s.kind === 'input') continue
    rows.push([
      { t: s.label, bold: s.emphasis },
      { t: s.expr ?? '' },
      { t: s.sub ?? '—' },
      { t: (s.result ?? '') + (s.unit ? ` ${s.unit}` : ''), align: 'r', bold: s.emphasis, ...(s.emphasis ? { color: TAL_RED } : {}) },
    ])
  }
  return rows
}

// ── Per-vehicle qualification helpers (shared by S19 cards + appendix) ───────

/** Per-vehicle qualification, in deck-overview order (8TB · 8HBC · M10 · ML2 · E7 · CB18). */
function qualifyAll(project: StoredProject, vehicles: Vehicle[]) {
  const app = appRequirementsFromProject(project)
  const order = Object.keys(VEHICLE_SLIDE)
  const ordered = [...vehicles].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  return ordered.map(v => ({ vehicle: v, q: qualifyVehicle(v, app) }))
}

/** S24 — Material flows. Title claim + rule. When a rendered diagram PNG is
 *  supplied it goes on top and a compact 4-column table sits beneath it;
 *  otherwise the table fills the body. Columns: # · Route · Moves/hr · Vehicle
 *  (Distance, Layout, Lift moved to the cycle-math appendix). */
export function fillMaterialFlow(
  zip: PizZip, model: FleetModel, names: Record<string, string>, diagramPng?: Uint8Array | null,
): void {
  const { flows } = model
  setTitle(zip, ROM_SLIDE.materialFlow, flowTitle(model), FALLBACK_TITLE.flow)
  const f = frame(zip, ROM_SLIDE.materialFlow)
  f.eyebrow('04 — MATERIAL FLOW')
  f.rule()
  if (diagramPng) f.image(diagramPng, FLOW_IMG_H)
  const MAX = diagramPng ? 3 : 9

  const rows: TableCell[][] = [[
    { t: '#', align: 'ctr' }, { t: 'Route' }, { t: 'Moves/hr', align: 'r' }, { t: 'Vehicle' },
  ]]
  flows.slice(0, MAX).forEach((flow, i) => rows.push([
    { t: String(i + 1), align: 'ctr' },
    { t: `${flow.origin || '—'} → ${flow.destination || '—'}` },
    { t: String(flow.thruPerHr ?? 0), align: 'r' },
    { t: flow.vehicleId ? (names[flow.vehicleId] ?? flow.vehicleId) : 'Unassigned' },
  ]))
  if (flows.length === 0) rows.push([{ t: '—', align: 'ctr' }, { t: 'No flows defined yet (Step 3).' }, { t: '' }, { t: '' }])
  if (flows.length > MAX) rows.push([{ t: '' }, { t: `+ ${flows.length - MAX} more flow${flows.length - MAX === 1 ? '' : 's'}…` }, { t: '' }, { t: '' }])

  f.table([560000, 5800400, 1580000, 2880000], rows, { rowH: 320000 })
  f.caption('Per-flow distances, layouts, and lift heights are in the cycle-math appendix')
}

/** S27 Investment Summary — dynamic per-line CAPEX pricing table with a TOTAL row.
 *  Pricing is a range (unit & line min–max), never a single quote. */
export function fillInvestment(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { rom, fleet } = model
  const nm = (id: string) => names[id] ?? id
  const rows: TableCell[][] = [[
    { t: 'Vehicle' }, { t: 'Qty', align: 'ctr' }, { t: 'Unit Price (ROM)', align: 'r' }, { t: 'Line Total (ROM)', align: 'r' },
  ]]
  for (const l of rom.pricing.lines) {
    rows.push([
      { t: nm(l.vehicleId), bold: true },
      { t: String(l.fleetSold), align: 'ctr' },
      { t: `${money(l.unitMin)} – ${money(l.unitMax)}`, align: 'r' },
      { t: `${money(l.lineMin)} – ${money(l.lineMax)}`, align: 'r' },
    ])
  }
  if (rom.pricing.lines.length === 0) rows.push([{ t: '—' }, { t: '', align: 'ctr' }, { t: '' }, { t: 'Assign vehicles to flows (Step 3).', align: 'r' }])
  const redCell = (t: string, align: TableCell['align'] = 'l'): TableCell => ({ t, align, fill: TAL_RED, color: 'FFFFFF', bold: true })
  rows.push([redCell('TOTAL'), redCell(String(fleet.totalFleetSold), 'ctr'), redCell(''), redCell(`${money(rom.pricing.totalMin)} – ${money(rom.pricing.totalMax)}`, 'r')])

  setTitle(zip, ROM_SLIDE.investment, investmentTitle(model), FALLBACK_TITLE.investment)
  const f = frame(zip, ROM_SLIDE.investment)
  f.eyebrow('06 — INVESTMENT')
  f.rule()
  f.table([4200000, 1200000, 2710200, 2710200], rows, { center: true })
  f.caption('ROM pricing range pending final configuration — not a quote')
}

/** Methodology appendix slide — a reference table covering every calc stage:
 *  formula · variables (symbol = name) · why. Content from the shared
 *  src/content/methodology.ts (same source as the web Methodology panel). */
export function fillMethodology(zip: PizZip, slide: number): void {
  const firstSentence = (s: string) => { const i = s.indexOf('. '); return i < 0 ? s : s.slice(0, i + 1) }
  const rows: TableCell[][] = [[
    { t: 'Stage' }, { t: 'Formula' }, { t: 'Variables' }, { t: 'Why' },
  ]]
  for (const t of METHODOLOGY) {
    rows.push([
      { t: `${t.num}  ${t.title}`, bold: true },
      { t: t.formula },
      { t: t.variables.map(v => `${v.sym} = ${v.name}`).join('  \xb7  ') },
      { t: firstSentence(t.why) },
    ])
  }
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — METHODOLOGY')
  f.table([1700000, 3300000, 3300000, 2520400], rows)
}

/** Per-flow cycle-math appendix: each flow's substituted formula → cycle → demand,
 *  with the actual figures in the formula. Reuses `cycleDerivation` so the deck and
 *  the web panel show the same worked numbers. `flowsSubset` is this slide's page. */
export function fillFlowMath(
  zip: PizZip, slide: number, model: FleetModel, vehicles: Vehicle[],
  names: Record<string, string>, flowsSubset: FleetModel['flows'],
): void {
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const nm = (id: string) => names[id] ?? id
  const rows: TableCell[][] = [[
    { t: 'Flow' }, { t: 'Cycle = out + back + load + unload + lift  (s)' },
    { t: 'Cycle', align: 'r' }, { t: 'Vehicles = Q \xd7 cycle \xf7 3600', align: 'r' },
  ]]
  for (const fl of flowsSubset) {
    const v = fl.vehicleId ? vById.get(fl.vehicleId) : undefined
    const b = model.derivedByFlowId.get(fl.id)?.breakdown
    if (!v || !b) continue
    const d = cycleDerivation(b, {
      distanceFt: fl.distanceFt, thruPerHr: fl.thruPerHr,
      speedLoadedFps: v.calc.speedLoadedFps,
      speedUnloadedFps: v.calc.speedUnloadedFps ?? v.calc.speedLoadedFps,
      liftSpeedFps: v.calc.liftSpeedFps ?? null,
      rawVehicles: model.derivedByFlowId.get(fl.id)?.rawVehicles ?? null,
    })
    const cyc = d.steps.find(s => s.label === 'Cycle time')
    const cnt = d.steps.find(s => s.label === 'Vehicle count')
    rows.push([
      { t: `${nm(fl.vehicleId!)} \xb7 ${fl.origin || '—'} → ${fl.destination || '—'}`, bold: true },
      { t: cyc?.sub ?? '—' },
      { t: cyc?.result ?? '—', align: 'r' },
      { t: cnt ? `${cnt.sub} = ${cnt.result}` : '—', align: 'r' },
    ])
  }
  if (rows.length === 1) rows.push([{ t: 'No flows with an assigned vehicle.' }, { t: '' }, { t: '' }, { t: '' }])
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — CYCLE MATH')
  f.table([3000000, 4000000, 1000000, 2820400], rows, { rowH: 360000 })
}

/** S28 ROI — title claim → eyebrow → rule → payback-curve chart (when rendered)
 *  → 3-row metrics table; table-only when no chart (non-DOM context). */
export function fillRoi(
  zip: PizZip, model: FleetModel, serviceLifeYears: number, paybackPng?: Uint8Array | null,
): void {
  const { rom } = model
  const payback = rom.payback.paybackYears
  setTitle(zip, ROM_SLIDE.roi, roiTitle(model, serviceLifeYears), FALLBACK_TITLE.roi)
  const f = frame(zip, ROM_SLIDE.roi)
  f.eyebrow('06 — RETURN ON INVESTMENT')
  f.rule()
  if (paybackPng) f.image(paybackPng, ROI_IMG_H)
  f.table([5000000, 5820400], [
    [{ t: 'Metric' }, { t: 'Value', align: 'r' }],
    [{ t: 'Simple payback', bold: true }, { t: payback == null ? '—' : `${payback.toFixed(1)} years`, align: 'r' }],
    [{ t: 'Annual labor offset', bold: true }, { t: money(rom.payback.annualLaborOffset), align: 'r' }],
    [{ t: 'Annual operating cost', bold: true }, { t: money(rom.opex.annualOpex), align: 'r' }],
  ], { rowH: 320000 })
  f.caption('Labor offset is gross of operating cost \xb7 simple payback, undiscounted')
}

// ── helpers ──────────────────────────────────────────────────────────────────

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)].filter(Boolean)
}

/** When only some declared loads pass, surface it as a review note. */
function partialLoadNote(q: ReturnType<typeof qualifyVehicle>): string[] {
  if (!q.perLoad || q.perLoad.every(l => l.passed) || !q.perLoad.some(l => l.passed)) return []
  return [`${q.perLoad.filter(l => !l.passed).length} load(s) don't fit`]
}

/** Pass/fail/review/skip glyph for the gate grid cell. */
function glyphCell(r?: { passed: boolean; skipped: boolean; severity: string }): TableCell {
  if (!r || r.skipped) return { t: '–', align: 'ctr', color: 'BBBBBB' }
  if (r.passed) return { t: '✓', align: 'ctr', color: STATUS_COLOR.GREEN, bold: true }
  if (r.severity === 'soft') return { t: '~', align: 'ctr', color: STATUS_COLOR.YELLOW, bold: true }
  return { t: '✗', align: 'ctr', color: STATUS_COLOR.RED, bold: true }
}

/** Shorten a vehicle name for a narrow grid column header. */
function shortName(name: string): string {
  return name.length > 12 ? name.split(/\s|–|-/)[0] : name
}
