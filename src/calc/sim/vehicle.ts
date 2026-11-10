// src/calc/sim/vehicle.ts — resolve a library vehicle into a simulation profile. PURE.
// Rule: every value comes from the vehicle JSON (or its `calc.sim` block). When a value is
// missing, the stated fallback is used and a flag says so — nothing is estimated silently.

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { SimFlag, TransferOrientation, TravelEnd, VehicleSimData } from './types'

export interface BatteryProfile {
  /** SOC % lost or gained per kW over one second — from the full pack (the SOC window is % of the pack). */
  pctPerKwSec: number
  drawKw: number
  idleKw: number
  chargerKw: number
  minSocPct: number
  maxSocPct: number
  /** Go and charge below this SOC; charge until `chargeUntilPct` (spec §6.6). */
  chargeBelowPct: number
  chargeUntilPct: number
}

/** Charge when SOC falls below minSoc + this; charge until that + CHARGE_BAND (spec §6.6, editable later). */
export const CHARGE_BELOW_OVER_MIN = 10
export const CHARGE_BAND = 30

export interface VehicleProfile {
  vehicle: Vehicle
  lengthFt: number
  /** Cruise speeds actually used (already × pace when motion data is missing). */
  speedLoaded: number
  speedEmpty: number
  turnSpeed: number
  reverseSpeed: number
  accel: number | null
  decel: number | null
  approachDistanceFt: number | null
  travelDirection: 'single' | 'bi'
  preferredTravel: { loaded: TravelEnd; empty: TravelEnd }
  reorientSec: number
  battery: BatteryProfile | null
  flags: SimFlag[]
}

/** Default transfer orientation by method (spec §4.3). The vehicle JSON has no orientation
 *  field until Milestone 2, so the engine flags every flow that uses this default. */
const ORIENTATION_BY_METHOD: Record<string, TransferOrientation> = {
  Lift: 'rear', Conveyor: 'left', 'Powered Conveyor Cart': 'left', Pin: 'under',
}
export const defaultOrientation = (method: string): TransferOrientation => ORIENTATION_BY_METHOD[method] ?? 'front'

const has = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
/** A percentage where 0 is a real value (e.g. a 0% minimum SOC). */
const hasPct = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function resolveProfile(vehicle: Vehicle, sim: VehicleSimData | null | undefined, pacePct: number): VehicleProfile {
  const c = vehicle.calc
  const s = sim ?? {}
  const flags: SimFlag[] = []
  const flag = (field: string, message: string) => flags.push({ vehicleId: vehicle.id, field, message })

  const motionKnown = has(s.accelFps2) && has(s.decelFps2)
  if (!motionKnown) flag('motion', `Motion data missing — using pace ${pacePct}%`)
  const k = motionKnown ? 1 : pacePct / 100
  const speedLoaded = c.speedLoadedFps * k
  const speedEmpty = (c.speedUnloadedFps ?? c.speedLoadedFps) * k

  let lengthFt = c.lengthFt ?? 0
  if (has(s.overallLengthFt)) lengthFt = s.overallLengthFt
  else if (has(c.lengthFt)) flag('overallLengthFt', 'Overall length not specified — using body length')
  else flag('overallLengthFt', 'No length in vehicle data — following gap is the safety distance only')

  if (!has(s.turnSpeedFps)) flag('turnSpeedFps', 'Turn speed not specified in vehicle data')
  if (!has(s.reverseSpeedFps)) flag('reverseSpeedFps', 'Reverse speed not specified in vehicle data')
  if (!s.travelDirection) flag('travelDirection', 'Travel direction not specified — single')
  if (!s.preferredTravel) flag('preferredTravel', 'Preferred travel not specified — forks trailing')
  if (s.reorientSec == null) flag('reorientSec', 'Reorientation time not specified — 0 s')
  if (!has(s.approachDistanceFt)) flag('approachDistanceFt', 'Approach distance not specified — no approach phase')
  if (!s.pathRefPointFt) flag('pathRefPointFt', 'Reference point not specified — footprint centre')

  let battery: BatteryProfile | null = null
  if (has(c.voltageV) && has(c.ratedAh) && has(c.avgPowerDrawKw) && has(c.chargerPowerKw) && hasPct(c.minSocPct) && has(c.maxSocPct)) {
    if (!has(c.idlePowerDrawW)) flag('idlePowerDrawW', 'Idle draw not specified — 0')
    // The simulation tracks SOC as % of the full pack between the cutsheet's min/max SOC — a
    // different input set from the Fleet Engine's usable-capacity average, on purpose: it needs
    // the window the vehicle actually cycles in.
    const below = c.minSocPct + CHARGE_BELOW_OVER_MIN
    battery = {
      pctPerKwSec: 100 / 3600 / (c.voltageV * c.ratedAh / 1000),
      drawKw: c.avgPowerDrawKw,
      idleKw: has(c.idlePowerDrawW) ? c.idlePowerDrawW / 1000 : 0,
      chargerKw: c.chargerPowerKw,
      minSocPct: c.minSocPct,
      maxSocPct: c.maxSocPct,
      chargeBelowPct: below,
      chargeUntilPct: Math.min(below + CHARGE_BAND, c.maxSocPct),
    }
  } else flag('battery', 'Battery data incomplete — charging off')
  if (c.batterySpecProvisional) flag('batterySpecProvisional', 'Battery data is provisional')

  return {
    vehicle,
    lengthFt,
    speedLoaded, speedEmpty,
    turnSpeed: has(s.turnSpeedFps) ? s.turnSpeedFps : speedLoaded,
    reverseSpeed: has(s.reverseSpeedFps) ? s.reverseSpeedFps : speedLoaded,
    accel: motionKnown ? s.accelFps2! : null,
    decel: motionKnown ? s.decelFps2! : null,
    approachDistanceFt: has(s.approachDistanceFt) ? s.approachDistanceFt : null,
    travelDirection: s.travelDirection ?? 'single',
    preferredTravel: s.preferredTravel ?? { loaded: 'forksTrailing', empty: 'forksTrailing' },
    reorientSec: s.reorientSec ?? 0,
    battery, flags,
  }
}
