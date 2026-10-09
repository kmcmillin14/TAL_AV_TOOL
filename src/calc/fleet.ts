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
 *  Display-only: the math treats every vehicle identically ("charges whenever
 *  it is not working"). Every platform is opportunity-charged (owner, 2026-10-09). */
export function defaultChargeMethod(chargerType?: ChargerType): ChargeMethod {
  return chargerType === 'opportunity' ? 'opportunity' : 'plugged'
}

/** Default charge regime when the project never chose one: a schedule covering
 *  the full day has no overnight charge window, so 24 h/day → 'continuous'.
 *  A derived DEFAULT, never a lock — an explicit project chargeRegime wins. */
export function defaultChargeRegime(dailyOpHr: number): ChargeRegime {
  return dailyOpHr >= 24 ? 'continuous' : 'overnight'
}

export interface BatterySpec {
  /** Nominal pack voltage (V) and rated capacity (Ah). */
  voltageV: number
  ratedAh: number
  /** Share of rated capacity actually usable (%), per platform. */
  usableCapacityPct: number
  /** Average power the vehicle draws while working (kW). */
  avgPowerDrawKw: number
  /** Charger output (kW). */
  chargerPowerKw: number
}

export interface AvailabilityResult {
  /** Share of the staffed window one vehicle can be WORKING, ∈ (0,1]. */
  availability: number
  /** Steady-state duty ratio = charge/(charge+draw) — the floor once the start
   *  charge is spent, and the whole answer at 24/7. Capacity cancels out of it. */
  dutyRatio: number
  /** Fraction of a full charge the off-shift window delivers: 1 with a long
   *  off-shift, 0 at 24/7. */
  offShiftCharge: number
  /** Derived, carried for display and for the cycles/year figure. */
  runTimeHr: number
  chargeHr: number
  usableKwh: number
}

/**
 * Charging availability for one vehicle type — the whole charging model
 * (v4, 2026-10-09). Built from PHYSICAL inputs, not from hours figures:
 *
 *   usable = V × Ah / 1000 × usable%
 *   R  = usable / draw            Ch = usable / charge
 *   d  = charge / (charge + draw)           duty ratio — capacity CANCELS
 *   z  = min(1, (24 − H) / Ch)              what the off-shift refills
 *   A  = min(1, [z·R + (H − z·R)·d] / H)
 *
 * A vehicle starts the staffed window on whatever the off-shift could put in
 * it, works that off, then settles into its duty ratio. At H = 24 there is no
 * off-shift, z = 0, and A collapses to exactly d — so this ONE expression
 * covers both regimes v3 split across `aCap` and `aEnergy`.
 *
 * `d` is written as the current ratio directly so the cancellation is visible,
 * and so the floor stays exact even when capacity or usable% is wrong. That is
 * the model's robustness: the number dominating 24/7 sizing needs only two
 * currents, both easy to measure.
 *
 * `A` is the duration-weighted AVERAGE over the window, correct only because
 * charging is staggered across the fleet (owner decision, paired with one
 * charger per vehicle). If vehicles ever charge in lockstep the honest figure
 * is the bare `dutyRatio` — 11–16% more fleet — so it is returned and displayed
 * rather than hidden.
 *
 * Replaced in v4: `aEnergy` (provably dominated — `aEnergy = d × (24 + Ch/C)/H ≥ d`
 * for all H ≤ 24, so it could only bind when the break credit inflated `aCap`
 * past `d`), and the break credit itself (`breakHrs × R/Ch`, uncapped — it
 * handed ml2 forty hours of runtime on a twenty-four hour day).
 *
 * @returns null when any input is missing or non-positive (display "—", never NaN)
 */
export function chargingAvailability(
  battery: BatterySpec,
  staffedHr: number,
): AvailabilityResult | null {
  const { voltageV, ratedAh, usableCapacityPct, avgPowerDrawKw, chargerPowerKw } = battery
  if (!(voltageV > 0) || !(ratedAh > 0)) return null
  if (!(usableCapacityPct > 0)) return null
  if (!(avgPowerDrawKw > 0) || !(chargerPowerKw > 0)) return null
  if (!(staffedHr > 0)) return null

  const usableKwh = (voltageV * ratedAh / 1000) * (usableCapacityPct / 100)
  const runTimeHr = usableKwh / avgPowerDrawKw
  const chargeHr = usableKwh / chargerPowerKw
  const dutyRatio = chargerPowerKw / (chargerPowerKw + avgPowerDrawKw)

  const offShiftCharge = Math.min(1, Math.max(0, 24 - staffedHr) / chargeHr)
  const freeHr = offShiftCharge * runTimeHr
  const worked = Math.min(staffedHr, freeHr + Math.max(0, staffedHr - freeHr) * dutyRatio)
  return {
    availability: Math.min(1, worked / staffedHr),
    dutyRatio, offShiftCharge, runTimeHr, chargeHr, usableKwh,
  }
}

export interface ChargingInput {
  battery: BatterySpec
  method: ChargeMethod        // display only (carried onto ChargingResult)
  staffedHr: number           // H — clock hours/day the operation is staffed
}

/** Wrap `chargingAvailability` with the display fields the UI needs. */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    dutyRatio: null, offShiftCharge: null, usableKwh: null, sustainable: false, reason,
  })
  const b = i.battery
  if (!(b?.voltageV > 0) || !(b?.ratedAh > 0)) return invalid('Missing battery capacity data')
  if (!(b.usableCapacityPct > 0)) return invalid('Missing usable-capacity data')
  if (!(b.avgPowerDrawKw > 0)) return invalid('Missing average draw data')
  if (!(b.chargerPowerKw > 0)) return invalid('Missing charge input data')
  if (!(i.staffedHr > 0)) return invalid('No production hours')

  const a = chargingAvailability(b, i.staffedHr)
  if (!a || !(a.availability > 0)) return invalid('Cannot determine availability')

  const pct = `${Math.round(a.availability * 100)}%`
  return {
    method: i.method,
    runHr: a.runTimeHr, chargeHr: a.chargeHr, usableKwh: a.usableKwh,
    availability: a.availability, dutyRatio: a.dutyRatio, offShiftCharge: a.offShiftCharge,
    sustainable: true,
    reason: a.availability >= 1
      ? 'The battery covers the staffed window — charging costs no vehicles'
      : `Available ${pct} of the staffed window; the rest is charging`,
  }
}

/**
 * Compose the fleet per vehicle group (v4, 2026-10-09). ONE constraint:
 *
 *   fleetSold = max(⌈raw⌉, ⌈ raw / (A · U) ⌉)
 *
 * and the reported stages are TRUE ADDENDS that sum exactly:
 *
 *   baseFleet  = ⌈raw⌉                                peak demand
 *   +charging  = max(baseFleet, ⌈raw/A⌉) − baseFleet  charging downtime
 *   +headroom  = fleetSold − fleetWithCharging        utilization policy
 *   = fleetSold
 *
 * v3 reported `base + charging` as a waterfall that did NOT sum to `fleetSold`,
 * because sold came from a separate max() of two constraints.
 *
 * Charging is costed FIRST and headroom second, deliberately. The two effects
 * have an interaction term (`raw/(A·U)` exceeds the sum of the two standalone
 * effects) and whichever stage runs second absorbs it. Putting charging first
 * makes `chargingDelta = raw(1/A − 1)` a pure platform property that does NOT
 * move when the utilization dial moves — so platforms stay comparable, and the
 * discretionary lever moves the discretionary line. Nothing is double counted:
 * one vehicle delivers A × U of work per staffed hour, so N = raw/(A·U) is a
 * definition, not a compounding.
 *
 * Groups with no base fleet are skipped. `dailyOpHr` comes from the caller
 * (Step 1 schedule) so this stays pure.
 */
export function fleetSummary(
  groups: GroupSummary[],
  vehiclesById: Map<string, Vehicle>,
  settings: FleetSettings,
): FleetSummary {
  const U = settings.targetUtilization
  const out: FleetGroup[] = []
  for (const g of groups) {
    if (g.baseFleet <= 0) continue
    const veh = vehiclesById.get(g.vehicleId)
    const method = settings.chargeMethods[g.vehicleId] ?? defaultChargeMethod(veh?.calc.chargerType)
    const charging: ChargingResult = veh
      ? chargingForGroup({
          battery: {
            voltageV: veh.calc.voltageV,
            ratedAh: veh.calc.ratedAh,
            usableCapacityPct: veh.calc.usableCapacityPct ?? 0,
            avgPowerDrawKw: veh.calc.avgPowerDrawKw ?? 0,
            chargerPowerKw: veh.calc.chargerPowerKw ?? 0,
          },
          method,
          staffedHr: settings.dailyOpHr,
        })
      : { method, runHr: null, chargeHr: null, availability: null, dutyRatio: null,
          offShiftCharge: null, usableKwh: null, sustainable: false, reason: 'Vehicle not found' }

    // No battery data → availability degrades to 1, i.e. charging costs nothing.
    // Same convention v3 used, and the data-provenance doc flags the gap.
    const A = charging.availability ?? 1
    const fleetWithCharging = Math.max(g.baseFleet, Math.ceil(g.groupRaw / A))
    const demand = g.groupRaw / (A * U)
    const fleetSold = Math.max(fleetWithCharging, Math.ceil(demand))
    out.push({
      vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet, charging,
      fleetWithCharging, demand,
      chargingDelta: fleetWithCharging - g.baseFleet,
      utilizationDelta: fleetSold - fleetWithCharging,
      fleetSold,
      binding: fleetWithCharging > g.baseFleet ? 'charging' : 'utilization',
    })
  }
  return {
    groups: out,
    totalBaseFleet: out.reduce((s, x) => s + x.baseFleet, 0),
    totalChargingDelta: out.reduce((s, x) => s + x.chargingDelta, 0),
    totalUtilizationDelta: out.reduce((s, x) => s + x.utilizationDelta, 0),
    totalFleetSold: out.reduce((s, x) => s + x.fleetSold, 0),
    targetUtilization: U,
  }
}
