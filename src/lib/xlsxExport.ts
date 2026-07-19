// Excel workbook export — client-side via SheetJS (no backend, per
// ARCHITECTURE.md). A single, fully-formula-driven "Fleet Model" sheet: every
// input cell (distance, moves/hr, speeds, transfer times, availability (energy + rotation), buffer)
// is editable and the downstream cells (cycle, raw demand, base, +charging,
// fleet sold, totals) are live Excel formulas — so the model recomputes offline
// exactly as the app does. All figures imperial, matching storage.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import type { WorkSheet, CellObject, ColInfo } from 'xlsx'
import { computeFleetModel } from './fleetModel'
import { cycleBreakdown, routeLayoutFactor } from '../calc/flowMetrics'
import { projectFilename } from './projectFilename'

// Minimal cell helpers over SheetJS's CellObject.
const S = (v: string): CellObject => ({ t: 's', v })
const N = (v: number, z?: string): CellObject => ({ t: 'n', v, z })
const F = (f: string, z?: string): CellObject => ({ t: 'n', f, z })

type XlsxUtils = { encode_cell: (a: { c: number; r: number }) => string; encode_range: (r: { s: { c: number; r: number }; e: { c: number; r: number } }) => string }

/** Build the editable Fleet Model worksheet (pure — takes SheetJS utils so it's
 *  unit-testable without touching the DOM/download path). */
export function buildFleetModelSheet(utils: XlsxUtils, project: StoredProject, vehicles: Vehicle[]): WorkSheet {
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const { flows, settings, fleet } = computeFleetModel(project, vehicles)

  const ws: WorkSheet = {}
  const put = (c: number, r: number, cell: CellObject) => { ws[utils.encode_cell({ c, r })] = cell }
  let maxR = 0
  const MAXC = 13 // N

  // ── Title + global input ────────────────────────────────────────────────
  put(0, 0, S('TAL Fleet Calculator — Editable Fleet Model'))
  put(0, 1, S(`${project.projectName ?? 'Untitled'}${project.customerName ? ` · ${project.customerName}` : ''}`))
  put(0, 2, S('Buffer'))
  put(1, 2, N(settings.bufferPct, '0%'))            // $B$3 — referenced by every "Fleet sold"
  const BUFFER = '$B$3'
  maxR = 2

  // ── FLOWS block (inputs → cycle → raw) ──────────────────────────────────
  const FLOW_NOTE_R = 4
  put(0, FLOW_NOTE_R, S('FLOWS — edit any value; Cycle (s) and Raw veh are live formulas'))
  const FH = 5 // header row (0-based) → Excel row 6
  const flowHeaders = ['#', 'Origin', 'Destination', 'Vehicle', 'Dist (ft)', 'Moves/hr',
    'Spd loaded (fps)', 'Spd empty (fps)', 'Route factor', 'Load (s)', 'Unload (s)', 'Lift (s)', 'Cycle (s)', 'Raw veh']
  flowHeaders.forEach((h, c) => put(c, FH, S(h)))

  const firstFlowR = FH + 1              // 0-based
  flows.forEach((f, i) => {
    const r = firstFlowR + i
    const er = r + 1                     // Excel (1-based) row for formulas
    const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
    put(0, r, N(i + 1))
    put(1, r, S(f.origin || ''))
    put(2, r, S(f.destination || ''))
    put(3, r, S(veh?.name ?? ''))
    put(4, r, N(f.distanceFt ?? 0))
    put(5, r, N(f.thruPerHr ?? 0))
    if (veh) {
      const bd = cycleBreakdown(f.distanceFt ?? 0, veh, f.routeLayout ?? 'medium',
        f.liftHeightFt ?? 0, f.transferMethodIdx ?? 0, f.transferSecOverride)
      put(6, r, N(veh.calc.speedLoadedFps ?? 0))
      put(7, r, N(veh.calc.speedUnloadedFps ?? veh.calc.speedLoadedFps ?? 0))
      put(8, r, N(routeLayoutFactor(f.routeLayout ?? 'medium'), '0.00'))
      put(9, r, N(Number((bd?.loadSec ?? 0).toFixed(1))))
      put(10, r, N(Number((bd?.unloadSec ?? 0).toFixed(1))))
      put(11, r, N(Number((bd?.liftTimeSec ?? 0).toFixed(1))))
      // Cycle = dist/(loaded·factor) + dist/(empty·factor) + load + unload + lift
      put(12, r, F(`IF(AND(G${er}>0,H${er}>0,I${er}>0),E${er}/(G${er}*I${er})+E${er}/(H${er}*I${er})+J${er}+K${er}+L${er},"")`, '0.0'))
      // Raw vehicles = moves/hr × cycle ÷ 3600
      put(13, r, F(`IF(M${er}="","",F${er}*M${er}/3600)`, '0.000'))
    }
  })
  const lastFlowER = firstFlowR + Math.max(flows.length, 1) // Excel row of last flow (≥ header+1)
  maxR = firstFlowR + flows.length + 1

  // ── FLEET block (raw → base → availabilities → +charging → sold) ────────
  const fleetNoteR = maxR + 1
  put(0, fleetNoteR, S('FLEET — by vehicle pool; both Availability cells are editable, the rest recompute'))
  const fleetHR = fleetNoteR + 1
  const fleetHeaders = ['Vehicle', 'Raw demand', 'Base fleet', 'Avail energy', 'Avail rotation', '+ Charging', 'Fleet sold']
  fleetHeaders.forEach((h, c) => put(c, fleetHR, S(h)))

  const firstPoolR = fleetHR + 1
  fleet.groups.forEach((g, i) => {
    const r = firstPoolR + i
    const er = r + 1
    const name = vehicleById.get(g.vehicleId)?.name ?? g.vehicleId
    const aEnergy = g.charging.aEnergy != null && g.charging.aEnergy > 0 ? g.charging.aEnergy : 1
    const aCap = g.charging.aCap != null && g.charging.aCap > 0 ? g.charging.aCap : 1
    put(0, r, S(name))
    // Raw demand pulled from the flows' Raw column by vehicle name.
    put(1, r, F(`SUMIF($D$${firstFlowR + 1}:$D$${lastFlowER},A${er},$N$${firstFlowR + 1}:$N$${lastFlowER})`, '0.000'))
    put(2, r, F(`IF(B${er}>0,ROUNDUP(B${er},0),0)`))
    put(3, r, N(aEnergy, '0%'))
    put(4, r, N(aCap, '0%'))
    put(5, r, F(`MAX(0,ROUNDUP(B${er}/MIN(D${er},E${er}),0)-C${er})`))
    // v3 composition: larger of energy (unbuffered) and rotation (buffered), floored at base.
    put(6, r, F(`MAX(C${er},ROUNDUP(MAX(B${er}/D${er},B${er}*(1+${BUFFER})/E${er}),0))`))
  })
  const nPools = fleet.groups.length
  const totalR = firstPoolR + nPools
  if (nPools > 0) {
    const firstER = firstPoolR + 1
    const lastER = firstPoolR + nPools
    put(0, totalR, S('TOTAL'))
    put(2, totalR, F(`SUM(C${firstER}:C${lastER})`))
    put(5, totalR, F(`SUM(F${firstER}:F${lastER})`))
    put(6, totalR, F(`SUM(G${firstER}:G${lastER})`))
  }
  maxR = totalR + 1

  ws['!ref'] = utils.encode_range({ s: { c: 0, r: 0 }, e: { c: MAXC, r: maxR } })
  ws['!cols'] = [
    { wch: 5 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 13 },
    { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
  ] as ColInfo[]

  return ws
}

export async function downloadProjectXlsx(project: StoredProject, vehicles: Vehicle[]): Promise<void> {
  const XLSX = await import('xlsx')
  const ws = buildFleetModelSheet(XLSX.utils, project, vehicles)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fleet Model')
  XLSX.writeFile(wb, projectFilename(project, 'xlsx'))
}
