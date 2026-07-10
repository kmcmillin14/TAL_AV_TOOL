import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { frame, setTitle, usd, usdRange, pct, GAP } from '../layout'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

describe('frame (shared slide grammar)', () => {
  it('composes eyebrow → rule → tiles → table → caption in call order', () => {
    const zip = load()
    const f = frame(zip, 18)
    f.eyebrow('01 — TEST SECTION')
    f.rule()
    f.tiles([{ value: '1', label: 'A', desc: 'one of two' }, { value: '2', label: 'B' }])
    f.table([5000000, 5820400], [[{ t: 'K' }, { t: 'V' }], [{ t: 'a' }, { t: 'b' }]])
    f.caption('legend line')

    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    const order = ['01 — TEST SECTION', 'ROM Rule', 'KPI Tile', '<a:tbl>', 'legend line']
      .map(s => xml.indexOf(s))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(xml).toContain('one of two')                       // tile desc rendered
    expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('skip() advances the cursor by h + GAP', () => {
    const zip = load()
    const f = frame(zip, 18)
    const y0 = f.y
    f.skip(500000)
    expect(f.y).toBe(y0 + 500000 + GAP)                       // h + GAP
  })

  it('setTitle falls back to fallback when the claim is null', () => {
    const zip = load()
    setTitle(zip, 18, null, 'Fleet sizing')
    const xml = zip.file('ppt/slides/slide18.xml')!.asText()
    expect(xml).toContain('Fleet sizing')
    expect(xml).not.toContain('Your operation')
  })

  it('setTitle uses the claim when provided, ignoring the fallback', () => {
    const zip2 = load()
    setTitle(zip2, 18, 'Your operation needs a fleet of 12', 'Fleet sizing')
    const xml = zip2.file('ppt/slides/slide18.xml')!.asText()
    expect(xml).toContain('Your operation needs a fleet of 12')
    expect(xml).not.toContain('Fleet sizing')
  })

  it('no-ops cleanly on a removed slide', () => {
    const zip = load()
    zip.remove('ppt/slides/slide18.xml')
    expect(() => {
      const f = frame(zip, 18)
      f.eyebrow('X'); f.rule(); f.tiles([{ value: '1', label: 'A' }]); f.caption('y')
    }).not.toThrow()
  })

  it('formats compact USD and percent', () => {
    expect(usd(1_020_000)).toBe('$1.02M')
    expect(usd(366_500)).toBe('$367K')
    expect(usd(42)).toBe('$42')
    expect(usd(-500_000)).toBe('-$500K')
    expect(usdRange(5, 5)).toBe('$5')
    expect(usdRange(900_000, 1_100_000)).toBe('$900K – $1.10M')
    expect(pct(0.766)).toBe('77%')
  })
})
