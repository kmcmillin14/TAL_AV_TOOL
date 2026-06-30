// Fills the ROM KPI slides — S25 (Financials) and S26 (Fleet & flow) — with native
// engineering metric tiles (big figure + accent rule + spaced caps label) that mirror
// the Step-4 ROM dashboard's hero tiles + gauges (src/components/rom/RomKpis.tsx), so
// the deck carries the same headline metrics the dashboard shows. The template's empty
// body placeholder is removed first so nothing ghosts behind the tiles. (Investment S27
// and ROI S28 are native tables/charts — see tables.ts; Fleet Engine S21–23 likewise.)
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { chargingSeries } from '@/src/calc/romCharts'
import { resilience } from '@/src/calc/romSensitivity'
import {
  appendShapesToSlide, removeBodyPlaceholder, nextShapeId, metricTile, textBox,
} from './ooxml'
import { ROM_SLIDE } from './sections'

const GRAY = '8A8A8E'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
const BODY = { x: 685800, y: 1828800, cx: 10820400 }
const EYEBROW_H = 360000   // section label height
const TILE_GAP = 200000
const MONEY_FIG = 1800     // figure size for long money / range values

// Compact USD (mirrors RomKpis.usd): $1.02M / $367K / $42.
const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`
const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`
const pct = (x: number) => `${Math.round(x * 100)}%`

interface Tile { value: string; unit?: string; label: string; accent?: boolean; figSz?: number }

/** Section eyebrow ("FINANCIALS" etc.) as a spaced red caps label above the tiles. */
function eyebrow(zip: PizZip, slide: number, text: string): void {
  appendShapesToSlide(zip, slide, textBox({
    id: nextShapeId(zip, slide), x: BODY.x, y: BODY.y, cx: BODY.cx, cy: EYEBROW_H,
    paras: [[{ t: text, bold: true, sz: 1400, color: 'EB0A1E' }]],
  }))
}

/** Lay tiles out in a `cols`-wide grid starting at `y`; returns the bottom y. */
function tileGrid(zip: PizZip, slide: number, tiles: Tile[], y: number, cols: number, tileH: number): number {
  const tileW = Math.round((BODY.cx - (cols - 1) * TILE_GAP) / cols)
  let id = nextShapeId(zip, slide)
  const shapes = tiles.map((t, i) => {
    const r = Math.floor(i / cols), c = i % cols
    const xml = metricTile({
      id, x: BODY.x + c * (tileW + TILE_GAP), y: y + r * (tileH + TILE_GAP),
      cx: tileW, cy: tileH, value: t.value, unit: t.unit, label: t.label, accent: t.accent, figSz: t.figSz,
    })
    id += 2   // metricTile consumes id and id+1 (card + accent rule)
    return xml
  }).join('')
  appendShapesToSlide(zip, slide, shapes)
  const rows = Math.ceil(tiles.length / cols)
  return y + rows * tileH + (rows - 1) * TILE_GAP
}

/** A muted caption strip below the tiles. */
function caption(zip: PizZip, slide: number, text: string, y: number): void {
  appendShapesToSlide(zip, slide, textBox({
    id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy: 460000,
    paras: [[{ t: text, sz: 1300, color: GRAY }]],
  }))
}

/**
 * S25/S26 KPI slides as engineering metric tiles mirroring the dashboard:
 * S25 = Financials (CAPEX · Net benefit · Payback · Labor offset · OPEX · TCO ·
 * Cost/move); S26 = Fleet & flow (Total fleet · Vehicle types · Flows · Throughput ·
 * Energy) + the status gauges (Utilization · Availability · Charging · Redundancy),
 * with the fleet mix as a caption.
 */
export function fillKpis(
  zip: PizZip, model: FleetModel, names: Record<string, string>,
  vehicleById: Map<string, Vehicle>, serviceLifeYears: number,
): void {
  const { fleet, flows, rom, settings, costs } = model
  const nm = (id: string) => names[id] ?? id
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  // ── financial figures (mirror RomKpis) ───────────────────────────────────
  const offset = rom.payback.annualLaborOffset
  const opex = rom.opex.annualOpex
  const payback = rom.payback.paybackYears
  const totalSold = fleet.groups.reduce((s, g) => s + g.fleetSold, 0)
  const totalRaw = fleet.groups.reduce((s, g) => s + g.groupRaw, 0)
  const avgUtil = totalSold > 0 ? totalRaw / totalSold : null
  const tcoAtLife = rom.pricing.totalMid + opex * serviceLifeYears
  const opDays = Math.max(1, costs.operatingDaysPerYear)
  const annualMoves = throughput * settings.dailyOpHr * costs.operatingDaysPerYear
  const lifetimeMoves = annualMoves * serviceLifeYears
  const costPerMove = lifetimeMoves > 0 ? tcoAtLife / lifetimeMoves : null
  const energyPerDay = rom.opex.annualEnergyKwh / opDays
  const energyPerWeek = rom.opex.annualEnergyKwh / 52

  // Fleet-wide gauge aggregates (weighted by units sold) — same math as the dashboard.
  const charge = chargingSeries(fleet, vehicleById)
  let wAvail = 0, wCharge = 0
  charge.rows.forEach((r, i) => {
    const sold = fleet.groups[i]?.fleetSold ?? 0
    const runHr = r.runHr ?? 0, chargeHr = r.chargeHr ?? 0
    wAvail += (r.availability ?? 0) * sold
    wCharge += (runHr + chargeHr > 0 ? chargeHr / (runHr + chargeHr) : 0) * sold
  })
  const avgAvailability = totalSold > 0 ? wAvail / totalSold : 0
  const avgCharging = totalSold > 0 ? wCharge / totalSold : 0
  const res = resilience({ fleet })

  // ── S25 — Financials ──────────────────────────────────────────────────────
  removeBodyPlaceholder(zip, ROM_SLIDE.kpisHeadline)
  eyebrow(zip, ROM_SLIDE.kpisHeadline, 'FINANCIALS')
  const financials: Tile[] = [
    { value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), label: 'ROM CAPEX', accent: true, figSz: MONEY_FIG },
    { value: usd(offset - opex), label: 'NET BENEFIT / YR', accent: true, figSz: 2400 },
    { value: payback == null ? '—' : payback.toFixed(1), unit: 'yr', label: 'PAYBACK' },
    { value: usd(offset), label: 'LABOR OFFSET / YR', figSz: 2400 },
    { value: usd(opex), label: 'ANNUAL OPEX', figSz: 2400 },
    { value: usd(tcoAtLife), label: `TCO @ ${serviceLifeYears}YR`, figSz: 2400 },
    { value: costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`, label: 'COST / MOVE', figSz: 2400 },
  ]
  tileGrid(zip, ROM_SLIDE.kpisHeadline, financials, BODY.y + EYEBROW_H + 120000, 4, 1500000)

  // ── S26 — Fleet & flow + status gauges ──────────────────────────────────────
  removeBodyPlaceholder(zip, ROM_SLIDE.kpisMix)
  eyebrow(zip, ROM_SLIDE.kpisMix, 'FLEET & FLOW')
  const fleetFlow: Tile[] = [
    { value: String(fleet.totalFleetSold), label: 'TOTAL FLEET', accent: true },
    { value: String(fleet.groups.length), label: 'VEHICLE TYPES' },
    { value: String(flows.length), label: 'FLOWS' },
    { value: String(throughput), unit: '/ hr', label: 'THROUGHPUT' },
    { value: `${Math.round(energyPerDay)} · ${Math.round(energyPerWeek)}`, label: 'ENERGY KWH /D · /WK', figSz: 2200 },
    { value: avgUtil == null ? '—' : pct(avgUtil), label: 'UTILIZATION' },
    { value: pct(avgAvailability), label: 'AVAILABILITY' },
    { value: pct(avgCharging), label: 'CHARGING' },
    { value: res.throughputHeldWithOneDown ? '✓' : pct(res.retainedPct), label: 'REDUNDANCY' },
  ]
  const bottom = tileGrid(zip, ROM_SLIDE.kpisMix, fleetFlow, BODY.y + EYEBROW_H + 120000, 5, 1300000)
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join('   ·   ')
  caption(zip, ROM_SLIDE.kpisMix, mix ? `Fleet mix — ${mix}` : 'No fleet sized yet (Step 3).', bottom + 200000)
}
