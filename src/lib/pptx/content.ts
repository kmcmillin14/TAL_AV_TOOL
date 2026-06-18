// Fills the ROM money slides — KPIs (S25/26), Investment (S27), ROI (S28) — by
// writing into the template's existing body Content Placeholder (<p:ph idx="1"/>)
// so content inherits the slide's branded position/style. (The Fleet Engine
// slides S21/22/23 are native tables — see tables.ts → fillFleetEngine.)
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { money as usd } from '@/src/lib/vehicleDisplay'
import { fillBodyPlaceholder, type TextRun } from './ooxml'
import { ROM_SLIDE } from './sections'

const GRAY = '8A8A8E'
const RED = 'accent1' // theme TAL red

const label = (t: string): TextRun[] => [{ t, sz: 1400, color: GRAY }]
const hero = (t: string): TextRun[] => [{ t, sz: 3200, bold: true, color: RED }]
const line = (t: string, sz = 1800): TextRun[] => [{ t, sz }]
const note = (t: string): TextRun[] => [{ t, sz: 1200, color: GRAY }]

/** Fill a body placeholder; falsy rows are dropped. */
const fill = (zip: PizZip, slide: number, paras: Array<TextRun[] | null | undefined>) =>
  fillBodyPlaceholder(zip, slide, paras.filter((p): p is TextRun[] => p != null))

/** S25–S28 money slides (KPIs, Investment, ROI). */
export function fillRomMoney(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, rom, flows } = model
  const nm = (id: string) => names[id] ?? id
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join(' · ') || '—'
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const payback = rom.payback.paybackYears
  const put = (slide: number, paras: Array<TextRun[] | null | undefined>) => fill(zip, slide, paras)

  // S25 — KPIs (headline)
  put(ROM_SLIDE.kpisHeadline, [
    label('Fleet KPIs'),
    line(`${fleet.totalFleetSold} vehicles  ·  ${flows.length} flow${flows.length === 1 ? '' : 's'}  ·  ${throughput} moves/hr`, 2200),
    line(`Base ${fleet.totalBaseFleet}  +  charging ${fleet.totalChargingDelta}  →  buffered ${fleet.totalFleetSold}`, 1600),
  ])

  // S26 — KPIs (fleet mix breakdown)
  put(ROM_SLIDE.kpisMix, [
    label('Fleet mix'),
    ...fleet.groups.map(g => line(`${nm(g.vehicleId)} — ${g.fleetSold} vehicle${g.fleetSold === 1 ? '' : 's'}`, 1600)),
  ])

  // S27 — Investment Summary (CAPEX)
  put(ROM_SLIDE.investment, [
    label('System CAPEX — budgetary range'),
    hero(`${usd(rom.pricing.totalMin)} – ${usd(rom.pricing.totalMax)}`),
    line(`Total fleet: ${fleet.totalFleetSold} vehicles`),
    line(`Mix: ${mix}`, 1600),
    note('Budgetary ROM — pricing is a range, not a quote.'),
  ])

  // S28 — ROI / payback
  put(ROM_SLIDE.roi, [
    label('Simple payback'),
    hero(payback == null ? '—' : `${payback.toFixed(1)} years`),
    line(`Annual labor offset: ${usd(rom.payback.annualLaborOffset)}`),
    line(`Annual operating cost: ${usd(rom.opex.annualOpex)}`, 1600),
    payback == null
      ? note('Add operators displaced (Step 4) to compute payback.')
      : null,
  ])
}
