// Fleet Engine — charging availability + buffer composition → fleet sold. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only imports of Vehicle, as
// in flowMetrics.ts, carry no runtime dependency.)

import type {
  ChargeMethod,
  ChargeRegime,
  ChargingResult,
  FleetBinding,
  FleetGroup,
  FleetSettings,
  FleetSummary,
  GroupSummary,
} from './types'
import type { ChargerType, Vehicle } from '@/src/lib/vehicleLibrary'

/** Map a vehicle's spec'd charger type to the two-value engine model.
 *  Display-only: the v3 math treats every vehicle identically ("charges
 *  whenever it is not working"). */
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
  runTimeHr: number           // hours of operation per full charge (cutsheet)
  chargeTimeMin?: number      // minutes to a full recharge (cutsheet)
  method: ChargeMethod        // display only (carried onto ChargingResult)
  hProd: number               // productive hrs/day = min(24, shifts×hours) − breakHrs
  breakHrs: number            // total break hours/day
  consecutiveOpDays: number   // C — Infinity when all 7 days operate
}

/**
 * Charging availability for one vehicle type, in cutsheet hours (see the
 * 2026-07-18 charging-model-v3 spec — the v2 amp form cancels to this):
 *
 *   chargeHr  = chargeTimeMin/60
 *   runHrEff  = runTimeHr + breaks·(runTimeHr/chargeHr)          breaks credit
 *   A_cap     = runHrEff ≥ H ? 1 : runHrEff/(runHrEff+chargeHr)  rotation ratio
 *   A_energy  = min(1, (24 + chargeHr/C) / (H·(1 + chargeHr/runTimeHr)))
 *               — daily charge capacity ÷ daily charge demand in hours form (credits every non-working hour, incl. off-shift; day-off reset = chargeHr/C)
 *
 * No DOD or charge-efficiency derates: measured cutsheet hours already contain
 * them. A vehicle charges whenever it is not working (uniform for opportunity
 * and plugged — method is display-only).
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.runTimeHr > 0)) return invalid('Missing battery runtime data')
  const chargeHr = i.chargeTimeMin != null && i.chargeTimeMin > 0 ? i.chargeTimeMin / 60 : 0
  if (!(chargeHr > 0)) return invalid('Missing charge time data')
  const H = i.hProd
  if (!(H > 0)) return invalid('No production hours')

  const runHr = i.runTimeHr
  const runHrEff = runHr + Math.max(0, i.breakHrs) * (runHr / chargeHr)
  const weekendTerm = Number.isFinite(i.consecutiveOpDays) && i.consecutiveOpDays > 0
    ? chargeHr / i.consecutiveOpDays
    : 0
  const aEnergy = Math.min(1, (24 + weekendTerm) / (H * (1 + chargeHr / runHr)))
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
 * Compose the waterfall per vehicle group. Base and charging remain the
 * reported stages; the SOLD count pays the LARGER of the two constraints,
 * with one ceil at the end (2026-07-18 v3 — energy scales with average work,
 * so the buffer must not multiply it; rotation is instantaneous, so it must):
 *
 *   fleetSold = max(baseFleet, ⌈max(groupRaw/A_energy, groupRaw·(1+buffer)/A_cap)⌉)
 *
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
          runTimeHr: veh.calc.runTimeHr,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          hProd: Math.max(0, settings.dailyOpHr - settings.breakHrs),
          breakHrs: settings.breakHrs,
          consecutiveOpDays: settings.consecutiveOpDays,
        })
      : { method, runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }

    const fleetWithCharging = g.baseFleet + charging.chargingDelta
    let fleetSold: number
    let binding: FleetBinding
    if (charging.aEnergy != null && charging.aCap != null) {
      const demandEnergy = g.groupRaw / charging.aEnergy
      const demandRotation = (g.groupRaw * (1 + settings.bufferPct)) / charging.aCap
      fleetSold = Math.max(g.baseFleet, Math.ceil(Math.max(demandEnergy, demandRotation)))
      binding = demandRotation >= demandEnergy
        ? (charging.aCap < 1 ? 'rotation' : 'utilization')
        : 'energy'
    } else {
      // No battery data — utilization headroom is the only sizing constraint.
      fleetSold = Math.max(g.baseFleet, Math.ceil(g.groupRaw * (1 + settings.bufferPct)))
      binding = 'utilization'
    }
    out.push({ vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet, charging, fleetWithCharging, fleetSold, binding })
  }
  return {
    groups: out,
    totalBaseFleet: out.reduce((s, x) => s + x.baseFleet, 0),
    totalChargingDelta: out.reduce((s, x) => s + x.charging.chargingDelta, 0),
    totalFleetSold: out.reduce((s, x) => s + x.fleetSold, 0),
    bufferPct: settings.bufferPct,
  }
}
