// Renders the Fleet Engine "result" panel — TOTAL FLEET number, the
// Raw + Charging × Buffer = Total build-up bar, demand KPIs, and the per-vehicle
// breakdown — as a PNG per stage (Raw S21 / Charging S22 / Buffer S23), styled to
// match the web app's engine-result panel (dark card, TAL red). Browser-only;
// returns null in non-DOM contexts so the exporter falls back to text slides.
import type { FleetModel } from '@/src/lib/fleetModel'
import { C, font, newCanvas, roundRect, toPngBytes } from './canvas'

const W = 1700, H = 920
const PAD = 70

export type EngineStage = 'raw' | 'charging' | 'buffer'

const STAGE_META: Record<EngineStage, { n: string; title: string; sub: string }> = {
  raw: { n: '01', title: 'Raw Fleet', sub: 'Flows → cycle time → raw demand, no multipliers' },
  charging: { n: '02', title: 'Charging', sub: 'Battery runtime adds vehicles when charging steals operating time' },
  buffer: { n: '03', title: 'Buffer', sub: 'Margin for maintenance, training, and demand spikes' },
}

interface Seg { key: EngineStage | 'total'; label: string; val: string }

function drawEyebrow(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color = C.textTertiary) {
  ctx.font = font(700, 18, true); ctx.fillStyle = color; ctx.textAlign = 'left'
  ctx.fillText(t.toUpperCase(), x, y)
}

/** The Raw + Charging × Buffer = Total build-up bar; `stage` (and Total) lit. */
function drawPipeline(ctx: CanvasRenderingContext2D, segs: Seg[], stage: EngineStage, x0: number, y: number) {
  const SW = 140, SH = 90, GAP = 40
  const ops = ['+', '×', '=']
  let x = x0
  segs.forEach((s, i) => {
    const isTotal = s.key === 'total'
    const lit = isTotal || s.key === stage
    roundRect(ctx, x, y, SW, SH, 12)
    ctx.fillStyle = isTotal && lit ? C.redSoft : C.surface2
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = isTotal ? C.red : lit ? C.border : C.border
    ctx.globalAlpha = lit ? 1 : 0.42
    ctx.stroke()
    ctx.font = font(700, 15, true); ctx.textAlign = 'center'
    ctx.fillStyle = isTotal ? C.red : C.textTertiary
    ctx.fillText(s.label, x + SW / 2, y + 26)
    ctx.font = font(800, 34, true)
    ctx.fillStyle = isTotal ? C.red : C.textPrimary
    ctx.fillText(s.val, x + SW / 2, y + 66)
    ctx.globalAlpha = 1
    if (i < ops.length) {
      ctx.font = font(400, 26, true); ctx.fillStyle = C.textDisabled
      ctx.fillText(ops[i], x + SW + GAP / 2, y + SH / 2 + 9)
    }
    x += SW + GAP
  })
}

function drawPanel(model: FleetModel, names: Record<string, string>, stage: EngineStage): Uint8Array | null {
  const cv = newCanvas(W, H)
  if (!cv) return null
  const { canvas, ctx } = cv
  const { fleet, settings, flows } = model
  const meta = STAGE_META[stage]
  const total = fleet.totalFleetSold
  const flowCount = flows.length
  const totalThru = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  // Card.
  const M = 24
  roundRect(ctx, M, M, W - 2 * M, H - 2 * M, 28)
  ctx.fillStyle = C.surface; ctx.fill()
  ctx.lineWidth = 2; ctx.strokeStyle = C.border; ctx.stroke()

  // Stage header.
  ctx.textAlign = 'left'
  ctx.font = font(800, 26, true); ctx.fillStyle = C.red
  ctx.fillText(`${meta.n}  ${meta.title.toUpperCase()}`, PAD, 112)
  ctx.font = font(400, 19); ctx.fillStyle = C.textTertiary
  ctx.fillText(meta.sub, PAD, 146)

  // Left: TOTAL FLEET number.
  drawEyebrow(ctx, 'Total fleet', PAD, 212)
  ctx.font = font(800, 78, true); ctx.fillStyle = C.red; ctx.textAlign = 'left'
  ctx.fillText(String(total), PAD, 296)
  const numW = ctx.measureText(String(total)).width
  ctx.font = font(700, 22, true); ctx.fillStyle = C.textTertiary
  ctx.fillText('VEHICLES', PAD + numW + 18, 296)

  // Build-up bar.
  const chg = fleet.totalChargingDelta
  drawPipeline(ctx, [
    { key: 'raw', label: 'RAW', val: String(fleet.totalBaseFleet) },
    { key: 'charging', label: 'CHARGING', val: chg > 0 ? `+${chg}` : '0' },
    { key: 'buffer', label: 'BUFFER', val: (1 + settings.bufferPct).toFixed(2) },
    { key: 'total', label: 'TOTAL', val: String(total) },
  ], stage, PAD, 360)

  // KPIs (demand driving the fleet).
  const kx = PAD
  ctx.fillStyle = C.border; ctx.fillRect(kx, 510, 680, 1)
  ctx.font = font(800, 40, true); ctx.fillStyle = C.textPrimary; ctx.textAlign = 'left'
  ctx.fillText(String(flowCount), kx, 588)
  ctx.fillText(String(totalThru), kx + 240, 588)
  drawEyebrow(ctx, flowCount === 1 ? 'Flow' : 'Flows', kx, 618)
  drawEyebrow(ctx, 'Moves / hour', kx + 240, 618)

  // Right: per-vehicle breakdown (raw → base).
  const rx = 880
  ctx.fillStyle = C.border; ctx.fillRect(rx - 40, 90, 1, H - 180)
  drawEyebrow(ctx, 'Fleet breakdown', rx, 130)
  let ry = 180
  const groups = fleet.groups.slice(0, 9)
  for (const g of groups) {
    ctx.fillStyle = C.red
    ctx.beginPath(); ctx.arc(rx + 7, ry - 6, 7, 0, Math.PI * 2); ctx.fill()
    ctx.font = font(600, 22); ctx.fillStyle = C.textPrimary; ctx.textAlign = 'left'
    const name = names[g.vehicleId] ?? g.vehicleId
    ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, rx + 28, ry)
    ctx.font = font(700, 21, true); ctx.textAlign = 'right'
    ctx.fillStyle = C.textTertiary
    ctx.fillText(`${g.groupRaw.toFixed(2)}  →  ${g.baseFleet}`, W - PAD, ry)
    ctx.fillStyle = C.border; ctx.fillRect(rx, ry + 18, W - PAD - rx, 1)
    ry += 56
  }
  if (fleet.groups.length > groups.length) {
    ctx.font = font(400, 18, true); ctx.fillStyle = C.textTertiary; ctx.textAlign = 'left'
    ctx.fillText(`+ ${fleet.groups.length - groups.length} more`, rx + 28, ry)
  }

  return toPngBytes(canvas)
}

/** One PNG per Fleet Engine stage, or null when unavailable (no DOM / no fleet). */
export function renderFleetEngineCharts(
  model: FleetModel, names: Record<string, string>,
): Record<EngineStage, Uint8Array> | null {
  if (typeof document === 'undefined' || model.fleet.groups.length === 0) return null
  const raw = drawPanel(model, names, 'raw')
  const charging = drawPanel(model, names, 'charging')
  const buffer = drawPanel(model, names, 'buffer')
  if (!raw || !charging || !buffer) return null
  return { raw, charging, buffer }
}
