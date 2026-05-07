export type UnitSystem = 'imperial' | 'metric'

export const units = {
  weight: {
    toMetric: (lbs: number) => lbs * 0.453592,
    toImperial: (kg: number) => kg / 0.453592,
    label: (s: UnitSystem) => s === 'metric' ? 'kg' : 'lbs',
    display: (lbs: number, s: UnitSystem) =>
      s === 'metric'
        ? `${(lbs * 0.453592).toFixed(1)} kg`
        : `${lbs.toFixed(1)} lbs`,
  },
  dimension: {
    toMetric: (inches: number) => inches * 25.4,
    toImperial: (mm: number) => mm / 25.4,
    label: (s: UnitSystem) => s === 'metric' ? 'mm' : 'in',
  },
  distance: {
    toMetric: (feet: number) => feet * 0.3048,
    toImperial: (m: number) => m / 0.3048,
    label: (s: UnitSystem) => s === 'metric' ? 'm' : 'ft',
  },
  temperature: {
    toMetric: (f: number) => (f - 32) * 5 / 9,
    toImperial: (c: number) => c * 9 / 5 + 32,
    label: (s: UnitSystem) => s === 'metric' ? '°C' : '°F',
  },
  height: {
    toMetric: (feet: number) => feet * 0.3048,
    toImperial: (m: number) => m / 0.3048,
    label: (s: UnitSystem) => s === 'metric' ? 'm' : 'ft',
  },
}

export function parseImperialInput(
  value: string,
  storedUnit: 'lbs' | 'in' | 'ft' | 'F',
  displaySystem: UnitSystem
): number {
  const n = parseFloat(value)
  if (isNaN(n)) return 0

  if (displaySystem === 'imperial') return n

  // Convert from metric display back to imperial storage
  switch (storedUnit) {
    case 'lbs': return n / 0.453592
    case 'in':  return n / 25.4
    case 'ft':  return n / 0.3048
    case 'F':   return n * 9 / 5 + 32
    default:    return n
  }
}

export function formatImperialForDisplay(
  value: number | null | undefined,
  storedUnit: 'lbs' | 'in' | 'ft' | 'F',
  displaySystem: UnitSystem
): string {
  if (value == null || isNaN(value)) return ''

  if (displaySystem === 'imperial') return String(value)

  switch (storedUnit) {
    case 'lbs': return String(Math.round(value * 0.453592 * 10) / 10)
    case 'in':  return String(Math.round(value * 25.4))
    case 'ft':  return String(Math.round(value * 0.3048 * 100) / 100)
    case 'F':   return String(Math.round((value - 32) * 5 / 9 * 10) / 10)
    default:    return String(value)
  }
}
