// Fills the kept ROM step slides — Fleet Engine math (S21 Raw / S22 Charging /
// S23 Buffer), KPIs (S25/26), Investment (S27), ROI (S28) — by writing into the
// template's existing body Content Placeholder (<p:ph idx="1"/>), so the content
// inherits the slide's branded position/style instead of a free-floating box.
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { fillBodyPlaceholder, type TextRun } from './ooxml'

const GRAY = '8A8A8E'
const RED = 'accent1' // theme TAL red

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`

const label = (t: string): TextRun[] => [{ t, sz: 1400, color: GRAY }]
const hero = (t: string): TextRun[] => [{ t, sz: 3200, bold: true, color: RED }]
const line = (t: string, sz = 1800): TextRun[] => [{ t, sz }]
const note = (t: string): TextRun[] => [{ t, sz: 1200, color: GRAY }]
const GAP: TextRun[] = [] // intentional blank line (rendered as <a:p/>)

/** Fill S21–S28 with the project's fleet/ROM figures (only slides still present).
 *  Falsy rows (e.g. a conditional that resolved to undefined) are dropped; an
 *  explicit GAP row is kept as a blank line. */
export function fillRomContent(
  zip: PizZip,
  model: FleetModel,
  names: Record<string, string>,
): void {
  const { fleet, rom, flows, settings } = model
  const nm = (id: string) => names[id] ?? id
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join(' · ') || '—'
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const payback = rom.payback.paybackYears

  const put = (slide: number, paras: Array<TextRun[] | null | undefined>) =>
    fillBodyPlaceholder(zip, slide, paras.filter((p): p is TextRun[] => p != null))

  // ── Fleet Engine math (mirrors the Step 3/Fleet Engine waterfall) ──────────

  // S21 — Raw fleet: demand per group (Σ fractional vehicles → ceil = base).
  put(21, [
    label('Raw fleet — demand before charging & buffer'),
    ...fleet.groups.map(g =>
      line(`${nm(g.vehicleId)}:  raw ${g.groupRaw.toFixed(2)}  →  base ⌈ ⌉ = ${g.baseFleet}`, 1600)),
    GAP,
    line(`Total base fleet: ${fleet.totalBaseFleet} vehicle${fleet.totalBaseFleet === 1 ? '' : 's'}`, 2000),
    note(`Base = ⌈ Σ flow demand ⌉ per chassis, at ${settings.dailyOpHr} operating hr/day.`),
  ])

  // S22 — Charging: extra vehicles so charge downtime doesn't starve the line.
  put(22, [
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
  put(23, [
    label('Buffer — spare capacity for variability & maintenance'),
    line(`Buffer: ${Math.round(settings.bufferPct * 100)}%`, 1600),
    line(`(${fleet.totalBaseFleet} base + ${fleet.totalChargingDelta} charging) × ${(1 + settings.bufferPct).toFixed(2)}  →  ⌈ ⌉`, 1600),
    GAP,
    hero(`${fleet.totalFleetSold} vehicles`),
    note('Fleet sold = ⌈ (base + charging) × (1 + buffer) ⌉ per chassis.'),
  ])

  // ── ROM money slides ───────────────────────────────────────────────────────

  // S25 — KPIs (headline)
  put(25, [
    label('Fleet KPIs'),
    line(`${fleet.totalFleetSold} vehicles  ·  ${flows.length} flow${flows.length === 1 ? '' : 's'}  ·  ${throughput} moves/hr`, 2200),
    line(`Base ${fleet.totalBaseFleet}  +  charging ${fleet.totalChargingDelta}  →  buffered ${fleet.totalFleetSold}`, 1600),
  ])

  // S26 — KPIs (fleet mix breakdown)
  put(26, [
    label('Fleet mix'),
    ...fleet.groups.map(g => line(`${nm(g.vehicleId)} — ${g.fleetSold} vehicle${g.fleetSold === 1 ? '' : 's'}`, 1600)),
  ])

  // S27 — Investment Summary (CAPEX)
  put(27, [
    label('System CAPEX — budgetary range'),
    hero(`${usd(rom.pricing.totalMin)} – ${usd(rom.pricing.totalMax)}`),
    line(`Total fleet: ${fleet.totalFleetSold} vehicles`),
    line(`Mix: ${mix}`, 1600),
    note('Budgetary ROM — pricing is a range, not a quote.'),
  ])

  // S28 — ROI / payback
  put(28, [
    label('Simple payback'),
    hero(payback == null ? '—' : `${payback.toFixed(1)} years`),
    line(`Annual labor offset: ${usd(rom.payback.annualLaborOffset)}`),
    line(`Annual operating cost: ${usd(rom.opex.annualOpex)}`, 1600),
    payback == null
      ? note('Add operators displaced (Step 4) to compute payback.')
      : null,
  ])
}
