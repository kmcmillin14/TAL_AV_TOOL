// Auto-generated headline takeaway sentences for the money slides (S25–S28).
// Pure FleetModel → TextRun[] builders: key figures render as bold TAL-red runs
// inside an ink sentence. A figure that isn't computable drops its clause; when
// nothing meaningful is available the builder returns null and the slide renders
// without the zone — no placeholder text ever reaches a customer deck.
import type { FleetModel } from '@/src/lib/fleetModel'
import { paybackSeries } from '@/src/calc/romCharts'
import { TAL_RED, type TextRun } from './ooxml'
import { usd, usdRange, pct } from './layout'

const SZ = 2100
const ink = (t: string): TextRun => ({ t, sz: SZ })
const key = (t: string): TextRun => ({ t, sz: SZ, bold: true, color: TAL_RED })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** S25 — "A $980K – $1.2M investment returns $520K/yr net — payback in 2.1 years." */
export function financialsTakeaway(model: FleetModel): TextRun[] | null {
  const { rom } = model
  if (rom.pricing.totalMid <= 0) return null
  const runs = [ink('A '), key(usdRange(rom.pricing.totalMin, rom.pricing.totalMax)), ink(' investment')]
  const net = rom.payback.annualLaborOffset - rom.opex.annualOpex
  if (net > 0) runs.push(ink(' returns '), key(`${usd(net)}/yr`), ink(' net'))
  if (rom.payback.paybackYears != null) {
    runs.push(ink(' — payback in '), key(`${rom.payback.paybackYears.toFixed(1)} years`))
  }
  runs.push(ink('.'))
  return runs
}

/** S26 — "13 vehicles across 2 types handle 221 moves/hr at 77% utilization." */
export function fleetFlowTakeaway(model: FleetModel): TextRun[] | null {
  const { fleet, flows } = model
  const sold = fleet.totalFleetSold
  if (sold <= 0) return null
  const thru = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const totalRaw = fleet.groups.reduce((s, g) => s + g.groupRaw, 0)
  const runs = [
    key(plural(sold, 'vehicle')),
    ink(` across ${plural(fleet.groups.length, 'type')} handle${sold === 1 ? 's' : ''} `),
    key(`${thru} moves/hr`),
  ]
  if (totalRaw > 0) runs.push(ink(' at '), key(pct(totalRaw / sold)), ink(' utilization'))
  runs.push(ink('.'))
  return runs
}

/** S27 — "Total ROM investment: $980K – $1.2M for 13 vehicles." */
export function investmentTakeaway(model: FleetModel): TextRun[] | null {
  const { rom, fleet } = model
  if (rom.pricing.lines.length === 0 || rom.pricing.totalMid <= 0) return null
  return [
    ink('Total ROM investment: '),
    key(usdRange(rom.pricing.totalMin, rom.pricing.totalMax)),
    ink(' for '), key(plural(fleet.totalFleetSold, 'vehicle')), ink('.'),
  ]
}

/** S28 — "Breaks even in 2.1 years — +$3.4M cumulative over 10 years." */
export function roiTakeaway(model: FleetModel, serviceLifeYears: number): TextRun[] | null {
  const payback = model.rom.payback.paybackYears
  if (payback == null) return null
  const runs = [ink('Breaks even in '), key(`${payback.toFixed(1)} years`)]
  const { points } = paybackSeries(model.rom, serviceLifeYears)
  const last = points[points.length - 1]?.cumulative
  if (last != null && last > 0) {
    runs.push(ink(' — '), key(`+${usd(last)}`), ink(` cumulative over ${serviceLifeYears} years`))
  }
  runs.push(ink('.'))
  return runs
}
