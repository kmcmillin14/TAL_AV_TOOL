// Fills the ROM KPI slides — S25 (headline) and S26 (fleet mix) — with native
// engineering metric tiles (big figure + accent rule + spaced caps label) drawn
// into the slide body, mirroring the Step-4 ROM dashboard's hero tiles. The
// template's empty body placeholder is removed first so nothing ghosts behind
// the tiles. (Investment S27 and ROI S28 are native tables/charts — see tables.ts;
// Fleet Engine S21–23 likewise.)
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import {
  appendShapesToSlide, removeBodyPlaceholder, nextShapeId, metricTile, textBox,
  TAL_RED,
} from './ooxml'
import { ROM_SLIDE } from './sections'

const GRAY = '8A8A8E'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
const BODY = { x: 685800, y: 1828800, cx: 10820400 }
const EYEBROW_H = 360000   // section label height
const TILE_GAP = 200000

interface Tile { value: string; unit?: string; label: string; accent?: boolean }

/** Section eyebrow ("Fleet KPIs" etc.) as a spaced red caps label above the tiles. */
function eyebrow(zip: PizZip, slide: number, text: string): void {
  appendShapesToSlide(zip, slide, textBox({
    id: nextShapeId(zip, slide), x: BODY.x, y: BODY.y, cx: BODY.cx, cy: EYEBROW_H,
    paras: [[{ t: text, bold: true, sz: 1400, color: TAL_RED }]],
  }))
}

/** Lay tiles out in a `cols`-wide grid starting at `y`; returns the bottom y. */
function tileGrid(zip: PizZip, slide: number, tiles: Tile[], y: number, cols: number, tileH: number): number {
  const tileW = Math.round((BODY.cx - (cols - 1) * TILE_GAP) / cols)
  let id = nextShapeId(zip, slide)
  const shapes = tiles.map((t, i) => {
    const r = Math.floor(i / cols), c = i % cols
    const xml = metricTile({
      id, x: BODY.x + c * (tileW + TILE_GAP), y: y + r * (tileH + TILE_GAP),
      cx: tileW, cy: tileH, value: t.value, unit: t.unit, label: t.label, accent: t.accent,
    })
    id += 2   // metricTile consumes id and id+1 (card + accent rule)
    return xml
  }).join('')
  appendShapesToSlide(zip, slide, shapes)
  const rows = Math.ceil(tiles.length / cols)
  return y + rows * tileH + (rows - 1) * TILE_GAP
}

/** A muted caption strip (the build-up arithmetic) below the tiles. */
function caption(zip: PizZip, slide: number, text: string, y: number): void {
  appendShapesToSlide(zip, slide, textBox({
    id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy: 460000,
    paras: [[{ t: text, sz: 1300, color: GRAY }]],
  }))
}

/** S25/S26 KPI slides (headline + fleet mix) as engineering metric tiles. */
export function fillKpis(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, flows } = model
  const nm = (id: string) => names[id] ?? id
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  // ── S25 — headline KPIs ──────────────────────────────────────────────────
  removeBodyPlaceholder(zip, ROM_SLIDE.kpisHeadline)
  eyebrow(zip, ROM_SLIDE.kpisHeadline, 'FLEET KPIS')
  const headline: Tile[] = [
    { value: String(fleet.totalFleetSold), label: 'TOTAL FLEET', accent: true },
    { value: String(fleet.groups.length), label: 'VEHICLE TYPES' },
    { value: String(flows.length), label: 'FLOWS' },
    { value: String(throughput), unit: '/ hr', label: 'THROUGHPUT' },
  ]
  const bottom = tileGrid(zip, ROM_SLIDE.kpisHeadline, headline, BODY.y + EYEBROW_H + 120000, 4, 1640000)
  caption(zip, ROM_SLIDE.kpisHeadline,
    `Base ${fleet.totalBaseFleet}  +  charging ${fleet.totalChargingDelta}  →  buffered ${fleet.totalFleetSold}`,
    bottom + 200000)

  // ── S26 — fleet mix ──────────────────────────────────────────────────────
  removeBodyPlaceholder(zip, ROM_SLIDE.kpisMix)
  eyebrow(zip, ROM_SLIDE.kpisMix, 'FLEET MIX')
  const mix: Tile[] = fleet.groups.map(g => ({
    value: String(g.fleetSold),
    unit: g.fleetSold === 1 ? 'unit' : 'units',
    label: nm(g.vehicleId).toUpperCase(),
  }))
  if (mix.length === 0) mix.push({ value: '—', label: 'NO FLEET SIZED YET (STEP 3)' })
  const cols = mix.length <= 2 ? mix.length : 3
  tileGrid(zip, ROM_SLIDE.kpisMix, mix, BODY.y + EYEBROW_H + 120000, cols, 1500000)
}
