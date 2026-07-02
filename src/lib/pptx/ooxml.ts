// OOXML (.pptx) manipulation over a PizZip instance — pure string/zip edits,
// no React. Used by the branded ROM export to remove slides and fill tokens
// while preserving the template's theme, masters, and media.
import PizZip from 'pizzip'

const PRESENTATION = 'ppt/presentation.xml'
const PRES_RELS = 'ppt/_rels/presentation.xml.rels'
const CONTENT_TYPES = '[Content_Types].xml'

const readXml = (zip: PizZip, path: string): string => {
  const f = zip.file(path)
  if (!f) throw new Error(`pptx template missing ${path}`)
  return f.asText()
}

/** XML-escape a value destined for element text (`<a:t>…</a:t>`). */
function escapeXml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Names of the slide XML parts still present, e.g. `ppt/slides/slide12.xml`. */
export function slideParts(zip: PizZip): string[] {
  return Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
}

/** Next free relationship id (`rIdN`) in a `.rels` document. */
function nextRId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => Number(m[1]))
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`
}

/**
 * Remove the given 1-based slides from the deck: drop the slide + its rels
 * parts, and prune the matching entries from presentation.xml (sldIdLst),
 * presentation.xml.rels (Relationship), and [Content_Types].xml (Override).
 * Other slides keep their original file names (no renumbering needed).
 */
export function removeSlides(zip: PizZip, slideNums: number[]): void {
  if (slideNums.length === 0) return
  let pres = readXml(zip, PRESENTATION)
  let rels = readXml(zip, PRES_RELS)
  let types = readXml(zip, CONTENT_TYPES)

  for (const n of slideNums) {
    // 1. rId from the presentation relationship (trailing quote avoids slide1↔slide11).
    const relRe = new RegExp(`<Relationship\\b[^>]*?Target="slides/slide${n}\\.xml"\\s*/>`)
    const relMatch = rels.match(relRe)
    if (relMatch) {
      const rId = relMatch[0].match(/Id="([^"]+)"/)?.[1]
      rels = rels.replace(relRe, '')
      if (rId) {
        pres = pres.replace(new RegExp(`<p:sldId\\b[^>]*?r:id="${rId}"\\s*/>`), '')
      }
    }
    // 2. Content-type override for the part.
    types = types.replace(
      new RegExp(`<Override PartName="/ppt/slides/slide${n}\\.xml"[^>]*/>`), '',
    )
    // 3. The slide part + its rels.
    zip.remove(`ppt/slides/slide${n}.xml`)
    zip.remove(`ppt/slides/_rels/slide${n}.xml.rels`)
  }

  zip.file(PRESENTATION, pres)
  zip.file(PRES_RELS, rels)
  zip.file(CONTENT_TYPES, types)
}

const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'

/**
 * Append a NEW slide cloned from `sourceSlideNum` (its layout/placeholders), at
 * the END of the deck. Wires the slide part + rels copy, the `[Content_Types]`
 * override, the presentation relationship, and the `sldIdLst` entry. Returns the
 * new slide number (caller then sets the title / fills the body), or null if the
 * source is missing. The clone copies the source XML *as-is*, so clone BEFORE the
 * source slide is filled to get a clean shell.
 */
export function cloneSlide(zip: PizZip, sourceSlideNum: number): number | null {
  const src = zip.file(`ppt/slides/slide${sourceSlideNum}.xml`)
  const srcRels = zip.file(`ppt/slides/_rels/slide${sourceSlideNum}.xml.rels`)
  if (!src || !srcRels) return null

  const newNum = Math.max(...slideParts(zip).map(n => Number(/slide(\d+)\.xml$/.exec(n)![1]))) + 1
  zip.file(`ppt/slides/slide${newNum}.xml`, src.asText())
  zip.file(`ppt/slides/_rels/slide${newNum}.xml.rels`, srcRels.asText())

  zip.file(CONTENT_TYPES, readXml(zip, CONTENT_TYPES).replace(
    '</Types>', `<Override PartName="/ppt/slides/slide${newNum}.xml" ContentType="${SLIDE_CT}"/></Types>`))

  let rels = readXml(zip, PRES_RELS)
  const rId = nextRId(rels)
  rels = rels.replace('</Relationships>',
    `<Relationship Id="${rId}" Type="${SLIDE_REL}" Target="slides/slide${newNum}.xml"/></Relationships>`)
  zip.file(PRES_RELS, rels)

  let pres = readXml(zip, PRESENTATION)
  const sldId = Math.max(256, ...[...pres.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)].map(m => Number(m[1]))) + 1
  pres = pres.replace('</p:sldIdLst>', `<p:sldId id="${sldId}" r:id="${rId}"/></p:sldIdLst>`)
  zip.file(PRESENTATION, pres)

  return newNum
}

// ── Native shape injection (editable content into a slide body) ──────────────

export interface TextRun {
  t: string
  bold?: boolean
  sz?: number              // hundredths of a point (1800 = 18pt)
  color?: string           // 6-hex srgb (e.g. 'EB0A1E') or theme scheme name ('accent1')
}

/** Next free shape id on a slide (max existing `id="N"` + 1). */
export function nextShapeId(zip: PizZip, slideNum: number): number {
  const f = zip.file(`ppt/slides/slide${slideNum}.xml`)
  if (!f) return 100
  const ids = [...f.asText().matchAll(/\bid="(\d+)"/g)].map(m => Number(m[1]))
  return (ids.length ? Math.max(...ids) : 99) + 1
}

const fillXml = (color?: string) =>
  !color ? ''
    : `<a:solidFill>${color.length === 6 ? `<a:srgbClr val="${color}"/>` : `<a:schemeClr val="${color}"/>`}</a:solidFill>`

/** A run's `<a:rPr>` — minimal so unset props inherit the placeholder/layout style. */
const runXml = (r: TextRun) =>
  `<a:r><a:rPr lang="en-US"${r.sz ? ` sz="${r.sz}"` : ''}${r.bold ? ' b="1"' : ''} dirty="0">${fillXml(r.color)}</a:rPr><a:t>${escapeXml(r.t)}</a:t></a:r>`

/** Paragraphs `<a:p>…</a:p>` from rows of runs (empty row → blank line). */
export function parasXml(paras: TextRun[][]): string {
  return paras.map(p => (p.length ? `<a:p>${p.map(runXml).join('')}</a:p>` : '<a:p/>')).join('')
}

// The single body Content Placeholder `<p:sp>` (idx="1") — not title/date/footer.
const BODY_PH_RE = /<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph\b[^>]*\bidx="1"[^>]*\/>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/
// The title placeholder `<p:sp>` (type="title").
const TITLE_PH_RE = /<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph\b[^>]*\btype="title"[^>]*\/?>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/

/** Replace the matched placeholder shape's `<p:txBody>` with new paragraphs. */
function fillPh(zip: PizZip, slideNum: number, re: RegExp, paras: TextRun[][]): boolean {
  const path = `ppt/slides/slide${slideNum}.xml`
  const f = zip.file(path)
  if (!f) return false
  const xml = f.asText()
  const m = xml.match(re)
  if (!m) return false
  const filled = m[0].replace(
    /<p:txBody>[\s\S]*?<\/p:txBody>/,
    `<p:txBody><a:bodyPr/><a:lstStyle/>${parasXml(paras)}</p:txBody>`,
  )
  zip.file(path, xml.replace(m[0], filled))
  return true
}

/**
 * Fill the slide's body Content Placeholder (`<p:ph idx="1"/>`) — the empty box
 * the template already lays out — by replacing its `<p:txBody>` paragraphs.
 * Inherits the placeholder's position + style from the layout. No-op if the
 * slide or placeholder is absent.
 */
export function fillBodyPlaceholder(zip: PizZip, slideNum: number, paras: TextRun[][]): boolean {
  return fillPh(zip, slideNum, BODY_PH_RE, paras)
}

/** Set the slide's title placeholder text (single run, inherits the title style). */
export function setSlideTitle(zip: PizZip, slideNum: number, text: string): boolean {
  return fillPh(zip, slideNum, TITLE_PH_RE, [[{ t: text }]])
}

/**
 * Remove the body Content Placeholder shape entirely — for slides where a table,
 * image, or chart takes its place, so the engineer isn't left with an empty
 * "click to add text" box ghosting behind the graphic. No-op if absent.
 */
export function removeBodyPlaceholder(zip: PizZip, slideNum: number): boolean {
  const path = `ppt/slides/slide${slideNum}.xml`
  const f = zip.file(path)
  if (!f) return false
  const xml = f.asText()
  const m = xml.match(BODY_PH_RE)
  if (!m) return false
  zip.file(path, xml.replace(m[0], ''))
  return true
}

/** A native, editable text box `<p:sp>` (rect, theme font). EMU units. Kept for
 *  free-standing content (e.g. images/graphics) where no placeholder exists. */
export function textBox(opts: {
  id: number; x: number; y: number; cx: number; cy: number; paras: TextRun[][]
}): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="ROM Content ${opts.id}"/>`
    + `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
    + `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${parasXml(opts.paras)}</p:txBody></p:sp>`
}

// ── Engineering KPI metric tile (S25/26) ─────────────────────────────────────

const TILE_CARD = 'FAFAFA'      // soft card surface
const TILE_BORDER = 'E4E4E7'    // hairline card outline
const TILE_LABEL = '8A8A8E'     // muted label / unit
const TILE_INK = '2B2B2B'       // figure ink
const TILE_BAR = 386000         // accent-rule height (EMU, ~0.42pt of card top)

/**
 * One engineering metric tile: a soft card with a TAL-red (accent) or muted top
 * accent rule, a big bold figure with an optional smaller unit, and a spaced
 * caps label beneath. Emitted as two shapes (card + accent bar) using `id` and
 * `id+1`, so the caller must space tile ids by 2. EMU units.
 */
export function metricTile(opts: {
  id: number; x: number; y: number; cx: number; cy: number
  value: string; unit?: string; label: string; accent?: boolean
  /** Override the figure size (hundredths of pt) for long values (e.g. money ranges). */
  figSz?: number
  /** Override the accent-rule color (6-hex, e.g. a status color). Defaults to red/muted. */
  barColor?: string
  /** Tighter vertical rhythm for short tiles (e.g. the Fleet-Engine progression row). */
  compact?: boolean
}): string {
  const barColor = opts.barColor ?? (opts.accent ? TAL_RED : TILE_LABEL)
  const figSz = opts.figSz ?? (opts.compact ? 2400 : opts.accent ? 3600 : 3000)
  const topIns = opts.compact ? 160020 : TILE_BAR + 91440
  const num = `<a:r><a:rPr lang="en-US" sz="${figSz}" b="1" dirty="0"><a:solidFill><a:srgbClr val="${TILE_INK}"/></a:solidFill></a:rPr><a:t>${escapeXml(opts.value)}</a:t></a:r>`
  const unit = opts.unit
    ? `<a:r><a:rPr lang="en-US" sz="1600" b="1" dirty="0"><a:solidFill><a:srgbClr val="${TILE_LABEL}"/></a:solidFill></a:rPr><a:t>${escapeXml(' ' + opts.unit)}</a:t></a:r>`
    : ''
  const label = `<a:r><a:rPr lang="en-US" sz="1050" spc="60" dirty="0"><a:solidFill><a:srgbClr val="${TILE_LABEL}"/></a:solidFill></a:rPr><a:t>${escapeXml(opts.label)}</a:t></a:r>`
  const card = `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="KPI Tile ${opts.id}"/>`
    + `<p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 6000"/></a:avLst></a:prstGeom>`
    + `<a:solidFill><a:srgbClr val="${TILE_CARD}"/></a:solidFill>`
    + `<a:ln w="6350"><a:solidFill><a:srgbClr val="${TILE_BORDER}"/></a:solidFill></a:ln></p:spPr>`
    + `<p:txBody><a:bodyPr lIns="118872" tIns="${topIns}" rIns="118872" bIns="68580" anchor="t"/><a:lstStyle/>`
    + `<a:p><a:pPr algn="l"/>${num}${unit}</a:p>`
    + `<a:p><a:pPr algn="l"><a:spcBef><a:spcPts val="500"/></a:spcBef></a:pPr>${label}</a:p></p:txBody></p:sp>`
  // Accent rule: a thin rect flush to the top of the card, inset to the rounded corners.
  const bar = `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id + 1}" name="KPI Rule ${opts.id + 1}"/>`
    + `<p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${opts.x + 91440}" y="${opts.y + 91440}"/><a:ext cx="${opts.cx - 182880}" cy="45720"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + `<a:solidFill><a:srgbClr val="${barColor}"/></a:solidFill></p:spPr>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
  return card + bar
}

// ── Native editable tables (`<a:tbl>` graphic frame) ─────────────────────────

export interface TableCell {
  t: string
  align?: 'l' | 'ctr' | 'r' // default left
  fill?: string             // 6-hex cell background (e.g. status color)
  color?: string            // 6-hex text color (overrides the row default)
  bold?: boolean
}

export const TAL_RED = 'EB0A1E'
const HEADER_TXT = '2B2B2B'  // ink header text (band removed — brand carried by the red rule)
const BODY_TXT = '2B2B2B'
const GRID_LINE = 'E4E4E7'   // hairline between body rows (matches the dashboard grid token)

/**
 * One `<a:tc>`. Header (row 0): white background, bold ink text with letter-
 * spacing, and a single TAL-red underline rule — the brand moment, once per
 * table. Body cells: hairline bottom divider, no fill. An explicit `fill` /
 * `color` on the cell (verdicts, TOTAL row) always wins.
 */
function cellXml(c: TableCell, header: boolean): string {
  const color = c.color ?? (header ? HEADER_TXT : BODY_TXT)
  const sz = header ? 1100 : 1000
  const bold = header || c.bold ? ' b="1"' : ''
  const spc = header ? ' spc="40"' : ''   // header letter-spacing
  const run = c.t
    ? `<a:r><a:rPr lang="en-US" sz="${sz}"${bold}${spc} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(c.t)}</a:t></a:r>`
    : '<a:endParaRPr lang="en-US"/>'
  // tcPr child order per schema: borders (lnB) then fill group.
  const border = header
    ? `<a:lnB w="19050" cap="flat"><a:solidFill><a:srgbClr val="${TAL_RED}"/></a:solidFill></a:lnB>`
    : `<a:lnB w="6350" cap="flat"><a:solidFill><a:srgbClr val="${GRID_LINE}"/></a:solidFill></a:lnB>`
  const fillXml = c.fill ? `<a:solidFill><a:srgbClr val="${c.fill}"/></a:solidFill>` : '<a:noFill/>'
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${c.align ?? 'l'}"/>${run}</a:p></a:txBody>`
    + `<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">${border}${fillXml}</a:tcPr></a:tc>`
}

/** Optional grouped super-header (e.g. Vehicle · Route Input · Output) spanning
 *  columns via gridSpan/hMerge. `span`s must sum to `colW.length`. */
export interface TableBand { t: string; span: number }

/** A merged band cell (red label) + its (span-1) covered cells. */
function bandCellsXml(b: TableBand): string {
  const first = `<a:tc gridSpan="${b.span}"><a:txBody><a:bodyPr/><a:lstStyle/>`
    + `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1000" b="1" dirty="0">`
    + `<a:solidFill><a:srgbClr val="${TAL_RED}"/></a:solidFill></a:rPr><a:t>${escapeXml(b.t)}</a:t></a:r></a:p>`
    + `</a:txBody><a:tcPr marL="45720" marR="45720" anchor="ctr">`
    + `<a:lnB w="6350" cap="flat"><a:solidFill><a:srgbClr val="${GRID_LINE}"/></a:solidFill></a:lnB><a:noFill/></a:tcPr></a:tc>`
  const merged = '<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>'.repeat(b.span - 1)
  return first + merged
}

/** A native, editable table as a `<p:graphicFrame>`. Row 0 is the header (an
 *  optional `bands` row sits above it). No table-style dependency — explicit cell
 *  borders/fills render identically in PowerPoint/Keynote/LibreOffice. EMU units;
 *  `colW` should sum to ~`cx`. */
export function table(opts: {
  id: number
  x: number; y: number; cx: number; cy: number
  colW: number[]
  rows: TableCell[][]
  rowH?: number
  bands?: TableBand[]
}): string {
  const rowH = opts.rowH ?? 400000
  const grid = opts.colW.map(w => `<a:gridCol w="${w}"/>`).join('')
  const bandRow = opts.bands ? `<a:tr h="${rowH}">${opts.bands.map(bandCellsXml).join('')}</a:tr>` : ''
  const rows = bandRow + opts.rows.map((row, i) =>
    `<a:tr h="${rowH}">${row.map(c => cellXml(c, i === 0)).join('')}</a:tr>`).join('')
  return `<p:graphicFrame><p:nvGraphicFramePr>`
    + `<p:cNvPr id="${opts.id}" name="ROM Table ${opts.id}"/><p:cNvGraphicFramePr>`
    + `<a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
    + `<p:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></p:xfrm>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">`
    + `<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl>`
    + `</a:graphicData></a:graphic></p:graphicFrame>`
}

/** Width/height (px) from a PNG's IHDR chunk (big-endian u32 at bytes 16 & 20). */
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const u32 = (o: number) => ((png[o] << 24) | (png[o + 1] << 16) | (png[o + 2] << 8) | png[o + 3]) >>> 0
  return { w: u32(16), h: u32(20) }
}

/**
 * A rect inside `box` that contains a `natW×natH` image at its native aspect
 * (no distortion), centered horizontally and top-aligned — a table usually sits
 * beneath the image. PowerPoint stretches a `<p:pic>` to fill its rect, so the
 * caller must size the rect to the image, not the other way round.
 */
export function containRect(
  natW: number, natH: number, box: { x: number; y: number; cx: number; cy: number },
): { x: number; y: number; cx: number; cy: number } {
  const scale = Math.min(box.cx / natW, box.cy / natH)
  const cx = Math.round(natW * scale), cy = Math.round(natH * scale)
  return { x: box.x + Math.round((box.cx - cx) / 2), y: box.y, cx, cy }
}

const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

/**
 * Place a PNG on a slide as a native `<p:pic>`: writes the media part, adds the
 * slide relationship, and inserts the picture shape at the given EMU rect. The
 * template already declares the `png` default content-type, so no
 * `[Content_Types]` edit is needed. No-op (returns false) if the slide absent.
 */
export function addImage(
  zip: PizZip, slideNum: number, png: Uint8Array,
  rect: { x: number; y: number; cx: number; cy: number },
): boolean {
  const slidePath = `ppt/slides/slide${slideNum}.xml`
  const slide = zip.file(slidePath)
  const relPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
  const relsFile = zip.file(relPath)
  if (!slide || !relsFile) return false

  // Unique media name across the whole deck.
  const used = Object.keys(zip.files)
    .map(n => /^ppt\/media\/image(\d+)\./.exec(n)?.[1]).filter(Boolean).map(Number)
  const mediaName = `image${(used.length ? Math.max(...used) : 0) + 1}.png`
  zip.file(`ppt/media/${mediaName}`, png)

  // Next free rId in this slide's rels.
  let rels = relsFile.asText()
  const rId = nextRId(rels)
  rels = rels.replace('</Relationships>',
    `<Relationship Id="${rId}" Type="${IMAGE_REL}" Target="../media/${mediaName}"/></Relationships>`)
  zip.file(relPath, rels)

  const id = nextShapeId(zip, slideNum)
  const pic = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Material Flow ${id}"/>`
    + `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="${rect.x}" y="${rect.y}"/><a:ext cx="${rect.cx}" cy="${rect.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  zip.file(slidePath, slide.asText().replace('</p:spTree>', `${pic}</p:spTree>`))
  return true
}

/** Insert raw shape XML before `</p:spTree>` on a slide (no-op if slide absent). */
export function appendShapesToSlide(zip: PizZip, slideNum: number, shapesXml: string): boolean {
  const path = `ppt/slides/slide${slideNum}.xml`
  const f = zip.file(path)
  if (!f) return false
  const xml = f.asText()
  if (!xml.includes('</p:spTree>')) return false
  zip.file(path, xml.replace('</p:spTree>', `${shapesXml}</p:spTree>`))
  return true
}

/**
 * Replace literal text in every remaining slide. Each replacement's `search` is
 * matched as plain text inside the slide XML (the template's placeholders are
 * single text runs, so no run-merging is needed for these); `value` is
 * XML-escaped. Returns the number of replacements applied (for diagnostics).
 */
export function replaceInSlides(zip: PizZip, replacements: Array<[search: string, value: string]>): number {
  let count = 0
  for (const path of slideParts(zip)) {
    let xml = zip.file(path)!.asText()
    let changed = false
    for (const [search, value] of replacements) {
      if (xml.includes(search)) {
        xml = xml.split(search).join(escapeXml(value))
        changed = true
        count++
      }
    }
    if (changed) zip.file(path, xml)
  }
  return count
}
