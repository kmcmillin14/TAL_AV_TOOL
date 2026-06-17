// Injects editable native text into the kept ROM "money" slides (KPIs S25/26,
// Investment S27, ROI S28) of the branded deck. Pure OOXML authoring — content
// lives in code, the template stays a clean branded shell.
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { appendShapesToSlide, textBox, nextShapeId, type TextRun } from './ooxml'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
const BODY = { x: 685800, y: 1828800, cx: 10820400, cy: 4114800 }
const GRAY = '8A8A8E'
const RED = 'accent1' // theme TAL red

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`

const label = (t: string): TextRun[] => [{ t, sz: 1400, color: GRAY }]
const hero = (t: string): TextRun[] => [{ t, sz: 3200, bold: true, color: RED }]
const line = (t: string, sz = 1800): TextRun[] => [{ t, sz }]

/** Fill S25–S28 with the project's ROM figures (only slides still present). */
export function fillRomContent(
  zip: PizZip,
  model: FleetModel,
  names: Record<string, string>,
): void {
  const { fleet, rom, flows } = model
  const nm = (id: string) => names[id] ?? id
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join(' · ') || '—'
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const payback = rom.payback.paybackYears

  const put = (slide: number, paras: TextRun[][]) =>
    appendShapesToSlide(zip, slide, textBox({ id: nextShapeId(zip, slide), ...BODY, paras }))

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
    [{ t: 'Budgetary ROM — pricing is a range, not a quote.', sz: 1200, color: GRAY }],
  ])

  // S28 — ROI / payback
  put(28, [
    label('Simple payback'),
    hero(payback == null ? '—' : `${payback.toFixed(1)} years`),
    line(`Annual labor offset: ${usd(rom.payback.annualLaborOffset)}`),
    line(`Annual operating cost: ${usd(rom.opex.annualOpex)}`, 1600),
    payback == null
      ? [{ t: 'Add operators displaced (Step 4) to compute payback.', sz: 1200, color: GRAY }]
      : [],
  ])
}
