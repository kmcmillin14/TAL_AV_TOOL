// src/lib/pptx/romSellPrice.ts — appendix slide for the internal ROM sell-price
// engine (Hardware + Integration + Software + Adders). Extends the existing
// template-fill pipeline (per-vehicle table, same frame() convention as
// fillCostDetail) rather than building a separate standalone deck — see
// docs/CHANGELOG.md (2026-09-09 compatibility review) for why. Pure rendering:
// all scoring/pricing is resolved once by src/lib/romSellPriceLine.ts, the
// same resolver the Step 4 UI (RomSellPriceCell.tsx) uses, so the two
// surfaces can't drift on a missing-romInputs vehicle or an override.
import type PizZip from 'pizzip'
import type { RomSellPriceLine } from '@/src/lib/romSellPriceLine'
import { frame, usd } from './layout'
import { TAL_RED, type TableCell } from './ooxml'

const redCell = (t: string, align: TableCell['align'] = 'r'): TableCell => ({ t, align, fill: TAL_RED, color: 'FFFFFF', bold: true })

/** Appendix slide: Vehicle · Qty · Hardware · Integration · Software · Adders ·
 *  Total, closed by a TOTAL row, plus a caption naming each vehicle's tiers.
 *  No-ops (renders nothing) when no line has configured pricing — the caller
 *  is expected to only clone/keep this slide when {@link buildRomSellPriceLines}
 *  returns a non-empty array. */
export function fillRomSellPriceAppendix(
  zip: PizZip,
  slide: number,
  lines: RomSellPriceLine[]
): void {
  if (lines.length === 0) return

  const rows: TableCell[][] = [[
    { t: 'Vehicle' }, { t: 'Qty', align: 'r' }, { t: 'Hardware', align: 'r' },
    { t: 'Integration', align: 'r' }, { t: 'Software', align: 'r' },
    { t: 'Adders', align: 'r' }, { t: 'Total', align: 'r' },
  ]]
  const totals = { qty: 0, hardware: 0, integration: 0, software: 0, adders: 0, total: 0 }
  for (const l of lines) {
    const { hardwareSellTotal, integrationSellTotal, softwareSellTotal, addersTotal, sellTotal } = l.pricing
    rows.push([
      { t: l.vehicleName }, { t: String(l.qty), align: 'r' },
      { t: usd(hardwareSellTotal), align: 'r' }, { t: usd(integrationSellTotal), align: 'r' },
      { t: usd(softwareSellTotal), align: 'r' }, { t: usd(addersTotal), align: 'r' },
      { t: usd(sellTotal), align: 'r' },
    ])
    totals.qty += l.qty
    totals.hardware += hardwareSellTotal
    totals.integration += integrationSellTotal
    totals.software += softwareSellTotal
    totals.adders += addersTotal
    totals.total += sellTotal
  }
  rows.push([
    redCell('TOTAL', 'l'),
    redCell(String(totals.qty)),
    redCell(usd(totals.hardware)),
    redCell(usd(totals.integration)),
    redCell(usd(totals.software)),
    redCell(usd(totals.adders)),
    redCell(usd(totals.total)),
  ])

  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — ROM SELL PRICE')
  f.table([1900000, 700000, 1300000, 1300000, 1200000, 1100000, 1300000], rows, { rowH: 340000 })
  const tierNote = lines
    .map(l => `${l.vehicleName}: Integration T${l.integrationResult.tier} · Software T${l.softwareResult.tier}`)
    .join(' · ')
  f.caption(`ROM — budgetary estimate, placeholder pricing pending Kyle · ${tierNote}`)
}
