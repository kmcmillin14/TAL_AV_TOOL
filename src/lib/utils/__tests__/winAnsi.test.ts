import { describe, it, expect } from 'vitest'
import { winAnsiSafe } from '../winAnsi'

describe('winAnsiSafe', () => {
  it('replaces the route arrow that crashed the questionnaire PDF', () => {
    expect(winAnsiSafe('Dock A → Storage 1')).toBe('Dock A -> Storage 1')
  })

  it('maps only non-Win1252 math glyphs; keeps ×, ÷, · which WinAnsi supports', () => {
    expect(winAnsiSafe('⌈ 9 ÷ 0.5 ⌉ ≥ 5 × 2')).toBe(' 9 ÷ 0.5  >= 5 × 2')   // ÷ × stay
    expect(winAnsiSafe('✓ pass · ✗ fail')).toBe('v pass · x fail')          // · stays
  })

  it('keeps ASCII, Latin-1, and WinAnsi punctuation untouched', () => {
    expect(winAnsiSafe('Acme — 2,500 lbs · 45° "quoted"')).toBe('Acme — 2,500 lbs · 45° "quoted"')
    expect(winAnsiSafe('café résumé naïve')).toBe('café résumé naïve')
  })

  it('replaces anything else non-encodable with "?" (never throws)', () => {
    expect(winAnsiSafe('load 📦 here')).toBe('load ? here')  // emoji → placeholder
  })

  it('is idempotent', () => {
    const once = winAnsiSafe('A → B ⌈x⌉')
    expect(winAnsiSafe(once)).toBe(once)
  })
})
