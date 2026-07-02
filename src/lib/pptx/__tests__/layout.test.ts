import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { frame, usd, usdRange, pct } from '../layout'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

describe('frame (shared slide grammar)', () => {
  it('composes eyebrow → takeaway → tiles → table → caption in call order', () => {
    const zip = load()
    const f = frame(zip, 18)
    f.eyebrow('01 — TEST SECTION')
    f.takeaway([{ t: 'Headline ', sz: 2100 }, { t: '42', sz: 2100, bold: true, color: 'EB0A1E' }])
    f.tiles([{ value: '1', label: 'A' }, { value: '2', label: 'B' }])
    f.table([5000000, 5820400], [[{ t: 'K' }, { t: 'V' }], [{ t: 'a' }, { t: 'b' }]])
    f.caption('legend line')

    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    const order = ['01 — TEST SECTION', 'Headline ', 'KPI Tile', '<a:tbl>', 'legend line']
      .map(s => xml.indexOf(s))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)   // appended in call order
    expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)          // body placeholder removed
  })

  it('advances the cursor per zone and skips a null takeaway', () => {
    const zip = load()
    const f = frame(zip, 18)
    const y0 = f.y
    f.takeaway(null)
    expect(f.y).toBe(y0)                                      // null → skipped entirely
    f.eyebrow('X')
    expect(f.y).toBeGreaterThan(y0)
  })

  it('no-ops cleanly on a removed slide', () => {
    const zip = load()
    zip.remove('ppt/slides/slide18.xml')
    expect(() => {
      const f = frame(zip, 18)
      f.eyebrow('X'); f.tiles([{ value: '1', label: 'A' }]); f.caption('y')
    }).not.toThrow()
  })

  it('formats compact USD and percent', () => {
    expect(usd(1_020_000)).toBe('$1.02M')
    expect(usd(366_500)).toBe('$367K')
    expect(usd(42)).toBe('$42')
    expect(usdRange(5, 5)).toBe('$5')
    expect(usdRange(900_000, 1_100_000)).toBe('$900K – $1.10M')
    expect(pct(0.766)).toBe('77%')
  })
})
