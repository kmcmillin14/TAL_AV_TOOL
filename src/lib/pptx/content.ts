// Fills the ROM KPI slides — S25 (Financials) and S26 (Fleet & flow) — with native
// engineering metric tiles (big figure + accent rule + spaced caps label) that mirror
// the Step-4 ROM dashboard's hero tiles + gauges (src/components/rom/RomKpis.tsx), so
// the deck carries the same headline metrics the dashboard shows. Layout is managed by
// the shared frame grammar (layout.ts); takeaway sentences come from takeaways.ts.
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { chargingSeries } from '@/src/calc/romCharts'
import { resilience } from '@/src/calc/romSensitivity'
import { ROM_SLIDE } from './sections'
import { frame, usd, usdRange, pct, type TileSpec } from './layout'
import { financialsTakeaway, fleetFlowTakeaway } from './takeaways'

const MONEY_FIG = 1800     // figure size for long money / range values

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
  const f25 = frame(zip, ROM_SLIDE.kpisHeadline)
  f25.eyebrow('05 — FINANCIALS')
  f25.takeaway(financialsTakeaway(model))
  const financials: TileSpec[] = [
    { value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), label: 'ROM CAPEX', accent: true, figSz: MONEY_FIG },
    { value: usd(offset - opex), label: 'NET BENEFIT / YR', accent: true, figSz: 2400 },
    { value: payback == null ? '—' : payback.toFixed(1), unit: 'yr', label: 'PAYBACK' },
    { value: usd(offset), label: 'LABOR OFFSET / YR', figSz: 2400 },
    { value: usd(opex), label: 'ANNUAL OPEX', figSz: 2400 },
    { value: usd(tcoAtLife), label: `TCO @ ${serviceLifeYears}YR`, figSz: 2400 },
    { value: costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`, label: 'COST / MOVE', figSz: 2400 },
  ]
  f25.tiles(financials, { cols: 4, h: 1300000 })

  // ── S26 — Fleet & flow + status gauges ──────────────────────────────────────
  const f26 = frame(zip, ROM_SLIDE.kpisMix)
  f26.eyebrow('05 — FLEET & FLOW')
  f26.takeaway(fleetFlowTakeaway(model))
  const fleetFlow: TileSpec[] = [
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
  f26.tiles(fleetFlow, { cols: 5, h: 1150000 })
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join('   ·   ')
  f26.caption(mix ? `Fleet mix — ${mix}` : 'No fleet sized yet (Step 3).')
}
