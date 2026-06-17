// Fills the kept ROM text slides by writing into the template's existing body
// Content Placeholder (<p:ph idx="1"/>) so content inherits the slide's branded
// position/style. Two groups: the Fleet Engine math (S21/22/23) — used as a
// FALLBACK when the canvas charts can't render (see engineChart.ts) — and the
// money slides KPIs (S25/26), Investment (S27), ROI (S28).
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
const GAP: TextRun[] = [] // intentional blank line (rendered as <a:p/>)

/** Fill a body placeholder; falsy rows are dropped, an explicit GAP stays blank. */
const fill = (zip: PizZip, slide: number, paras: Array<TextRun[] | null | undefined>) =>
  fillBodyPlaceholder(zip, slide, paras.filter((p): p is TextRun[] => p != null))

/** S21/22/23 Fleet Engine math as TEXT — the fallback when the canvas charts
 *  (engineChart.ts) aren't available (e.g. non-DOM export context). */
export function fillFleetEngineText(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, settings } = model
  const nm = (id: string) => names[id] ?? id

  // S21 — Raw fleet: demand per group (Σ fractional vehicles → ceil = base).
  fill(zip, ROM_SLIDE.rawFleet, [
    label('Raw fleet — demand before charging & buffer'),
    ...fleet.groups.map(g =>
      line(`${nm(g.vehicleId)}:  raw ${g.groupRaw.toFixed(2)}  →  base ⌈ ⌉ = ${g.baseFleet}`, 1600)),
    GAP,
    line(`Total base fleet: ${fleet.totalBaseFleet} vehicle${fleet.totalBaseFleet === 1 ? '' : 's'}`, 2000),
    note(`Base = ⌈ Σ flow demand ⌉ per chassis, at ${settings.dailyOpHr} operating hr/day.`),
  ])

  // S22 — Charging: extra vehicles so charge downtime doesn't starve the line.
  fill(zip, ROM_SLIDE.charging, [
    label(`Charging — ${settings.regime === 'overnight' ? 'overnight' : 'continuous'} regime`),
    ...fleet.groups.map(g => {
      const c = g.charging
      const avail = c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`
      return line(`${nm(g.vehicleId)}:  availability ${avail}  →  +${c.chargingDelta} for charging`, 1600)
    }),
    GAP,
    line(`Charging adds ${fleet.totalChargingDelta} vehicle${fleet.totalChargingDelta === 1 ? '' : 's'}  →  ${fleet.totalBaseFleet + fleet.totalChargingDelta} with charging`, 2000),
  ])

  // S23 — Buffer: spare capacity applied after base + charging.
  fill(zip, ROM_SLIDE.buffer, [
    label('Buffer — spare capacity for variability & maintenance'),
    line(`Buffer: ${Math.round(settings.bufferPct * 100)}%`, 1600),
    line(`(${fleet.totalBaseFleet} base + ${fleet.totalChargingDelta} charging) × ${(1 + settings.bufferPct).toFixed(2)}  →  ⌈ ⌉`, 1600),
    GAP,
    hero(`${fleet.totalFleetSold} vehicles`),
    note('Fleet sold = ⌈ (base + charging) × (1 + buffer) ⌉ per chassis.'),
  ])
}

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
