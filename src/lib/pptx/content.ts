// Fills the ROM KPI slides — S25 (headline) and S26 (fleet mix) — by writing
// into the template's existing body Content Placeholder (<p:ph idx="1"/>) so
// content inherits the slide's branded position/style. (Investment S27 and ROI
// S28 are native tables/charts — see tables.ts; Fleet Engine S21–23 likewise.)
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { fillBodyPlaceholder, type TextRun } from './ooxml'
import { ROM_SLIDE } from './sections'

const GRAY = '8A8A8E'

const label = (t: string): TextRun[] => [{ t, sz: 1400, color: GRAY }]
const line = (t: string, sz = 1800): TextRun[] => [{ t, sz }]

/** S25/S26 KPI slides (headline + fleet mix). */
export function fillKpis(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, flows } = model
  const nm = (id: string) => names[id] ?? id
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const put = (slide: number, paras: TextRun[][]) => fillBodyPlaceholder(zip, slide, paras)

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
}
