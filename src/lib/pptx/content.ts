// S25 Financials — the money claim as the slide title, three headline tiles
// (investment · labor offset · payback), and an honesty footnote. Everything
// else the old KPI grid carried moves to the cost-detail appendix slide
// (fillCostDetail). One idea per slide; the deck is not a dashboard.
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { ROM_SLIDE } from './sections'
import { frame, setTitle, usd, usdRange, priced, type TileSpec } from './layout'
import { financialsTitle, FALLBACK_TITLE } from './takeaways'
import type { TableCell } from './ooxml'

/** S25 — ROM investment · labor offset/yr · simple payback, nothing else. */
export function fillFinancials(zip: PizZip, model: FleetModel): void {
  const { rom } = model
  const blocked = model.gate.blocked
  setTitle(zip, ROM_SLIDE.financials, financialsTitle(model), FALLBACK_TITLE.financials)
  const f = frame(zip, ROM_SLIDE.financials)
  f.eyebrow('05 — FINANCIALS')
  f.rule()
  const payback = rom.payback.paybackYears
  const tiles: TileSpec[] = [
    { value: priced(blocked, usdRange(rom.pricing.totalMin, rom.pricing.totalMax)), label: 'ROM INVESTMENT', accent: true, figSz: 2400 },
    // Labor offset is CAPEX-free, so it survives the gate.
    { value: rom.payback.annualLaborOffset > 0 ? usd(rom.payback.annualLaborOffset) : '—', label: 'LABOR OFFSET / YR', figSz: 2400 },
    { value: priced(blocked, payback == null ? '—' : payback.toFixed(1)), unit: blocked ? undefined : 'yr', label: 'SIMPLE PAYBACK' },
  ]
  f.tiles(tiles, { h: 1500000 })
  f.caption(blocked
    ? `Not priced — ${model.gate.blockedLabels.join(' and ')} need the intake answers listed in the appendix`
    : 'ROM estimate pending final configuration · cost detail in appendix')
}

/** Appendix — the financial figures relocated off S25/S26: net benefit, OPEX,
 *  TCO at service life, cost per move, energy. */
export function fillCostDetail(
  zip: PizZip, slide: number, model: FleetModel, serviceLifeYears: number,
): void {
  const { rom, flows, settings, costs } = model
  const blocked = model.gate.blocked
  const throughput = Math.round(flows.reduce((s, fl) => s + (fl.thruPerHr || 0), 0))
  const opex = rom.opex.annualOpex
  const tcoAtLife = rom.pricing.totalMid + opex * serviceLifeYears
  const opDays = Math.max(1, costs.operatingDaysPerYear)
  const lifetimeMoves = throughput * settings.dailyOpHr * costs.operatingDaysPerYear * serviceLifeYears
  const costPerMove = lifetimeMoves > 0 ? tcoAtLife / lifetimeMoves : null
  const energyPerDay = rom.opex.annualEnergyKwh / opDays

  const rows: TableCell[][] = [[{ t: 'Metric' }, { t: 'Value', align: 'r' }]]
  const add = (k: string, v: string) => rows.push([{ t: k, bold: true }, { t: v, align: 'r' }])
  // Net benefit and OPEX are withheld too: annualMaintenance = capexMid x pct,
  // so printing them lets a reader divide the withheld CAPEX back out.
  add('Net benefit / yr', priced(blocked, usd(rom.payback.annualLaborOffset - opex)))
  add('Annual operating cost', priced(blocked, usd(opex)))
  add(`TCO @ ${serviceLifeYears} yr`, priced(blocked, usd(tcoAtLife)))
  add('Cost per move', priced(blocked, costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`))
  add('Energy', `${Math.round(energyPerDay)} kWh/day`)
  if (blocked) add('Still needed on Step 1', model.gate.missingAll.join(', '))

  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — COST DETAIL')
  f.table([5000000, 5820400], rows, { rowH: 360000 })
  f.caption(blocked
    ? 'Not priced — an unanswered complexity input scores as "simple", so quoting now would under-price the job'
    : 'Labor offset is gross of operating cost; ROM pricing is a range pending final configuration')
}
