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
