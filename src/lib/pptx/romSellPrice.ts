// src/lib/pptx/romSellPrice.ts — appendix slide for the internal ROM sell-price
// engine (Hardware + Integration + Software + Adders). Extends the existing
// template-fill pipeline (per-vehicle table, same frame() convention as
// fillCostDetail) rather than building a separate standalone deck — see
// docs/CHANGELOG.md (2026-09-09 compatibility review) for why. Pure rendering:
// all scoring/pricing is resolved once by src/lib/romSellPriceLine.ts, the
// same resolver the ROM Configuration step UI uses, so the two surfaces can't
// drift on a missing-romInputs vehicle, an override, or adders double-counting.
import type PizZip from 'pizzip'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import type { FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import type { PricingGate } from '@/src/lib/romComplexityFromProject'
import { frame, usd, NOT_PRICED } from './layout'
import { TAL_RED, type TableCell } from './ooxml'

const redCell = (t: string, align: TableCell['align'] = 'r'): TableCell => ({ t, align, fill: TAL_RED, color: 'FFFFFF', bold: true })

/** Appendix slide: Vehicle · Qty · Hardware · Integration · Software · Subtotal
 *  per assigned chassis, closed by one fleet-wide "Adders" row and a red TOTAL
 *  row (adders are project-wide, not per-vehicle — see fleetSellPrice.ts),
 *  plus a caption naming each vehicle's tiers. No-ops (renders nothing) when
 *  `lines` is empty — the caller is expected to only clone/keep this slide
 *  when {@link resolveAllRomSellPriceLines} returns a non-empty array. */
export function fillRomSellPriceAppendix(
  zip: PizZip,
  slide: number,
  lines: RomSellPriceLine[],
  fleetTotal: FleetSellPriceTotal,
  /** Omitted by callers that have no project context; a missing gate prices
   *  normally, matching the pre-gate behaviour. */
  gate?: PricingGate,
): void {
  if (lines.length === 0) return

  const rows: TableCell[][] = [[
    { t: 'Vehicle' }, { t: 'Qty', align: 'r' }, { t: 'Hardware', align: 'r' },
    { t: 'Integration', align: 'r' }, { t: 'Software', align: 'r' }, { t: 'Subtotal', align: 'r' },
  ]]
  // A blocked category prints $0, the same figure Step 4 shows — the column
  // stays a money column, and the caption carries the reason.
  const intOk = !gate || gate.integrationReady
  const swOk = !gate || gate.softwareReady
  for (const l of lines) {
    const { hardwareSellTotal, integrationSellTotal, softwareSellTotal, lineSubtotal } = l.pricing
    const subtotal = hardwareSellTotal
      + (intOk ? integrationSellTotal : 0)
      + (swOk ? softwareSellTotal : 0)
    rows.push([
      { t: l.vehicleName }, { t: String(l.qty), align: 'r' },
      { t: usd(hardwareSellTotal), align: 'r' },
      { t: usd(intOk ? integrationSellTotal : 0), align: 'r' },
      { t: usd(swOk ? softwareSellTotal : 0), align: 'r' },
      { t: usd(gate?.blocked ? subtotal : lineSubtotal), align: 'r' },
    ])
  }
  rows.push([
    { t: 'Adders (fleet-wide)' }, { t: '' }, { t: '' }, { t: '' }, { t: '' },
    { t: usd(fleetTotal.addersTotal), align: 'r' },
  ])
  rows.push([
    redCell(gate?.blocked ? 'HARDWARE SUBTOTAL' : 'TOTAL', 'l'),
    redCell(String(fleetTotal.totalQty)),
    redCell(usd(fleetTotal.hardwareTotal)),
    redCell(usd(intOk ? fleetTotal.integrationTotal : 0)),
    redCell(usd(swOk ? fleetTotal.softwareTotal : 0)),
    // No project total while a category is withheld — a total that quietly
    // omits professional services reads as the whole job.
    redCell(gate?.blocked ? NOT_PRICED : usd(fleetTotal.sellTotal)),
  ])

  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — ROM SELL PRICE')
  f.table([1900000, 700000, 1300000, 1300000, 1200000, 1400000], rows, { rowH: 340000 })
  const tierNote = lines
    .map(l => `${l.vehicleName}: Integration T${l.integrationResult.tier} · Software T${l.softwareResult.tier}`)
    .join(' · ')
  f.caption(gate?.blocked
    ? `Not priced — ${gate.blockedLabels.join(' and ')} show $0 until these are answered on Step 1: ${gate.missingAll.join(', ')}`
    : `ROM — budgetary estimate, placeholder pricing pending Kyle · ${tierNote}`)
}
