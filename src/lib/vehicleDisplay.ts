/**
 * Pure display formatters for vehicle specs, shared by the Step 2 card
 * (`VehicleCard`) and the comparison modal (`ComparisonModal`) so both render
 * identical strings. No React, no I/O — formatting only.
 */
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import { LIFT_CLASS_LABEL } from '@/src/calc/gates'

/** Max weight capacity — `4,000 lbs` imperial / `1,814 kg` metric. */
export function capacityDisplay(v: Vehicle, unit: UnitSystem): string {
  return unit === 'metric'
    ? `${units.weight.toMetric(v.calc.maxWeightLbs).toFixed(0)} kg`
    : `${v.calc.maxWeightLbs.toLocaleString()} lbs`
}

/** Card "Lift" row value — the vehicle's vertical-transfer class by name, with
 *  the forklift's reach appended (e.g. `Forklift · 14.7 ft`). */
export function liftValue(v: Vehicle, unit: UnitSystem): string {
  switch (v.calc.liftClass) {
    case 'forklift': {
      const ft = v.calc.maxLiftHeightFt
      if (ft == null) return 'Forklift'
      const reach = unit === 'metric' ? `${units.distance.toMetric(ft).toFixed(1)} m` : `${ft} ft`
      return `Forklift · ${reach}`
    }
    case 'lift_table': return 'Lift table'
    case 'floor': return 'Floor-to-floor'
  }
}

/** Loaded travel speed in dual units — `9.84 ft/s (6.7 mph)` / `3.00 m/s (10.8 km/h)`. */
export function speedDisplay(v: Vehicle, unit: UnitSystem): string {
  const fps = v.calc.speedLoadedFps
  return unit === 'metric'
    ? `${units.distance.toMetric(fps).toFixed(2)} m/s (${(fps * 1.09728).toFixed(1)} km/h)`
    : `${fps.toFixed(2)} ft/s (${(fps * 0.68182).toFixed(1)} mph)`
}

/** Battery — `533 Ah`. */
export function batteryDisplay(v: Vehicle): string {
  return `${v.calc.ratedAh} Ah`
}

/** Battery life per charge — the cutsheet runtime, verbatim. */
export function batteryLifeDisplay(v: Vehicle): string {
  const rt = v.calc.runTimeHr
  return rt && rt > 0 ? `${rt.toFixed(1)} h` : '—'
}

/** Transfer methods joined — `Conveyor / Lift / Pin`. */
export function transferDisplay(v: Vehicle): string {
  return v.transferMethods.map(m => m.method).join(' / ')
}

/** Payload types joined — `Standard Pallet, Rack, IBC`. */
export function payloadsDisplay(v: Vehicle): string {
  return v.payloadTypes.join(', ')
}

// ── Full spec sheet (shared by VehicleSpecSheet + ComparisonModal) ──────────

export interface SpecRow {
  label: string
  value: string
  /** When present, the comparison modal ranks this row across vehicles and marks
   *  the winner(s). `num` is the comparable magnitude; `better` is the direction. */
  compare?: { num: number; better: 'higher' | 'lower' }
}
export interface SpecSection { title: string; rows: SpecRow[] }

/** Build a `compare` descriptor, or undefined when the magnitude is missing. */
const cmp = (num: number | null | undefined, better: 'higher' | 'lower') =>
  num == null || !Number.isFinite(num) ? undefined : { num, better }

const lbsToKg = (lbs: number) => Math.round(units.weight.toMetric(lbs))
const ftToM = (ft: number) => +units.distance.toMetric(ft).toFixed(1)
const inToMm = (i: number) => Math.round(units.dimension.toMetric(i))
const fToC = (f: number) => Math.round(units.temperature.toMetric(f))
const fpsToMps = (fps: number) => +units.distance.toMetric(fps).toFixed(1)
/** Compact USD: "$1.25M" / "$50K" / "$500". Shared by the spec sheet and the
 *  PPTX/ROM exporters. */
export const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${n.toLocaleString()}`

const DASH = '—'
const orDash = (s: string | null | undefined) => (s == null || s === '' ? DASH : s)

/**
 * The complete technical spec sheet as fixed, aligned sections/rows — every
 * vehicle yields the same labels in the same order, so the comparison modal can
 * render them as columns and the back-of-card sheet as sections. Single-unit
 * formatting (imperial or metric) per the active system.
 */
export function vehicleSpecSections(v: Vehicle, unit: UnitSystem): SpecSection[] {
  const metric = unit === 'metric'
  const { calc, specs, display, transferMethods, payloadTypes } = v

  const len = (ft: number | null | undefined) =>
    ft == null ? DASH : metric ? `${ftToM(ft)} m` : `${ft} ft`
  const loadDim = (inch: number | null | undefined) =>
    inch == null ? DASH : metric ? `${inToMm(inch)} mm` : `${inch} in`
  const speed = (fps: number | null | undefined) =>
    fps == null ? DASH : metric ? `${fpsToMps(fps)} m/s` : `${fps} ft/s`

  return [
    {
      title: 'Physical',
      rows: [
        { label: 'Width', value: len(calc.widthFt) },
        { label: 'Length', value: len(calc.lengthFt) },
        { label: 'Height', value: len(calc.heightFt) },
        { label: 'Turning radius', value: len(calc.turningRadiusFt), compare: cmp(calc.turningRadiusFt, 'lower') },
      ],
    },
    {
      title: 'Load Capacity',
      rows: [
        { label: 'Max payload', value: metric ? `${lbsToKg(calc.maxWeightLbs)} kg` : `${calc.maxWeightLbs.toLocaleString()} lbs`, compare: cmp(calc.maxWeightLbs, 'higher') },
        { label: 'Lift type', value: LIFT_CLASS_LABEL[calc.liftClass] },
        { label: 'Max lift height', value: calc.liftClass === 'forklift' && calc.maxLiftHeightFt != null ? len(calc.maxLiftHeightFt) : '—', compare: cmp(calc.liftClass === 'forklift' ? calc.maxLiftHeightFt : null, 'higher') },
        { label: 'Max load length', value: loadDim(calc.maxLoadLengthIn) },
        { label: 'Max load width', value: loadDim(calc.maxLoadWidthIn) },
        { label: 'Max load height', value: loadDim(calc.maxLoadHeightIn) },
        { label: 'Payload types', value: orDash(payloadTypes.join(', ')) },
      ],
    },
    {
      title: 'Performance',
      rows: [
        { label: 'Speed (loaded)', value: speed(calc.speedLoadedFps), compare: cmp(calc.speedLoadedFps, 'higher') },
        { label: 'Speed (unloaded)', value: speed(calc.speedUnloadedFps), compare: cmp(calc.speedUnloadedFps, 'higher') },
        { label: 'Max ramp grade', value: `${specs.maxRampGrade}%`, compare: cmp(specs.maxRampGrade, 'higher') },
      ],
    },
    {
      title: 'Power & Charging',
      rows: [
        { label: 'Battery', value: `${calc.ratedAh} Ah @ ${calc.voltageV} V (${((calc.voltageV * calc.ratedAh) / 1000).toFixed(1)} kWh)` },
        { label: 'Battery life', value: batteryLifeDisplay(v), compare: cmp(calc.runTimeHr ?? null, 'higher') },
        { label: 'Charge time', value: calc.chargeTimeMin == null ? DASH : `${calc.chargeTimeMin} min`, compare: cmp(calc.chargeTimeMin, 'lower') },
        { label: 'Charging strategy', value: orDash(calc.chargerType) },
      ],
    },
    {
      title: 'Environment',
      rows: [
        { label: 'Min temperature', value: metric ? `${fToC(specs.tempMinF)}°C` : `${specs.tempMinF}°F` },
        { label: 'Max temperature', value: metric ? `${fToC(specs.tempMaxF)}°C` : `${specs.tempMaxF}°F` },
        { label: 'Outdoor capable', value: specs.outdoorCapable ? 'Yes' : 'No' },
        { label: 'Freezer capable', value: specs.freezerCapable ? 'Yes' : 'No' },
      ],
    },
    {
      title: 'Software & Navigation',
      rows: [
        { label: 'Fleet software', value: orDash(display.fleetSoftware) },
        { label: 'Navigation', value: orDash(display.navigationType) },
        { label: 'T-Hive enabled', value: display.tHive ? 'Yes' : 'No' },
      ],
    },
    {
      title: 'Transfer',
      rows: [
        { label: 'Methods', value: orDash(transferMethods.map(m => m.method).join(', ')) },
        { label: 'Load / unload', value: orDash(transferMethods.map(m => `${m.method} ${m.loadTimeSec}/${m.unloadTimeSec}s`).join(' · ')) },
      ],
    },
    {
      title: 'Compliance',
      rows: [
        { label: 'Certifications', value: specs.certifications.join(', ') || 'None listed' },
      ],
    },
    {
      title: 'Commercial',
      rows: [
        { label: 'Price range', value: `${money(calc.priceRange.minUsd)} – ${money(calc.priceRange.maxUsd)}`, compare: cmp((calc.priceRange.minUsd + calc.priceRange.maxUsd) / 2, 'lower') },
      ],
    },
  ]
}
