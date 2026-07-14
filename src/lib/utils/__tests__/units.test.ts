import { describe, it, expect } from 'vitest'
import { formatImperialForDisplay, parseImperialInput } from '../units'

describe('formatImperialForDisplay — imperial rounding (Bug 3)', () => {
  it('rounds the imperial display so metric-origin floats never show long tails', () => {
    // 2000.0176 lbs (what "907.2 kg" ÷ 0.453592 produces) → clean "2000".
    expect(formatImperialForDisplay(2000.0176, 'lbs', 'imperial')).toBe('2000')
    expect(formatImperialForDisplay(200.1312, 'ft', 'imperial')).toBe('200.1')
    expect(formatImperialForDisplay(48.03, 'in', 'imperial')).toBe('48')
    expect(formatImperialForDisplay(14.4, 'F', 'imperial')).toBe('14')
  })

  it('blank/NaN stay blank (cleared field sentinel)', () => {
    expect(formatImperialForDisplay(null, 'lbs', 'imperial')).toBe('')
    expect(formatImperialForDisplay(NaN, 'ft', 'metric')).toBe('')
  })
})

describe('parseImperialInput ↔ formatImperialForDisplay round-trip is stable', () => {
  // The drift bug: display → parse → display kept inflating. With rounding, a
  // metric round-trip converges instead of accumulating decimals/magnitude.
  it('metric round-trip converges (does not inflate on repeat)', () => {
    let stored = 2000                                   // lbs, imperial storage
    for (let i = 0; i < 5; i++) {
      const shown = formatImperialForDisplay(stored, 'lbs', 'metric')   // → kg string
      stored = parseImperialInput(shown, 'lbs', 'metric')               // kg → lbs
    }
    // Never runs away — stays within a pound of the original.
    expect(Math.abs(stored - 2000)).toBeLessThan(1)
  })

  it('imperial input parses straight through unchanged', () => {
    expect(parseImperialInput('220', 'ft', 'imperial')).toBe(220)
    expect(parseImperialInput('', 'ft', 'imperial')).toBeNaN()   // cleared → NaN sentinel
  })
})
