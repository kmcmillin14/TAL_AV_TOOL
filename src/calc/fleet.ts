// Fleet Engine — charging delta + buffer → fleet sold. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only imports of Vehicle, as
// in flowMetrics.ts, carry no runtime dependency.)

import { DEFAULT_DOD } from './types'
import type {
  ChargeMethod,
  ChargeRegime,
  ChargingResult,
  FleetGroup,
  FleetSettings,
  FleetSummary,
  GroupSummary,
} from './types'
import type { ChargerType, Vehicle } from '@/src/lib/vehicleLibrary'

/** Map a vehicle's spec'd charger type to the two-value engine model.
 *  Opportunity charges during idle; everything else is treated as plug-in. */
export function defaultChargeMethod(chargerType?: ChargerType): ChargeMethod {
  return chargerType === 'opportunity' ? 'opportunity' : 'plugged'
}

/** Default charge regime when the project never chose one: a schedule covering
 *  the full day has no overnight charge window, so 24 h/day → 'continuous'.
 *  A derived DEFAULT, never a lock — an explicit project chargeRegime wins. */
export function defaultChargeRegime(dailyOpHr: number): ChargeRegime {
  return dailyOpHr >= 24 ? 'continuous' : 'overnight'
}

export interface ChargingInput {
  groupRaw: number
  baseFleet: number
  ratedAh: number
  dischargeA: number
  chargeA: number
  chargeTimeMin?: number
  method: ChargeMethod
  regime: ChargeRegime
  dailyOpHr: number
}

/**
 * Extra vehicles needed to cover charging downtime for one vehicle group.
 *
 *   usableAh = ratedAh × DOD
 *   runHr    = usableAh / dischargeA          (op-hours per charge)
 *   chargeHr = chargeTimeMin/60  |  usableAh / chargeA
 *   overnight & runHr ≥ dailyOpHr → delta 0   (recharges off-shift)
 *   else  A = plugged: runHr/(runHr+chargeHr) | opportunity: chargeA/(chargeA+dischargeA)
 *         delta = max(0, ⌈groupRaw / A⌉ − baseFleet)
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.ratedAh > 0) || !(i.dischargeA > 0)) return invalid('Missing battery / discharge data')

  const usableAh = i.ratedAh * DEFAULT_DOD
  const runHr = usableAh / i.dischargeA
  const chargeHr = i.chargeTimeMin && i.chargeTimeMin > 0
    ? i.chargeTimeMin / 60
    : (i.chargeA > 0 ? usableAh / i.chargeA : null)
  if (chargeHr == null) return invalid('Missing charge data')

  // Overnight regime: a single charge lasts the operating day → charge off-shift.
  if (i.regime === 'overnight' && i.dailyOpHr > 0 && runHr >= i.dailyOpHr) {
    return {
      method: i.method, runHr, chargeHr, availability: 1,
      chargingDelta: 0, sustainable: true,
      reason: `Runtime ${runHr.toFixed(1)} h ≥ ${i.dailyOpHr} h/day — recharges overnight`,
    }
  }

  // Otherwise charging overlaps operations → availability model.
  const A = i.method === 'plugged'
    ? runHr / (runHr + chargeHr)
    : (i.chargeA > 0 ? i.chargeA / (i.chargeA + i.dischargeA) : null)
  if (A == null || !(A > 0)) return invalid('Cannot determine availability')

  const fleetWithCharging = Math.ceil(i.groupRaw / A)
  const chargingDelta = Math.max(0, fleetWithCharging - i.baseFleet)
  const pct = `${Math.round(A * 100)}%`
  return {
    method: i.method, runHr, chargeHr, availability: A, chargingDelta, sustainable: true,
    reason: chargingDelta > 0
      ? `+${chargingDelta} for charging (availability ${pct})`
      : `Charging fits within the fleet (availability ${pct})`,
  }
}

/**
 * Compose the whole waterfall per vehicle group: base → +charging → ×buffer → ⌈⌉.
 * Groups with no base fleet are skipped. `dailyOpHr` is provided by the caller
 * (Step 1 schedule) so this stays pure.
 */
export function fleetSummary(
  groups: GroupSummary[],
  vehiclesById: Map<string, Vehicle>,
  settings: FleetSettings,
): FleetSummary {
  const out: FleetGroup[] = []
  for (const g of groups) {
    if (g.baseFleet <= 0) continue
    const veh = vehiclesById.get(g.vehicleId)
    const method = settings.chargeMethods[g.vehicleId] ?? defaultChargeMethod(veh?.calc.chargerType)
    const charging: ChargingResult = veh
      ? chargingForGroup({
          groupRaw: g.groupRaw,
          baseFleet: g.baseFleet,
          ratedAh: veh.calc.ratedAh,
          dischargeA: veh.calc.dischargeA,
          chargeA: veh.calc.chargeA,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          regime: settings.regime,
          dailyOpHr: settings.dailyOpHr,
        })
      : { method, runHr: null, chargeHr: null, availability: null, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }

    const fleetWithCharging = g.baseFleet + charging.chargingDelta
    const fleetSold = Math.ceil(fleetWithCharging * (1 + settings.bufferPct))
    out.push({ vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet, charging, fleetWithCharging, fleetSold })
  }
  return {
    groups: out,
    totalBaseFleet: out.reduce((s, x) => s + x.baseFleet, 0),
    totalChargingDelta: out.reduce((s, x) => s + x.charging.chargingDelta, 0),
    totalFleetSold: out.reduce((s, x) => s + x.fleetSold, 0),
    bufferPct: settings.bufferPct,
  }
}
