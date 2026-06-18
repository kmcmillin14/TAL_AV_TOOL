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
import { VEHICLE_SLIDE, ROM_SLIDE } from './sections'
import {
  table, appendShapesToSlide, addImage, removeBodyPlaceholder, nextShapeId, TAL_RED,
  type TableCell, type TableBand,
} from './ooxml'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
const BODY = { x: 685800, y: 1828800, cx: 10820400, cy: 4114800 }
const ROW_H = 320000
const FLOW_IMG_H = 2500000   // height reserved for the S24 diagram image

// Verdict palette — shared by the S19 verdict-cell fills and the S20 grid glyphs
// (pass = GREEN, review = YELLOW, fail = RED).
const STATUS_COLOR = { GREEN: '2E7D32', YELLOW: 'C77700', RED: 'C62828' } as const
const RED_TINT = 'FBE3E5'    // light accent-soft for the active progression cell

const put = (
  zip: PizZip, slide: number, colW: number[], rows: TableCell[][],
  opts: { y?: number; bands?: TableBand[] } = {},
): void => {
  // The graphic replaces the body text box — drop the empty placeholder behind it.
  removeBodyPlaceholder(zip, slide)
  appendShapesToSlide(zip, slide, table({
    id: nextShapeId(zip, slide),
    x: BODY.x, y: opts.y ?? BODY.y, cx: BODY.cx,
    cy: (rows.length + (opts.bands ? 1 : 0)) * ROW_H,
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
  put(zip, ROM_SLIDE.requirements, [3600000, 7220400], rows)
}

// ── Fleet Engine (S21 Raw / S22 Charging / S23 Buffer) — web-app tables ───────

type Stage = 'raw' | 'charging' | 'buffer'
const ENGINE_ROUTE: Record<RouteLayout, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const fmtH = (h: number | null | undefined) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtPct = (a: number | null | undefined) => (a == null ? '—' : `${Math.round(a * 100)}%`)
const fmtCycle = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s)}s`)

// Progression strip: RAW + CHARGING × BUFFER = TOTAL (operators in thin columns).
const PROG_COL = [2400000, 406800, 2400000, 406800, 2400000, 406800, 2400000]
const PROG_H = 2 * ROW_H

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

const DETAIL_MAX = 8
const detailY = BODY.y + PROG_H + 140000

// Detail-table column widths (EMU; each tuple sums to BODY.cx = 10820400).
const RAW_DETAIL_COL = [460000, 1500000, 1300000, 1300000, 1100000, 1100000, 1150000, 1150000, 880400, 880000]
const CHARGING_COL = [3200000, 1500000, 1000000, 1020400, 1000000, 1000000, 1100000, 1000000]
const BUFFER_COL = [4600000, 1500000, 1600000, 1620400, 1500000]

/** Append the empty-state row (no rows) or a "+N more" row (truncated) to a
 *  detail table, padded to its column count. */
const appendOverflow = (rows: TableCell[][], total: number, emptyMsg: string): void => {
  const cols = rows[0].length
  const pad = (text: string) => rows.push([{ t: text }, ...Array(cols - 1).fill({ t: '' })])
  if (total === 0) pad(emptyMsg)
  else if (total > DETAIL_MAX) pad(`+ ${total - DETAIL_MAX} more`)
}

/**
 * S21/22/23 Fleet Engine — each slide shows the Raw → Charging × Buffer = Total
 * progression strip plus that stage's detail table, mirroring the web app's
 * Flows / Charging / Buffer tables. Native editable tables (work without a DOM).
 */
export function fillFleetEngine(
  zip: PizZip, model: FleetModel, vehicles: Vehicle[], names: Record<string, string>,
): void {
  const { flows, derivedByFlowId, fleet, settings } = model
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const gById = new Map(fleet.groups.map(g => [g.vehicleId, g]))
  const nm = (id: string) => names[id] ?? id
  const route = (f: { vehicleId?: string; origin: string; destination: string }) =>
    `${nm(f.vehicleId ?? '')}  ${f.origin || '—'} → ${f.destination || '—'}`
  const assigned = flows.filter(f => f.vehicleId)

  // S21 — Raw fleet table (Vehicle · Route Input · Output bands).
  put(zip, ROM_SLIDE.rawFleet, PROG_COL, progressionRows(model, 'raw'))
  const rawRows: TableCell[][] = [[
    { t: '#', align: 'ctr' }, { t: 'Vehicle' }, { t: 'Transfer Type' }, { t: 'Route Avg Speed', align: 'ctr' },
    { t: 'Origin' }, { t: 'Destination' }, { t: 'Distance (RT)', align: 'r' }, { t: 'Moves/hr', align: 'r' },
    { t: 'Cycle Time', align: 'r' }, { t: 'Vehicle Count', align: 'r' },
  ]]
  flows.slice(0, DETAIL_MAX).forEach((f, i) => {
    const v = f.vehicleId ? vById.get(f.vehicleId) : undefined
    const d = derivedByFlowId.get(f.id)
    rawRows.push([
      { t: String(i + 1), align: 'ctr' },
      { t: v?.name ?? '—' },
      { t: v?.transferMethods[f.transferMethodIdx ?? 0]?.method ?? '—' },
      { t: ENGINE_ROUTE[f.routeLayout] ?? f.routeLayout, align: 'ctr' },
      { t: f.origin || '—' }, { t: f.destination || '—' },
      { t: ft(f.distanceFt), align: 'r' },
      { t: String(f.thruPerHr ?? 0), align: 'r' },
      { t: fmtCycle(d?.cycleSeconds), align: 'r' },
      { t: d?.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2), align: 'r' },
    ])
  })
  appendOverflow(rawRows, flows.length, 'Add a flow in Step 3 to size the fleet.')
  const rawBands: TableBand[] = [{ t: '', span: 1 }, { t: 'Vehicle', span: 2 }, { t: 'Route Input', span: 5 }, { t: 'Output', span: 2 }]
  put(zip, ROM_SLIDE.rawFleet, RAW_DETAIL_COL, rawRows, { y: detailY, bands: rawBands })

  // S22 — Charging table.
  put(zip, ROM_SLIDE.charging, PROG_COL, progressionRows(model, 'charging'))
  const chRows: TableCell[][] = [[
    { t: 'Flow' }, { t: 'Charge Method', align: 'ctr' }, { t: 'Cycle', align: 'r' }, { t: 'Vehicles', align: 'r' },
    { t: 'Runtime', align: 'r' }, { t: 'Recharge', align: 'r' }, { t: 'Availability', align: 'r' }, { t: 'Charging', align: 'ctr' },
  ]]
  assigned.slice(0, DETAIL_MAX).forEach(f => {
    const c = gById.get(f.vehicleId!)?.charging
    const d = derivedByFlowId.get(f.id)
    const delta = c?.chargingDelta ?? 0
    chRows.push([
      { t: route(f) },
      { t: c?.method === 'plugged' ? 'Plugged' : c?.method === 'opportunity' ? 'Opportunity' : '—', align: 'ctr' },
      { t: fmtCycle(d?.cycleSeconds), align: 'r' },
      { t: d?.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2), align: 'r' },
      { t: fmtH(c?.runHr), align: 'r' }, { t: fmtH(c?.chargeHr), align: 'r' },
      { t: fmtPct(c?.availability), align: 'r' },
      { t: delta > 0 ? `+${delta}` : c?.availability === 1 ? 'fits' : '+0', align: 'ctr' },
    ])
  })
  appendOverflow(chRows, assigned.length, 'Assign vehicles to flows to model charging.')
  put(zip, ROM_SLIDE.charging, CHARGING_COL, chRows, { y: detailY })

  // S23 — Buffer waterfall table.
  put(zip, ROM_SLIDE.buffer, PROG_COL, progressionRows(model, 'buffer'))
  const mult = (1 + settings.bufferPct).toFixed(2)
  const bufRows: TableCell[][] = [[
    { t: 'Flow' }, { t: 'Base', align: 'r' }, { t: '+ Charging', align: 'r' }, { t: `× ${mult}`, align: 'r' }, { t: 'Fleet', align: 'r' },
  ]]
  assigned.slice(0, DETAIL_MAX).forEach(f => {
    const g = gById.get(f.vehicleId!)
    const delta = g?.charging.chargingDelta ?? 0
    bufRows.push([
      { t: route(f) },
      { t: g ? String(g.baseFleet) : '—', align: 'r' },
      { t: delta > 0 ? `+${delta}` : '—', align: 'r' },
      { t: g ? (g.fleetWithCharging * (1 + settings.bufferPct)).toFixed(2) : '—', align: 'r' },
      { t: g ? String(g.fleetSold) : '—', align: 'r', bold: true },
    ])
  })
  appendOverflow(bufRows, assigned.length, 'Assign vehicles to flows to size the fleet.')
  put(zip, ROM_SLIDE.buffer, BUFFER_COL, bufRows, { y: detailY })
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
  put(zip, ROM_SLIDE.matrixVerdict, [3000000, 2000000, 5820400], verdictRows)

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
  put(zip, ROM_SLIDE.matrixGrid, [3000000, ...byVeh.map(() => vehColW)], gridRows)
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
