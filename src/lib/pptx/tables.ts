// Fills the P2 ROM step slides with native editable tables:
//   S18  Application Requirements  (requirement → value)
//   S19  Vehicle Selection Matrix  (per-vehicle verdict + notes)
//   S20  Vehicle Selection Matrix  (gate × vehicle pass/fail grid)
//   S24  Material Flow Diagram      (flow list table)
// Tables are appended as native <a:tbl> graphic frames positioned in the slide
// body (the title/footer placeholders stay intact). Pure data → XML.
import type PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { FleetModel } from '@/src/lib/fleetModel'
import type { RouteLayout } from '@/src/calc/types'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { GATES } from '@/src/calc/gates'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { money } from '@/src/lib/vehicleDisplay'
import { cycleDerivation, chargingDerivation, bufferDerivation, type Derivation } from '@/src/lib/derivation'
import { METHODOLOGY } from '@/src/content/methodology'
import { VEHICLE_SLIDE, ROM_SLIDE } from './sections'
import {
  table, textBox, appendShapesToSlide, addImage, removeBodyPlaceholder, nextShapeId, TAL_RED,
  type TableCell, type TableBand,
} from './ooxml'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
const BODY = { x: 685800, y: 1828800, cx: 10820400, cy: 4114800 }
const ROW_H = 320000
const FLOW_IMG_H = 2500000   // height reserved for the S24 diagram image
const ROI_IMG_H = 2500000    // height reserved for the S28 payback chart

// Verdict palette — shared by the S19 verdict-cell fills and the S20 grid glyphs
// (pass = GREEN, review = YELLOW, fail = RED).
const STATUS_COLOR = { GREEN: '2E7D32', YELLOW: 'C77700', RED: 'C62828' } as const
const RED_TINT = 'FBE3E5'    // light accent-soft for the active progression cell
const GRAY = '8A8A8E'

const put = (
  zip: PizZip, slide: number, colW: number[], rows: TableCell[][],
  opts: { y?: number; bands?: TableBand[]; center?: boolean } = {},
): void => {
  // The graphic replaces the body text box — drop the empty placeholder behind it.
  removeBodyPlaceholder(zip, slide)
  const cy = (rows.length + (opts.bands ? 1 : 0)) * ROW_H
  // `center` vertically balances a sole-table slide in the body region.
  const y = opts.center ? BODY.y + Math.max(0, (BODY.cy - cy) / 2) : (opts.y ?? BODY.y)
  appendShapesToSlide(zip, slide, table({
    id: nextShapeId(zip, slide),
    x: BODY.x, y, cx: BODY.cx, cy,
    colW, rows, rowH: ROW_H, bands: opts.bands,
  }))
}

const ft = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ft`

const ROUTE_LABEL: Record<RouteLayout, string> = { low: 'Congested', medium: 'Mixed', high: 'Open' }

const TEMP_LABEL: Record<string, string> = {
  ambient: 'Ambient', refrigerated: 'Refrigerated', freezer: 'Freezer',
}

/** S18 — Application Requirements as a requirement → value table. Only rows with
 *  a meaningful value are shown (partial projects stay clean). */
export function fillRequirements(zip: PizZip, project: StoredProject): void {
  const rows: TableCell[][] = [[{ t: 'Requirement' }, { t: 'Value' }]]
  const add = (k: string, v?: string | null) => { if (v) rows.push([{ t: k, bold: true }, { t: v }]) }

  if ((project.maxLoadWeightLbs ?? 0) > 0) add('Max load weight', `${project.maxLoadWeightLbs!.toLocaleString()} lbs`)
  add('Payload / unit type', project.typicalUnitType?.trim())
  add('Transfer method', project.transferMethod?.trim())
  add('Delivery pattern', project.deliveryPattern?.trim())

  // Lift / transfer height — pick/drop, else legacy "lift to".
  const pick = project.pickHeightFt, drop = project.dropHeightFt
  if (pick != null || drop != null) {
    add('Lift / transfer', `${ft(pick ?? 0)} → ${ft(drop ?? 0)}`)
  } else if ((project.maxLiftHeightFt ?? 0) > 0) {
    add('Lift / transfer', `to ${ft(project.maxLiftHeightFt!)}`)
  }

  // Load footprint (declared load #1, else legacy singular fields).
  const l0 = project.loads?.[0]
  const L = l0?.lengthIn ?? project.loadLengthIn
  const W = l0?.widthIn ?? project.loadWidthIn
  const H = l0?.heightIn ?? project.loadHeightIn
  if (L || W || H) add('Load footprint (L×W×H)', `${L ?? '—'} × ${W ?? '—'} × ${H ?? '—'} in`)

  const env = project.temperatureEnvironment ?? (project.freezerCapable ? 'freezer' : undefined)
  if (env) add('Temperature', TEMP_LABEL[env] ?? env)
  if (project.tempMinF != null && project.tempMinF !== 0) add('Min temperature', `${project.tempMinF}°F`)
  if (project.tempMaxF != null && project.tempMaxF !== 0) add('Max temperature', `${project.tempMaxF}°F`)

  if (project.rampRequired != null || (project.maxRampGrade ?? 0) > 0) {
    const yes = project.rampRequired === true || (project.maxRampGrade ?? 0) > 0
    add('Ramp on site', yes ? ((project.maxRampGrade ?? 0) > 0 ? `Yes — ${project.maxRampGrade}% grade` : 'Yes') : 'No')
  }
  if (project.outdoorRequired != null) add('Operating environment', project.outdoorRequired ? 'Outdoor' : 'Indoor')
  if ((project.minAisleWidthFt ?? 0) > 0) add('Min aisle width', `${ft(project.minAisleWidthFt!)} (informational)`)

  const certs = Array.isArray(project.certifications) ? project.certifications.filter(Boolean) : []
  if (certs.length) add('Certifications', certs.join(', '))

  const hrPerDay = Math.min(24, (project.shiftsPerDay ?? 0) * (project.hoursPerShift ?? 0))
  if (hrPerDay > 0) add('Operating schedule', `${project.shiftsPerDay} shift${project.shiftsPerDay === 1 ? '' : 's'} × ${project.hoursPerShift} hr = ${hrPerDay} hr/day`)

  if (rows.length === 1) rows.push([{ t: '—' }, { t: 'No requirements captured yet (Step 1).' }])
  put(zip, ROM_SLIDE.requirements, [3600000, 7220400], rows, { center: true })
}

// ── Fleet Engine (S21 Raw / S22 Charging / S23 Buffer) — worked derivations ───
//
// Each tier slide reads as an independent stage: a meaning caption (what the
// tier does), the Raw + Charging × Buffer = Total progression strip with this
// tier lit, then a worked derivation table for a representative example —
// label · what it means · calculation · result (from src/lib/derivation.ts).

type Stage = 'raw' | 'charging' | 'buffer'

const STAGE_META: Record<Stage, { n: string; name: string; slide: number; meaning: string }> = {
  raw: { n: '1', name: 'RAW FLEET', slide: ROM_SLIDE.rawFleet,
    meaning: 'Each flow’s cycle time → vehicles needed (throughput × cycle ÷ 3600), summed per chassis and rounded up = raw base fleet.' },
  charging: { n: '2', name: 'CHARGING', slide: ROM_SLIDE.charging,
    meaning: 'Battery runtime vs recharge sets availability; dividing demand by availability adds the vehicles needed to cover charging downtime.' },
  buffer: { n: '3', name: 'BUFFER', slide: ROM_SLIDE.buffer,
    meaning: '(base + charging) × (1 + buffer), rounded up — spare capacity for maintenance, training, and demand spikes = fleet sold.' },
}

// Progression strip: RAW + CHARGING × BUFFER = TOTAL (operators in thin columns).
const PROG_COL = [2400000, 406800, 2400000, 406800, 2400000, 406800, 2400000]
const PROG_H = 2 * ROW_H
const CAP_H = 820000   // fits up to 4 caption lines (Raw adds an Inputs line)
// Worked-derivation table: Step · What it means · Calculation · Result.
const DERIV_COL = [2600000, 3400000, 3220400, 1600000]

/** The Raw + Charging × Buffer = Total build-up, with `stage`'s segment lit. */
function progressionRows(model: FleetModel, stage: Stage): TableCell[][] {
  const { fleet, settings } = model
  const chg = fleet.totalChargingDelta
  const hi = (s: Stage): Partial<TableCell> => (stage === s ? { fill: RED_TINT, color: TAL_RED, bold: true } : {})
  return [
    [{ t: 'RAW', align: 'ctr' }, { t: '', align: 'ctr' }, { t: 'CHARGING', align: 'ctr' },
     { t: '', align: 'ctr' }, { t: 'BUFFER', align: 'ctr' }, { t: '', align: 'ctr' }, { t: 'TOTAL', align: 'ctr' }],
    [{ t: String(fleet.totalBaseFleet), align: 'ctr', ...hi('raw') }, { t: '+', align: 'ctr' },
     { t: chg > 0 ? `+${chg}` : '0', align: 'ctr', ...hi('charging') }, { t: '×', align: 'ctr' },
     { t: `×${(1 + settings.bufferPct).toFixed(2)}`, align: 'ctr', ...hi('buffer') }, { t: '=', align: 'ctr' },
     { t: String(fleet.totalFleetSold), align: 'ctr', fill: TAL_RED, color: 'FFFFFF', bold: true }],
  ]
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

/** Render one tier slide: meaning caption → progression strip → worked example. */
function renderTier(zip: PizZip, stage: Stage, model: FleetModel, deriv: Derivation | null, example: string): void {
  const meta = STAGE_META[stage]
  removeBodyPlaceholder(zip, meta.slide)

  const caption: Parameters<typeof textBox>[0]['paras'] = [
    [{ t: `TIER ${meta.n} — ${meta.name}`, bold: true, sz: 1400, color: TAL_RED }],
    [{ t: meta.meaning, sz: 1100, color: GRAY }],
  ]
  if (example) caption.push([{ t: example, sz: 1050, color: GRAY }])
  // All input variables + values on one line (the worked steps below show how
  // each is used); the table can't fit a row per input.
  const inputs = (deriv?.steps ?? []).filter(s => s.kind === 'input')
  if (inputs.length) caption.push([{ t: `Inputs — ${inputs.map(s => `${s.label} ${s.result}`).join('  ·  ')}`, sz: 950, color: GRAY }])
  appendShapesToSlide(zip, meta.slide, textBox({
    id: nextShapeId(zip, meta.slide), x: BODY.x, y: BODY.y, cx: BODY.cx, cy: CAP_H, paras: caption,
  }))

  // Stacked layout: caption → 60k gap → progression strip → 150k gap → derivation.
  const progY = BODY.y + CAP_H + 60000
  put(zip, meta.slide, PROG_COL, progressionRows(model, stage), { y: progY })

  const derivY = progY + PROG_H + 150000
  put(zip, meta.slide, DERIV_COL,
    deriv ? derivationRows(deriv)
      : [[{ t: 'How it’s calculated' }], [{ t: 'Assign vehicles to flows (Step 3) to show the worked calculation.' }]],
    { y: derivY })
}

/**
 * S21/22/23 Fleet Engine — three independent tiers, each with its meaning, the
 * progression strip (this tier lit), and a worked derivation for a representative
 * example (the math, not just the sums). Native editable tables (work without a DOM).
 */
export function fillFleetEngine(
  zip: PizZip, model: FleetModel, vehicles: Vehicle[], names: Record<string, string>,
): void {
  const { flows, derivedByFlowId, fleet, settings } = model
  const vById = new Map(vehicles.map(v => [v.id, v]))

  // One representative worked example per tier (the deck shows the *method*; the
  // app holds the full per-flow data). Raw = first flow with a computed cycle.
  const rawFlow = flows.find(f => f.vehicleId && derivedByFlowId.get(f.id)?.breakdown)
  const rawVeh = rawFlow?.vehicleId ? vById.get(rawFlow.vehicleId) : undefined
  const rawBreak = rawFlow ? derivedByFlowId.get(rawFlow.id)?.breakdown : null
  const rawDeriv = rawFlow && rawVeh && rawBreak
    ? cycleDerivation(rawBreak, {
        distanceFt: rawFlow.distanceFt,
        thruPerHr: rawFlow.thruPerHr,
        speedLoadedFps: rawVeh.calc.speedLoadedFps,
        speedUnloadedFps: rawVeh.calc.speedUnloadedFps ?? rawVeh.calc.speedLoadedFps,
        liftSpeedFps: rawVeh.calc.liftSpeedFps ?? null,
        rawVehicles: derivedByFlowId.get(rawFlow.id)?.rawVehicles ?? null,
      })
    : null
  const rawExample = rawFlow
    ? `Example: ${rawVeh?.name ?? rawFlow.vehicleId} · ${rawFlow.origin || '—'} → ${rawFlow.destination || '—'}`
    : ''

  // Representative Charging/Buffer example: first sized vehicle group.
  const grp = fleet.groups[0]
  const grpVeh = grp ? vById.get(grp.vehicleId) : undefined
  const grpExample = grp ? `Example: ${names[grp.vehicleId] ?? grp.vehicleId}` : ''

  renderTier(zip, 'raw', model, rawDeriv, rawExample)
  renderTier(zip, 'charging', model, grp && grpVeh ? chargingDerivation(grp, grpVeh, settings) : null, grpExample)
  renderTier(zip, 'buffer', model, grp ? bufferDerivation(grp, settings.bufferPct) : null, grpExample)
}

/** Per-vehicle qualification, in deck-overview order (8TB · 8HBC · M10 · ML2 · E7 · CB18). */
function qualifyAll(project: StoredProject, vehicles: Vehicle[]) {
  const app = appRequirementsFromProject(project)
  const order = Object.keys(VEHICLE_SLIDE)
  const ordered = [...vehicles].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  return ordered.map(v => ({ vehicle: v, q: qualifyVehicle(v, app) }))
}

/** S19 verdict table + S20 gate×vehicle grid. Shows all candidate chassis — the
 *  matrix is the *selection rationale*, not just the chosen fleet. */
export function fillMatrix(zip: PizZip, project: StoredProject, vehicles: Vehicle[]): void {
  const results = qualifyAll(project, vehicles)

  // ── S19: Vehicle | Verdict | Notes ──────────────────────────────────────
  const verdictRows: TableCell[][] = [[{ t: 'Vehicle' }, { t: 'Verdict', align: 'ctr' }, { t: 'Notes' }]]
  for (const { vehicle, q } of results) {
    const hardFails = q.hardGates.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const softFails = q.softPreferences.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const notes = q.status === 'RED' ? `Fails: ${dedupe(hardFails).join(', ')}`
      : q.status === 'YELLOW' ? `Review: ${dedupe([...softFails, ...partialLoadNote(q)]).join(', ')}`
      : 'All gates pass'
    verdictRows.push([
      { t: vehicle.name, bold: true },
      { t: q.status, align: 'ctr', fill: STATUS_COLOR[q.status], color: 'FFFFFF', bold: true },
      { t: notes },
    ])
  }
  put(zip, ROM_SLIDE.matrixVerdict, [3000000, 2000000, 5820400], verdictRows, { center: true })

  // ── S20: Gate × vehicle pass/fail grid ──────────────────────────────────
  // Per vehicle, collapse multi-load gate entries to one verdict per gateId.
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
  // Only gates that actually ran for ≥1 vehicle (skip is requirement-driven).
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
  put(zip, ROM_SLIDE.matrixGrid, [3000000, ...byVeh.map(() => vehColW)], gridRows, { center: true })
}

/** S24 — Material flows. When a rendered diagram PNG is supplied it goes on top
 *  (the slide is the "Material Flow Diagram") and a compact flow table sits
 *  beneath it; otherwise the table fills the body. */
export function fillMaterialFlow(
  zip: PizZip, model: FleetModel, names: Record<string, string>, diagramPng?: Uint8Array | null,
): void {
  const { flows } = model
  const hasImg = !!diagramPng
  if (diagramPng) {
    addImage(zip, ROM_SLIDE.materialFlow, diagramPng, { x: BODY.x, y: BODY.y, cx: BODY.cx, cy: FLOW_IMG_H })
  }
  const tableY = hasImg ? BODY.y + FLOW_IMG_H + 140000 : BODY.y
  const MAX = hasImg ? 4 : 13

  const rows: TableCell[][] = [[
    { t: '#', align: 'ctr' }, { t: 'Route' }, { t: 'Distance', align: 'r' },
    { t: 'Moves/hr', align: 'r' }, { t: 'Layout', align: 'ctr' }, { t: 'Lift', align: 'r' }, { t: 'Vehicle' },
  ]]
  flows.slice(0, MAX).forEach((f, i) => rows.push([
    { t: String(i + 1), align: 'ctr' },
    { t: `${f.origin || '—'} → ${f.destination || '—'}` },
    { t: ft(f.distanceFt), align: 'r' },
    { t: String(f.thruPerHr ?? 0), align: 'r' },
    { t: ROUTE_LABEL[f.routeLayout] ?? f.routeLayout, align: 'ctr' },
    { t: ft(f.liftHeightFt), align: 'r' },
    { t: f.vehicleId ? (names[f.vehicleId] ?? f.vehicleId) : 'Unassigned' },
  ]))
  if (flows.length === 0) rows.push([{ t: '—', align: 'ctr' }, { t: 'No flows defined yet (Step 3).' }, ...Array(5).fill({ t: '' })])
  if (flows.length > MAX) rows.push([{ t: '' }, { t: `+ ${flows.length - MAX} more flow${flows.length - MAX === 1 ? '' : 's'}…` }, ...Array(5).fill({ t: '' })])

  put(zip, ROM_SLIDE.materialFlow, [560000, 4060400, 1300000, 1300000, 1300000, 1100000, 1200000], rows, { y: tableY })
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
  put(zip, ROM_SLIDE.investment, [4200000, 1200000, 2710200, 2710200], rows, { center: true })
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
      { t: t.variables.map(v => `${v.sym} = ${v.name}`).join('  ·  ') },
      { t: firstSentence(t.why) },
    ])
  }
  put(zip, slide, [1700000, 3300000, 3300000, 2520400], rows)
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
    { t: 'Cycle', align: 'r' }, { t: 'Vehicles = Q × cycle ÷ 3600', align: 'r' },
  ]]
  for (const f of flowsSubset) {
    const v = f.vehicleId ? vById.get(f.vehicleId) : undefined
    const b = model.derivedByFlowId.get(f.id)?.breakdown
    if (!v || !b) continue
    const d = cycleDerivation(b, {
      distanceFt: f.distanceFt, thruPerHr: f.thruPerHr,
      speedLoadedFps: v.calc.speedLoadedFps,
      speedUnloadedFps: v.calc.speedUnloadedFps ?? v.calc.speedLoadedFps,
      liftSpeedFps: v.calc.liftSpeedFps ?? null,
      rawVehicles: model.derivedByFlowId.get(f.id)?.rawVehicles ?? null,
    })
    const cyc = d.steps.find(s => s.label === 'Cycle time')
    const cnt = d.steps.find(s => s.label === 'Vehicle count')
    rows.push([
      { t: `${nm(f.vehicleId!)} · ${f.origin || '—'} → ${f.destination || '—'}`, bold: true },
      { t: cyc?.sub ?? '—' },
      { t: cyc?.result ?? '—', align: 'r' },
      { t: cnt ? `${cnt.sub} = ${cnt.result}` : '—', align: 'r' },
    ])
  }
  if (rows.length === 1) rows.push([{ t: 'No flows with an assigned vehicle.' }, { t: '' }, { t: '' }, { t: '' }])
  put(zip, slide, [3000000, 4000000, 1000000, 2820400], rows)
}

/** S28 ROI — the payback-curve chart (when rendered) on top, with an ROI metrics
 *  table beneath; table-only when no chart (non-DOM context). */
export function fillRoi(
  zip: PizZip, model: FleetModel, paybackPng?: Uint8Array | null,
): void {
  const { rom } = model
  const payback = rom.payback.paybackYears
  if (paybackPng) {
    addImage(zip, ROM_SLIDE.roi, paybackPng, { x: BODY.x, y: BODY.y, cx: BODY.cx, cy: ROI_IMG_H })
  }
  const tableY = paybackPng ? BODY.y + ROI_IMG_H + 140000 : BODY.y
  const rows: TableCell[][] = [
    [{ t: 'Metric' }, { t: 'Value', align: 'r' }],
    [{ t: 'Simple payback', bold: true }, { t: payback == null ? '—' : `${payback.toFixed(1)} years`, align: 'r' }],
    [{ t: 'Annual labor offset', bold: true }, { t: money(rom.payback.annualLaborOffset), align: 'r' }],
    [{ t: 'Annual operating cost', bold: true }, { t: money(rom.opex.annualOpex), align: 'r' }],
  ]
  put(zip, ROM_SLIDE.roi, [5000000, 5820400], rows, { y: tableY })
}

// ── helpers ──────────────────────────────────────────────────────────────────

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)].filter(Boolean)
}

/** When only some declared loads pass, surface it as a review note on S19. */
function partialLoadNote(q: ReturnType<typeof qualifyVehicle>): string[] {
  if (!q.perLoad || q.perLoad.every(l => l.passed) || !q.perLoad.some(l => l.passed)) return []
  return [`${q.perLoad.filter(l => !l.passed).length} load(s) don't fit`]
}

/** Pass/fail/review/skip glyph for the S20 grid cell. */
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
