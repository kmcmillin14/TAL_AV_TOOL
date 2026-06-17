import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { removeSlides, replaceInSlides, slideParts, appendShapesToSlide, textBox, nextShapeId } from '../ooxml'
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
