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

/** Battery — `25.6 kWh · 533 Ah`. */
export function batteryDisplay(v: Vehicle): string {
  const kwh = (v.calc.ratedAh * v.calc.voltageV / 1000).toFixed(1)
  return `${kwh} kWh · ${v.calc.ratedAh} Ah`
}

/** Charge time + charger type — `90 min (opp)`; `—` when unspecified. */
export function chargeDisplay(v: Vehicle): string {
  const min = v.calc.chargeTimeMin ?? null
  if (min == null) return '—'
  const label = v.calc.chargerType === 'opportunity' ? 'opp'
    : v.calc.chargerType === 'shift_swap' ? 'swap'
    : v.calc.chargerType ?? '—'
  return `${min} min (${label})`
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
