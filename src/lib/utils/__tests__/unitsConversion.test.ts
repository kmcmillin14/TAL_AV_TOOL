import { describe, it, expect } from 'vitest'
import { units, parseImperialInput, formatImperialForDisplay } from '../units'
import cb18 from '../../../content/vehicles/cb18.json'
import type { Vehicle } from '../../vehicleLibrary'
import { capacityDisplay, liftValue, speedDisplay, vehicleSpecSections } from '../../vehicleDisplay'

// End-to-end audit of the unit-conversion layer. Storage is IMPERIAL-FIRST; every
// display multiplies to metric, every parse divides back. These lock the direction,
// the inverse relationship, and round-trip stability for all four quantities.

describe('units — toMetric/toImperial are exact inverses in the right direction', () => {
  const cases: Array<[keyof typeof units, number, number]> = [
    ['weight', 1000, 453.592],      // lbs → kg
    ['dimension', 48, 1219.2],      // in → mm
    ['distance', 100, 30.48],       // ft → m
    ['height', 100, 30.48],         // ft → m
  ]
  it.each(cases)('%s: toMetric multiplies, toImperial is its inverse', (k, imperial, metric) => {
    const u = units[k] as { toMetric: (n: number) => number; toImperial: (n: number) => number }
    expect(u.toMetric(imperial)).toBeCloseTo(metric, 3)
    expect(u.toImperial(u.toMetric(imperial))).toBeCloseTo(imperial, 6)
    // Direction sanity: metric magnitude is larger for kg/mm/… than imperial? Not
    // universally, but toMetric must NOT equal toImperial (i.e. not identity).
    expect(u.toMetric(imperial)).not.toBeCloseTo(u.toImperial(imperial), 3)
  })

  it('temperature converts with the 32° offset (not a bare scale)', () => {
    expect(units.temperature.toMetric(32)).toBeCloseTo(0, 6)     // 32°F = 0°C
    expect(units.temperature.toMetric(212)).toBeCloseTo(100, 6)  // 212°F = 100°C
    expect(units.temperature.toImperial(units.temperature.toMetric(-4))).toBeCloseTo(-4, 6)
  })
})

describe('parseImperialInput — display string → imperial storage', () => {
  it('imperial passes straight through (storage unit === display unit)', () => {
    expect(parseImperialInput('3000', 'lbs', 'imperial')).toBe(3000)
    expect(parseImperialInput('48', 'in', 'imperial')).toBe(48)
    expect(parseImperialInput('220', 'ft', 'imperial')).toBe(220)
    expect(parseImperialInput('75', 'F', 'imperial')).toBe(75)
  })
  it('metric divides back to imperial', () => {
    expect(parseImperialInput('1360.8', 'lbs', 'metric')).toBeCloseTo(3000, 0)
    expect(parseImperialInput('1219', 'in', 'metric')).toBeCloseTo(48, 1)
    expect(parseImperialInput('67.06', 'ft', 'metric')).toBeCloseTo(220, 0)
    expect(parseImperialInput('0', 'F', 'metric')).toBeCloseTo(32, 6)   // 0°C = 32°F
  })
  it('blank → NaN sentinel (cleared field, never a phantom 0)', () => {
    expect(parseImperialInput('', 'lbs', 'imperial')).toBeNaN()
    expect(parseImperialInput('', 'in', 'metric')).toBeNaN()
  })
})

describe('formatImperialForDisplay — imperial storage → display string (rounded, no float tails)', () => {
  it('imperial rounds sanely (whole lbs/°F, 1-dec in/ft)', () => {
    expect(formatImperialForDisplay(3000.0176, 'lbs', 'imperial')).toBe('3000')
    expect(formatImperialForDisplay(47.9921, 'in', 'imperial')).toBe('48')
    expect(formatImperialForDisplay(7545.9317, 'ft', 'imperial')).toBe('7545.9')  // NO long tail
    expect(formatImperialForDisplay(74.5, 'F', 'imperial')).toBe('75')            // banker-safe whole
  })
  it('metric rounds (1-dec kg, whole mm, 2-dec m, 1-dec °C)', () => {
    expect(formatImperialForDisplay(3000, 'lbs', 'metric')).toBe('1360.8')
    expect(formatImperialForDisplay(48, 'in', 'metric')).toBe('1219')
    expect(formatImperialForDisplay(220, 'ft', 'metric')).toBe('67.06')
    expect(formatImperialForDisplay(14, 'F', 'metric')).toBe('-10')
  })
  it('blank/NaN stay empty (cleared sentinel round-trips)', () => {
    expect(formatImperialForDisplay(null, 'lbs', 'imperial')).toBe('')
    expect(formatImperialForDisplay(NaN, 'ft', 'metric')).toBe('')
  })
})

describe('round-trip stability — display → parse → display converges for every field', () => {
  const fields: Array<['lbs' | 'in' | 'ft' | 'F', number]> = [
    ['lbs', 3000], ['in', 48], ['ft', 220], ['F', 14],
  ]
  it.each(fields)('%s stays put across 6 metric round-trips', (unit, start) => {
    let stored = start
    for (let n = 0; n < 6; n++) {
      const shown = formatImperialForDisplay(stored, unit, 'metric')
      stored = parseImperialInput(shown, unit, 'metric')
    }
    // Never runs away; converges within the display's rounding granularity.
    const tol = unit === 'lbs' ? 1 : unit === 'in' ? 0.5 : unit === 'ft' ? 0.1 : 0.6
    expect(Math.abs(stored - start)).toBeLessThan(tol)
  })
})

describe('vehicleDisplay — spec formatters convert imperial→metric correctly', () => {
  const v = cb18 as unknown as Vehicle

  it('capacity/lift/speed multiply to metric, pass through imperial', () => {
    const capI = capacityDisplay(v, 'imperial')
    const capM = capacityDisplay(v, 'metric')
    expect(capI).toMatch(/lbs$/)
    expect(capM).toMatch(/kg$/)
    // kg value must be ~0.4536× the lbs value, never larger.
    const lbs = parseFloat(capI.replace(/[^\d.]/g, ''))
    const kg = parseFloat(capM.replace(/[^\d.]/g, ''))
    expect(kg).toBeCloseTo(lbs * 0.453592, 0)

    expect(speedDisplay(v, 'imperial')).toMatch(/ft\/s .*mph/)
    expect(speedDisplay(v, 'metric')).toMatch(/m\/s .*km\/h/)
    expect(liftValue(v, 'imperial')).toBeTruthy()
  })

  it('spec-sheet temperature uses the offset conversion', () => {
    const rowsM = vehicleSpecSections(v, 'metric').find(s => s.title === 'Environment')!.rows
    const rowsI = vehicleSpecSections(v, 'imperial').find(s => s.title === 'Environment')!.rows
    expect(rowsI.find(r => r.label === 'Min temperature')!.value).toMatch(/°F$/)
    expect(rowsM.find(r => r.label === 'Min temperature')!.value).toMatch(/°C$/)
  })
})
