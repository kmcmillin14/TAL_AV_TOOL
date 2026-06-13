/**
 * Pure display formatters for vehicle specs, shared by the Step 2 card
 * (`VehicleCard`) and the comparison modal (`ComparisonModal`) so both render
 * identical strings. No React, no I/O — formatting only.
 */
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'

/** Max weight capacity — `4,000 lbs` imperial / `1,814 kg` metric. */
export function capacityDisplay(v: Vehicle, unit: UnitSystem): string {
  return unit === 'metric'
    ? `${(v.calc.maxWeightLbs * 0.453592).toFixed(0)} kg`
    : `${v.calc.maxWeightLbs.toLocaleString()} lbs`
}

/** True when the vehicle has a real lift height (not a floor-only tugger). */
export function canLift(v: Vehicle): boolean {
  const ft = v.calc.maxLiftHeightFt
  return ft != null && ft > 0
}

/** Max lift height — `14.67 ft` / `4.5 m`; `—` for floor-only vehicles. */
export function liftDisplay(v: Vehicle, unit: UnitSystem): string {
  if (!canLift(v)) return '—'
  const ft = v.calc.maxLiftHeightFt as number
  return unit === 'metric' ? `${(ft * 0.3048).toFixed(1)} m` : `${ft} ft`
}

/** Max ramp grade — `5%`. */
export function rampDisplay(v: Vehicle): string {
  return `${v.specs.maxRampGrade}%`
}

/** Loaded travel speed in dual units — `9.84 ft/s (6.7 mph)` / `3.00 m/s (10.8 km/h)`. */
export function speedDisplay(v: Vehicle, unit: UnitSystem): string {
  const fps = v.calc.speedLoadedFps
  return unit === 'metric'
    ? `${(fps * 0.3048).toFixed(2)} m/s (${(fps * 1.09728).toFixed(1)} km/h)`
    : `${fps.toFixed(2)} ft/s (${(fps * 0.68182).toFixed(1)} mph)`
}

/** Battery — `533 Ah`. */
export function batteryDisplay(v: Vehicle): string {
  return `${v.calc.ratedAh} Ah`
}

/** Conservative usable depth-of-discharge for AGV/AMR batteries. The low end of
 *  the runtime range protects battery life; the high end is full discharge. */
const USABLE_DOD = 0.8

/**
 * Estimated battery life (runtime) per charge as a range, in hours.
 * `runtime_h = ratedAh × DoD / dischargeA` (per VehicleCalc docs). Low end uses
 * the conservative usable DoD, high end uses full charge — e.g. `8.5–10.7 hrs`.
 */
export function batteryLifeDisplay(v: Vehicle): string {
  const { ratedAh, dischargeA } = v.calc
  if (!dischargeA || dischargeA <= 0) return '—'
  const low = (ratedAh * USABLE_DOD) / dischargeA
  const high = ratedAh / dischargeA
  const fmt = (h: number) => (h >= 10 ? h.toFixed(0) : h.toFixed(1))
  return `${fmt(low)}–${fmt(high)} hrs`
}

/** Transfer methods joined — `Conveyor / Lift / Pin`. */
export function transferDisplay(v: Vehicle): string {
  return v.transferMethods.map(m => m.method).join(' / ')
}

/** Payload types joined — `Standard Pallet, Rack, IBC`. */
export function payloadsDisplay(v: Vehicle): string {
  return v.payloadTypes.join(', ')
}

/** Row label for the contextual lift/ramp slot used on the card. */
export function liftOrRampLabel(v: Vehicle): string {
  return canLift(v) ? 'Max Lift' : 'Max Ramp'
}

/** Row value for the contextual lift/ramp slot used on the card. */
export function liftOrRampDisplay(v: Vehicle, unit: UnitSystem): string {
  return canLift(v) ? liftDisplay(v, unit) : rampDisplay(v)
}

// ── Full spec sheet (shared by VehicleSpecSheet + ComparisonModal) ──────────

export interface SpecRow { label: string; value: string }
export interface SpecSection { title: string; rows: SpecRow[] }

const lbsToKg = (lbs: number) => Math.round(lbs * 0.453592)
const ftToM = (ft: number) => +(ft * 0.3048).toFixed(1)
const inToMm = (i: number) => Math.round(i * 25.4)
const fToC = (f: number) => Math.round(((f - 32) * 5) / 9)
const fpsToMps = (fps: number) => +(fps * 0.3048).toFixed(1)
const money = (n: number) =>
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
        { label: 'Turning radius', value: len(calc.turningRadiusFt) },
      ],
    },
    {
      title: 'Load Capacity',
      rows: [
        { label: 'Max payload', value: metric ? `${lbsToKg(calc.maxWeightLbs)} kg` : `${calc.maxWeightLbs.toLocaleString()} lbs` },
        { label: 'Max lift height', value: calc.maxLiftHeightFt == null ? 'None (non-lifting)' : len(calc.maxLiftHeightFt) },
        { label: 'Max load length', value: loadDim(calc.maxLoadLengthIn) },
        { label: 'Max load width', value: loadDim(calc.maxLoadWidthIn) },
        { label: 'Max load height', value: loadDim(calc.maxLoadHeightIn) },
        { label: 'Payload types', value: orDash(payloadTypes.join(', ')) },
      ],
    },
    {
      title: 'Performance',
      rows: [
        { label: 'Speed (loaded)', value: speed(calc.speedLoadedFps) },
        { label: 'Speed (unloaded)', value: speed(calc.speedUnloadedFps) },
        { label: 'Max ramp grade', value: `${specs.maxRampGrade}%` },
      ],
    },
    {
      title: 'Power & Charging',
      rows: [
        { label: 'Battery', value: `${calc.ratedAh} Ah @ ${calc.voltageV} V (${((calc.voltageV * calc.ratedAh) / 1000).toFixed(1)} kWh)` },
        { label: 'Battery life', value: batteryLifeDisplay(v) },
        { label: 'Discharge (operating)', value: `${calc.dischargeA} A` },
        { label: 'Charge current', value: `${calc.chargeA} A` },
        { label: 'Charge time', value: calc.chargeTimeMin == null ? DASH : `${calc.chargeTimeMin} min` },
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
        { label: 'Price range', value: `${money(calc.priceRange.minUsd)} – ${money(calc.priceRange.maxUsd)}` },
      ],
    },
  ]
}
