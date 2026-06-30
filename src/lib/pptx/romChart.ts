// Renders the ROM payback curve — cumulative cash flow (−CAPEX at year 0, +annual
// labor offset each year) crossing zero at break-even — to a PNG for S28. Reuses
// the pure paybackSeries from the calc engine. Browser-only; returns null in a
// non-DOM context so the exporter falls back to the ROI metrics table alone.
import type { RomSummary } from '@/src/calc/rom'
import { paybackSeries } from '@/src/calc/romCharts'
import { money } from '@/src/lib/vehicleDisplay'
import { newCanvas, roundRect, toPngBytes } from './canvas'

const W = 1700, H = 720
const ML = 200, MR = 120, MT = 70, MB = 96   // plot margins (extra right for end label)
const RED = '#EB0A1E', INK = '#2B2B2B', GRID = '#E4E4E7', GRAY = '#71717a'
const AXIS = '#C9CDD2'                         // axis rules (darker than gridlines)
const LOSS_FILL = 'rgba(235,10,30,0.08)'       // area below zero — still paying back
const GAIN_FILL = 'rgba(22,163,74,0.10)'       // area above zero — net positive
const GAIN_INK = '#16a34a'

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

  // Area between the curve and the zero baseline — two-tone (loss below / gain
  // above), so the break-even crossover reads at a glance. Drawn first, under
  // the gridlines and curve.
  const areaPath = () => {
    ctx.beginPath()
    points.forEach((p, i) => (i ? ctx.lineTo(px(p.year), py(p.cumulative)) : ctx.moveTo(px(p.year), py(p.cumulative))))
    ctx.lineTo(px(years), py(0)); ctx.lineTo(px(0), py(0)); ctx.closePath()
  }
  for (const [region, fill] of [['gain', GAIN_FILL], ['loss', LOSS_FILL]] as const) {
    ctx.save(); ctx.beginPath()
    if (region === 'gain') ctx.rect(x0, y0, x1 - x0, py(0) - y0)
    else ctx.rect(x0, py(0), x1 - x0, y1 - py(0))
    ctx.clip(); areaPath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore()
  }

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

  // Faint vertical year gridlines.
  ctx.strokeStyle = GRID; ctx.lineWidth = 1
  for (let yr = 0; yr <= years; yr++) {
    ctx.beginPath(); ctx.moveTo(px(yr), y0); ctx.lineTo(px(yr), y1); ctx.stroke()
  }

  // Zero line (emphasized) + L-shaped axis rules.
  ctx.strokeStyle = '#B8B8C0'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke()
  ctx.strokeStyle = AXIS; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke()

  // X labels (years).
  ctx.font = "600 18px 'JetBrains Mono',ui-monospace,monospace"; ctx.textAlign = 'center'; ctx.fillStyle = GRAY
  for (let yr = 0; yr <= years; yr++) ctx.fillText(`Yr ${yr}`, px(yr), y1 + 30)

  // Break-even marker + a rounded callout chip on the crossover.
  if (breakEvenYear != null && breakEvenYear <= years) {
    const bx = px(breakEvenYear)
    ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([8, 6])
    ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, py(0)); ctx.stroke()
    ctx.setLineDash([])
    // crossover dot on the zero line
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(bx, py(0), 7, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.stroke()
    // chip
    const text = `Payback ${breakEvenYear.toFixed(1)} yr`
    ctx.font = "800 22px 'Toyota Type',-apple-system,sans-serif"
    const tw = ctx.measureText(text).width, padX = 16, chipH = 38
    const chipY = y0 - 6 < chipH ? y0 + 8 : y0 - chipH - 6
    let chipX = bx - (tw / 2 + padX)
    chipX = Math.max(x0, Math.min(chipX, x1 - (tw + 2 * padX)))
    roundRect(ctx, chipX, chipY, tw + 2 * padX, chipH, 8)
    ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.fillText(text, chipX + (tw / 2 + padX), chipY + chipH / 2)
  } else {
    ctx.fillStyle = GRAY; ctx.font = "600 20px 'Toyota Type',-apple-system,sans-serif"; ctx.textAlign = 'left'
    ctx.fillText('No payback in service life — add operators displaced (Step 4)', x0 + 12, y0 + 18)
  }

  // Cumulative line + point markers.
  ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.beginPath()
  points.forEach((p, i) => (i ? ctx.lineTo(px(p.year), py(p.cumulative)) : ctx.moveTo(px(p.year), py(p.cumulative))))
  ctx.stroke()
  ctx.fillStyle = RED
  for (const p of points) { ctx.beginPath(); ctx.arc(px(p.year), py(p.cumulative), 5, 0, Math.PI * 2); ctx.fill() }

  // Final cumulative value label at the right end of the curve.
  const last = points[points.length - 1]
  const positive = last.cumulative >= 0
  ctx.font = "800 20px 'JetBrains Mono',ui-monospace,monospace"
  ctx.fillStyle = positive ? GAIN_INK : RED; ctx.textAlign = 'right'
  ctx.fillText((positive ? '+' : '-') + money(Math.abs(last.cumulative)), x1 - 4, py(last.cumulative) - 18)

  return toPngBytes(canvas)
}
