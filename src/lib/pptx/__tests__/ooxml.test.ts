import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { removeSlides, replaceInSlides, slideParts, appendShapesToSlide, textBox, nextShapeId, fillBodyPlaceholder, table, addImage } from '../ooxml'
import { slidesToRemove, type PptxSelection, PPTX_SECTIONS } from '../sections'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

describe('slidesToRemove', () => {
  const allSections = Object.fromEntries(PPTX_SECTIONS.map(s => [s.key, true]))

  it('everything selected → removes only Cleanfix (S17)', () => {
    const sel: PptxSelection = {
      sections: allSections,
      vehicles: { '8tb50a': true, '8hbc40a': true, m10: true, ml2: true, ebase7: true, cb18: true },
    }
    expect(slidesToRemove(sel)).toEqual([17])
  })

  it('nothing selected → removes all toggleable + all vehicle slides, keeps cover/contact/trailing', () => {
    const remove = slidesToRemove({ sections: {}, vehicles: {} })
    expect(remove).not.toContain(1)   // cover (always)
    expect(remove).not.toContain(34)  // contact (always)
    expect(remove).not.toContain(35)  // trailing (unowned)
    expect(remove).toContain(11)      // a vehicle slide
    expect(remove).toContain(27)      // investment summary
  })
})

describe('removeSlides (OOXML round-trip)', () => {
  it('drops the parts and prunes presentation/rels/content-types, deck re-opens', () => {
    const zip = load()
    expect(slideParts(zip)).toHaveLength(35)
    const beforeSldIds = (zip.file('ppt/presentation.xml')!.asText().match(/<p:sldId\b/g) ?? []).length
    expect(beforeSldIds).toBe(35)

    removeSlides(zip, [17, 2, 11])
    const out = reopen(zip)

    expect(slideParts(out)).toHaveLength(32)
    expect(out.file('ppt/slides/slide17.xml')).toBeNull()
    expect(out.file('ppt/slides/_rels/slide11.xml.rels')).toBeNull()

    const pres = out.file('ppt/presentation.xml')!.asText()
    expect((pres.match(/<p:sldId\b/g) ?? []).length).toBe(32)

    const rels = out.file('ppt/_rels/presentation.xml.rels')!.asText()
    expect(rels).not.toContain('Target="slides/slide17.xml"')
    expect(rels).not.toContain('Target="slides/slide11.xml"')
    // slide1 (not removed) survives, and slide1 ≠ slide11 (boundary check)
    expect(rels).toContain('Target="slides/slide1.xml"')

    const types = out.file('[Content_Types].xml')!.asText()
    expect(types).not.toContain('/ppt/slides/slide17.xml')
    expect(types).toContain('/ppt/slides/slide1.xml')
  })
})

describe('appendShapesToSlide + textBox', () => {
  it('injects an editable text box that re-parses and carries the content', () => {
    const zip = load()
    const id = nextShapeId(zip, 27)
    const ok = appendShapesToSlide(zip, 27, textBox({
      id, x: 685800, y: 1828800, cx: 10820400, cy: 4114800,
      paras: [
        [{ t: 'System CAPEX', sz: 1400, color: '8A8A8E' }],
        [{ t: '$1.2M – $1.6M', sz: 3200, bold: true, color: 'accent1' }],
      ],
    }))
    expect(ok).toBe(true)
    const out = reopen(zip)                       // must re-parse cleanly
    const s27 = out.file('ppt/slides/slide27.xml')!.asText()
    expect(s27).toContain('$1.2M – $1.6M')
    expect(s27).toContain('<a:schemeClr val="accent1"/>')
    // exactly one closing spTree, shape nested inside it
    expect((s27.match(/<\/p:spTree>/g) ?? []).length).toBe(1)
  })

  it('returns false for a removed/absent slide', () => {
    const zip = load()
    removeSlides(zip, [27])
    expect(appendShapesToSlide(zip, 27, '<p:sp/>')).toBe(false)
  })
})

describe('fillBodyPlaceholder', () => {
  it('writes paragraphs into the existing idx="1" content placeholder, not a new box', () => {
    const zip = load()
    const before = zip.file('ppt/slides/slide27.xml')!.asText()
    // template ships an empty content placeholder
    expect(before).toMatch(/<p:ph\b[^>]*\bidx="1"/)
    const beforeShapes = (before.match(/<p:sp>/g) ?? []).length

    const ok = fillBodyPlaceholder(zip, 27, [
      [{ t: 'System CAPEX', sz: 1400, color: '8A8A8E' }],
      [{ t: '$1.2M – $1.6M', sz: 3200, bold: true, color: 'accent1' }],
      [],
    ])
    expect(ok).toBe(true)

    const out = reopen(zip)                       // must re-parse cleanly
    const s27 = out.file('ppt/slides/slide27.xml')!.asText()
    expect(s27).toContain('$1.2M – $1.6M')
    expect(s27).toContain('<a:schemeClr val="accent1"/>')
    expect(s27).toContain('<a:p/>')               // blank-line row
    // no new shape: filled in place, shape count unchanged
    expect((s27.match(/<p:sp>/g) ?? []).length).toBe(beforeShapes)
    // content lives inside a placeholder shape (idx="1" still present)
    expect(s27).toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('returns false for a removed/absent slide', () => {
    const zip = load()
    removeSlides(zip, [27])
    expect(fillBodyPlaceholder(zip, 27, [[{ t: 'x' }]])).toBe(false)
  })
})

describe('table', () => {
  it('builds an editable graphic-frame table that re-parses with header + cells', () => {
    const zip = load()
    const id = nextShapeId(zip, 18)
    const ok = appendShapesToSlide(zip, 18, table({
      id, x: 685800, y: 1828800, cx: 9000000, cy: 1000000,
      colW: [3000000, 6000000],
      rows: [
        [{ t: 'Requirement' }, { t: 'Value' }],
        [{ t: 'Max load weight', bold: true }, { t: '2,500 lbs' }],
        [{ t: 'Verdict' }, { t: 'GREEN', fill: '2E7D32', color: 'FFFFFF' }],
      ],
    }))
    expect(ok).toBe(true)
    const out = reopen(zip)                          // must re-parse cleanly
    const s18 = out.file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('<a:tbl>')
    expect(s18).toContain('graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"')
    expect(s18).toContain('2,500 lbs')
    expect(s18).toContain('<a:srgbClr val="2E7D32"/>')   // verdict fill
    expect((s18.match(/<a:gridCol\b/g) ?? []).length).toBe(2)
    expect((s18.match(/<a:tr\b/g) ?? []).length).toBe(3)
  })
})

describe('addImage', () => {
  const PNG = new Uint8Array(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'))

  it('writes a media part, a fresh slide rel, and a <p:pic> that re-parses', () => {
    const zip = load()
    const rels0 = zip.file('ppt/slides/_rels/slide24.xml.rels')!.asText()
    const usedRId = new Set([...rels0.matchAll(/Id="(rId\d+)"/g)].map(m => m[1]))

    expect(addImage(zip, 24, PNG, { x: 685800, y: 1828800, cx: 9000000, cy: 2500000 })).toBe(true)
    const out = reopen(zip)

    const s24 = out.file('ppt/slides/slide24.xml')!.asText()
    expect(s24).toContain('<p:pic>')
    const embed = /r:embed="(rId\d+)"/.exec(s24)![1]
    expect(usedRId.has(embed)).toBe(false)             // a NEW rId, not reused

    const rels = out.file('ppt/slides/_rels/slide24.xml.rels')!.asText()
    expect(rels).toContain(`Id="${embed}"`)
    const target = new RegExp(`Id="${embed}"[^>]*Target="\\.\\./media/(image\\d+\\.png)"`).exec(rels)![1]
    expect(out.file(`ppt/media/${target}`)).not.toBeNull()
  })

  it('returns false for a removed/absent slide', () => {
    const zip = load()
    removeSlides(zip, [24])
    expect(addImage(zip, 24, PNG, { x: 0, y: 0, cx: 1, cy: 1 })).toBe(false)
  })
})

describe('replaceInSlides', () => {
  it('fills the cover placeholders and escapes XML', () => {
    const zip = load()
    const n = replaceInSlides(zip, [
      ['[TAL Representative]', 'Jane & Co <Rep>'],
      ['[Customer and Location]', 'Acme — Phoenix, AZ'],
    ])
    expect(n).toBeGreaterThan(0)
    const out = reopen(zip)
    const s1 = out.file('ppt/slides/slide1.xml')!.asText()
    expect(s1).not.toContain('[TAL Representative]')
    expect(s1).toContain('Jane &amp; Co &lt;Rep&gt;') // escaped
    expect(s1).toContain('Acme — Phoenix, AZ')
  })
})
