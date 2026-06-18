// Renders the ROM payback curve — cumulative cash flow (−CAPEX at year 0, +annual
// labor offset each year) crossing zero at break-even — to a PNG for S28. Reuses
// the pure paybackSeries from the calc engine. Browser-only; returns null in a
// non-DOM context so the exporter falls back to the ROI metrics table alone.
import type { RomSummary } from '@/src/calc/rom'
import { paybackSeries } from '@/src/calc/romCharts'
import { money } from '@/src/lib/vehicleDisplay'
import { newCanvas, toPngBytes } from './canvas'

const W = 1700, H = 720
const ML = 200, MR = 70, MT = 70, MB = 96   // plot margins
const RED = '#EB0A1E', INK = '#2B2B2B', GRID = '#E4E4E7', GRAY = '#71717a'

/** Service-life window for the curve: break-even + 2 yr, clamped to 8–15 (10 when
 *  there's no payback). Keeps the crossover visible without a runaway axis. */
function lifeYearsFor(paybackYears: number | null): number {
  return paybackYears != null ? Math.min(15, Math.max(8, Math.ceil(paybackYears) + 2)) : 10
}

/** PNG of the cumulative-cash-flow payback curve, or null (no DOM / no fleet). */
export function renderPaybackChartPng(rom: RomSummary): Uint8Array | null {
  if (rom.pricing.totalMid <= 0) return null
  const { points, breakEvenYear } = paybackSeries(rom, lifeYearsFor(rom.payback.paybackYears))
  if (points.length < 2) return null

  const cv = newCanvas(W, H)
  if (!cv) return null
  const { canvas, ctx } = cv
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)

  const x0 = ML, x1 = W - MR, y0 = MT, y1 = H - MB
  const years = points[points.length - 1].year
  const vals = points.map(p => p.cumulative)
  const vMax = Math.max(0, ...vals), vMin = Math.min(0, ...vals)
  const pad = (vMax - vMin) * 0.08 || 1
  const lo = vMin - pad, hi = vMax + pad
  const px = (yr: number) => x0 + (yr / years) * (x1 - x0)
  const py = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0)

  ctx.textBaseline = 'middle'

  // Title.
  ctx.font = "800 26px 'Toyota Type',-apple-system,sans-serif"; ctx.fillStyle = INK; ctx.textAlign = 'left'
  ctx.fillText('Cumulative cash flow — simple payback', x0, 36)

  // Y gridlines + $ labels (5 steps).
  ctx.font = "600 18px 'JetBrains Mono',ui-monospace,monospace"; ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4
    const y = py(v)
    ctx.strokeStyle = GRID; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    ctx.fillStyle = GRAY
    ctx.fillText((v < 0 ? '-' : '') + money(Math.abs(v)), x0 - 16, y)
  }

  // Zero line (emphasized).
  ctx.strokeStyle = '#B8B8C0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke()

  // X labels (years).
  ctx.font = "600 18px 'JetBrains Mono',ui-monospace,monospace"; ctx.textAlign = 'center'; ctx.fillStyle = GRAY
  for (let yr = 0; yr <= years; yr++) ctx.fillText(`Yr ${yr}`, px(yr), y1 + 30)

  // Break-even marker.
  if (breakEvenYear != null && breakEvenYear <= years) {
    const bx = px(breakEvenYear)
    ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
    ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, y1); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = RED; ctx.font = "800 22px 'Toyota Type',-apple-system,sans-serif"; ctx.textAlign = 'center'
    ctx.fillText(`Payback ${breakEvenYear.toFixed(1)} yr`, bx, y0 - 4 < 24 ? y0 + 16 : y0 - 8)
  } else {
    ctx.fillStyle = GRAY; ctx.font = "600 20px 'Toyota Type',-apple-system,sans-serif"; ctx.textAlign = 'left'
    ctx.fillText('No payback in service life — add operators displaced (Step 4)', x0 + 12, y0 + 18)
  }

  // Cumulative line + point markers.
  ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.beginPath()
  points.forEach((p, i) => (i ? ctx.lineTo(px(p.year), py(p.cumulative)) : ctx.moveTo(px(p.year), py(p.cumulative))))
  ctx.stroke()
  ctx.fillStyle = RED
  for (const p of points) { ctx.beginPath(); ctx.arc(px(p.year), py(p.cumulative), 5, 0, Math.PI * 2); ctx.fill() }

  return toPngBytes(canvas)
}
