// Shared slide grammar for the branded ROM deck. Every filled data slide
// composes the same anatomy — title(claim via setSlideTitle) → eyebrow → rule
// → proof (tiles / image / table) → caption — through a y-cursor frame, so
// zone order and spacing are identical on every slide by construction. Pure
// zip/XML edits.
import type PizZip from 'pizzip'
import {
  appendShapesToSlide, removeBodyPlaceholder, removeStepLabel, nextShapeId,
  metricTile, textBox,
  table as tableShape, addImage, containRect, pngSize, TAL_RED,
  rect, setSlideTitle,
  type TableCell, type TableBand,
} from './ooxml'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
export const BODY = { x: 685800, y: 1828800, cx: 10820400, cy: 4114800 }
export const GAP = 200000        // shared inter-zone / inter-tile gap
export const ROW_H = 400000      // default table row height (PowerPoint grows rows to fit text)
export const GRAY = '8A8A8E'     // muted label / caption ink

const EYEBROW_H = 360000
const RULE_W = 600000     // short brand rule under the eyebrow (~0.63")
const RULE_H = 45720
const CAPTION_LINE_H = 330000
// Content may run slightly past BODY.cy into the bottom margin (pre-existing
// behavior); warn only past the slide-safe limit above the footer.
const MAX_Y = BODY.y + 4800000

// Compact USD (mirrors RomKpis.usd): $1.02M / $367K / $42.
// Negatives format as -$500K (sign before the dollar sign).
export const usd = (n: number): string =>
  n < 0 ? `-${usd(-n)}`
  : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`
export const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`
export const pct = (x: number) => `${Math.round(x * 100)}%`

export interface TileSpec {
  value: string; unit?: string; label: string
  barColor?: string; accent?: boolean; figSz?: number; compact?: boolean
  desc?: string
}

export interface Frame {
  readonly y: number
  eyebrow(text: string): void
  rule(): void
  /** Advance the cursor by h + GAP (same rhythm as every other zone). */
  skip(h: number): void
  tiles(specs: TileSpec[], opts?: { cols?: number; h?: number }): void
  image(png: Uint8Array, maxH: number): void
  table(colW: number[], rows: TableCell[][],
    opts?: { bands?: TableBand[]; center?: boolean; rowH?: number }): void
  caption(lines: string | string[]): void
}

/** A y-cursor over the slide body. Each method appends its zone at the cursor
 *  and advances by the zone height + GAP. All methods no-op when the slide was
 *  removed by the section picker (the append helpers already guard). */
export function frame(zip: PizZip, slide: number): Frame {
  removeBodyPlaceholder(zip, slide)
  removeStepLabel(zip, slide)
  let y = BODY.y
  const advance = (h: number): void => {
    y += h + GAP
    if (process.env.NODE_ENV !== 'production' && y - GAP > MAX_Y) {
      console.warn(`pptx frame: slide ${slide} content runs past the safe body bottom`)
    }
  }
  return {
    get y() { return y },
    eyebrow(text) {
      appendShapesToSlide(zip, slide, textBox({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy: EYEBROW_H,
        paras: [[{ t: text, bold: true, sz: 1400, color: TAL_RED }]],
      }))
      advance(EYEBROW_H)
    },
    rule() {
      appendShapesToSlide(zip, slide, rect({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: RULE_W, cy: RULE_H, color: TAL_RED,
      }))
      advance(RULE_H)
    },
    skip(h) { advance(h) },
    tiles(specs, opts = {}) {
      if (specs.length === 0) return
      const cols = opts.cols ?? specs.length
      const h = opts.h ?? 1300000
      const tileW = Math.round((BODY.cx - (cols - 1) * GAP) / cols)
      let id = nextShapeId(zip, slide)
      const xml = specs.map((t, i) => {
        const r = Math.floor(i / cols), c = i % cols
        const s = metricTile({
          id, x: BODY.x + c * (tileW + GAP), y: y + r * (h + GAP), cx: tileW, cy: h,
          value: t.value, unit: t.unit, label: t.label,
          barColor: t.barColor, accent: t.accent, figSz: t.figSz, compact: t.compact,
          desc: t.desc,
        })
        id += 2   // metricTile consumes id and id+1 (card + accent rule)
        return s
      }).join('')
      appendShapesToSlide(zip, slide, xml)
      const rows = Math.ceil(specs.length / cols)
      advance(rows * h + (rows - 1) * GAP)
    },
    image(png, maxH) {
      const { w, h } = pngSize(png)
      const box = containRect(w, h, { x: BODY.x, y, cx: BODY.cx, cy: maxH })
      if (addImage(zip, slide, png, box)) advance(box.cy)
    },
    table(colW, rows, opts = {}) {
      const rowH = opts.rowH ?? ROW_H
      const cy = (rows.length + (opts.bands ? 1 : 0)) * rowH
      // `center` balances a sole table in the space remaining below the cursor.
      const ty = opts.center ? y + Math.max(0, (BODY.y + BODY.cy - y - cy) / 2) : y
      const ok = appendShapesToSlide(zip, slide, tableShape({
        id: nextShapeId(zip, slide), x: BODY.x, y: ty, cx: BODY.cx, cy,
        colW, rows, rowH, bands: opts.bands,
      }))
      if (ok) { y = ty + cy; advance(0) }
    },
    caption(lines) {
      const arr = typeof lines === 'string' ? [lines] : lines
      const cy = arr.length * CAPTION_LINE_H
      appendShapesToSlide(zip, slide, textBox({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy,
        paras: arr.map(l => [{ t: l, sz: 1300, color: GRAY }]),
      }))
      advance(cy)
    },
  }
}

/** Claim → native title placeholder; descriptive fallback when not computable. */
export function setTitle(zip: PizZip, slide: number, claim: string | null, fallback: string): void {
  setSlideTitle(zip, slide, claim ?? fallback)
}
