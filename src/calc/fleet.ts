// Fleet Engine — charging delta + buffer → fleet sold. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only imports of Vehicle, as
// in flowMetrics.ts, carry no runtime dependency.)

import { DEFAULT_DOD, CHARGE_EFFICIENCY } from './types'
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
  method: ChargeMethod        // display only (carried onto ChargingResult)
  hProd: number               // productive hrs/day = min(24, shifts×hours) − breakHrs
  breakHrs: number            // total break hours/day
  consecutiveOpDays: number   // C — Infinity when all 7 days operate
}

/**
 * Extra vehicles to cover battery charging downtime for one vehicle type, via an
 * availability ratio A = min(A_energy, A_cap) (see the 2026-06-25 charging-model-v2 spec).
 *
 *   usableAh   = ratedAh × DOD ;  runHr = usableAh/dischargeA ;  chargeHr = usableAh/chargeRate
 *   A_energy   = min(1, ((C finite ? usableAh/C : 0) + 24·chargeRate) / (H·(dischargeA + chargeRate)))
 *                — credits nightly off-shift + the day-off reset
 *   A_cap      = runHrEff ≥ H ? 1 : runHrEff/(runHrEff + chargeHr)   — within-window capacity
 *   delta      = max(0, ⌈groupRaw / min(A_energy, A_cap)⌉ − baseFleet)
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.ratedAh > 0) || !(i.dischargeA > 0)) return invalid('Missing battery / discharge data')

  const usableAh = i.ratedAh * DEFAULT_DOD
  // Nameplate charge rate, derated for real-world efficiency (round-trip loss, CV
  // taper near full, charger-access overhead). A safety margin, like DOD.
  const nameplateChargeRate = i.chargeTimeMin && i.chargeTimeMin > 0
    ? usableAh / (i.chargeTimeMin / 60)
    : i.chargeA
  if (!(nameplateChargeRate > 0)) return invalid('Missing charge data')
  const chargeRate = nameplateChargeRate * CHARGE_EFFICIENCY
  const H = i.hProd
  if (!(H > 0)) return invalid('No production hours')

  const runHr = usableAh / i.dischargeA
  const chargeHr = usableAh / chargeRate
  const breakAh = chargeRate * Math.max(0, i.breakHrs)
  const runHrEff = (usableAh + breakAh) / i.dischargeA

  const weekendTerm = Number.isFinite(i.consecutiveOpDays) && i.consecutiveOpDays > 0
    ? usableAh / i.consecutiveOpDays
    : 0
  const aEnergy = Math.min(1, (weekendTerm + 24 * chargeRate) / (H * (i.dischargeA + chargeRate)))
  const aCap = runHrEff >= H ? 1 : runHrEff / (runHrEff + chargeHr)

  const A = Math.min(aEnergy, aCap)
  if (!(A > 0)) return invalid('Cannot determine availability')

  const fleetWithCharging = Math.ceil(i.groupRaw / A)
  const chargingDelta = Math.max(0, fleetWithCharging - i.baseFleet)
  const pct = `${Math.round(A * 100)}%`
  return {
    method: i.method, runHr, chargeHr, availability: A, aEnergy, aCap, chargingDelta, sustainable: true,
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
          hProd: Math.max(0, settings.dailyOpHr - settings.breakHrs),
          breakHrs: settings.breakHrs,
          consecutiveOpDays: settings.consecutiveOpDays,
        })
      : { method, runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }

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
