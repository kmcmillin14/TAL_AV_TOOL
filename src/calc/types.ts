// Shared TypeScript types for the calculation engine
// Pure types only — no React, no I/O imports

// INCOMPLETE = qualification not finished: no hard gate fails, but at least one
// hard gate is still unanswered, so the vehicle can't be confirmed Compatible yet.
export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED' | 'INCOMPLETE'
export type Severity = 'hard' | 'soft'

/** The vertical-handling need (derived from the Step 1 transfer type):
 *  lift a load up to a height (forklift), transfer at a matched height (lift
 *  table / forklift), or floor-to-floor (any vehicle). */
export type LiftTypeNeeded = 'to_height' | 'matched_height' | 'floor'

/** Step 1 "Transfer type" — one field named by what the vehicle is. Drives both
 *  the transfer-method and lift gates via TRANSFER_TYPE_SPEC (in gates.ts). */
export type TransferType =
  | 'forklift' | 'lift_table' | 'pallet_truck' | 'conveyor' | 'tow_cart' | 'custom'

export interface GateResult {
  gateId: string                  // stable key, e.g. 'weight', 'lift_height'
  name: string                    // human label
  severity: Severity
  passed: boolean
  skipped: boolean                // true when requirement absent — gate did not run
  skipReason?: string             // 'No requirement provided'
  vehicleValue: string            // display string
  requiredValue: string           // display string
  vehicleNumeric?: number         // for sorting/ranking
  requiredNumeric?: number
  unit?: string                   // 'lbs' | 'ft' | '°F' | '%' | 'in'
  delta?: number                  // numeric headroom (vehicle - required); negative when failing
  reason: string                  // ALWAYS populated (pass, fail, or skip)
}

/** One load the application moves — evaluated independently against the 5
 *  load-coupled gates (payload type, L/W/H, weight). Matrix-evaluation only:
 *  flows never reference a load. */
export interface LoadSpec {
  loadId: string
  unitType: string
  lengthIn?: number | null
  widthIn?: number | null
  heightIn?: number | null
  /** Per-load weight; absent → the project-wide maxLoadWeightLbs applies. */
  weightLbs?: number | null
}

/** Per-load verdict for the multi-load rollup (display detail for Step 2). */
export interface LoadVerdict {
  loadId: string
  unitType: string
  passed: boolean
  /** gateIds of the load-coupled hard gates this load failed. */
  failedGates: string[]
}

export interface QualificationResult {
  status: TrafficLightStatus
  hardGates: GateResult[]
  softPreferences: GateResult[]
  /** Present when evaluated against ≥1 declared load; one entry per load. */
  perLoad?: LoadVerdict[]
}

export interface ApplicationRequirements {
  maxLoadWeightLbs: number
  typicalUnitType: string
  /** Step 1 "Transfer type" (forklift / lift table / pallet truck / conveyor / tow
   *  cart / custom). When set it is the primary driver of the transfer-method AND
   *  lift gates (see TRANSFER_TYPE_SPEC). Legacy projects leave it null and fall back
   *  to `transferMethod` + pick/drop heights below. */
  transferType?: TransferType | null
  /** The transfer height (ft) for a forklift (lift-to-height) or lift table. */
  transferHeightFt?: number | null
  /** Legacy transfer mechanism string — fallback when `transferType` is unset. */
  transferMethod: string
  deliveryPattern: string
  /** Legacy explicit lift need — fallback when `transferType` is unset. */
  liftTypeNeeded?: LiftTypeNeeded | null
  /** Legacy single "lift to" requirement — fallback when pick/drop are unset. */
  maxLiftHeightFt?: number | null
  /** Transfer heights above floor (ft). The lift gate compares the elevation
   *  change |drop − pick| and the higher of the two against the vehicle's
   *  {@link LiftClass}. Unset/0 → floor-to-floor, gate skipped. */
  pickHeightFt?: number | null
  dropHeightFt?: number | null
  minAisleWidthFt: number
  certifications?: string[]
  tempMinF?: number | null
  tempMaxF?: number | null
  /** Whether the site has any ramp. When true the ramp gate is a YELLOW review
   *  regardless of grade. Falls back to `maxRampGrade > 0` for legacy projects. */
  rampRequired?: boolean
  maxRampGrade?: number
  outdoorRequired?: boolean
  /** Legacy boolean freezer requirement — superseded by temperatureEnvironment. */
  freezerCapable?: boolean
  /** Temperature environment the application operates in. `refrigerated` is a
   *  soft (YELLOW) gate; `freezer` is a hard (RED) gate; `ambient`/unset skips. */
  temperatureEnvironment?: 'ambient' | 'refrigerated' | 'freezer'
  /** Pallet bottom-board construction — drives the soft pallet_entry gate. */
  palletEntryType?: 'stringer' | 'block' | 'not_sure'
  palletStacking?: 'yes' | 'no' | 'not_sure'
  palletStackingType?: 'pin_post' | 'cup_cap' | 'flat' | 'other'
  loadLengthIn?: number | null
  loadWidthIn?: number | null
  loadHeightIn?: number | null
  /** Declared loads. Empty/absent → one load is synthesized from the legacy
   *  singular fields above, preserving single-load behavior bit-for-bit. */
  loads?: LoadSpec[]
}

// ---- Step 3: Material Flows ----

export type RouteLayout = 'low' | 'medium' | 'high'

export interface Flow {
  id: string
  origin: string
  destination: string
  distanceFt: number           // ≥ 0; one-way (cycle multiplies by 2 for round-trip)
  thruPerHr: number            // cycles/hr, ≥ 0
  routeLayout: RouteLayout     // route-average speed: low 30% / medium 50% / high 70% of rated cruise
  liftHeightFt: number         // ft, ≥ 0; total vertical travel per cycle
  vehicleId?: string
  transferMethodIdx?: number   // defaults to 0
  /** Engineer override for the TOTAL transfer time (load + unload seconds) of
   *  this flow. Absent → the vehicle method's loadTimeSec + unloadTimeSec. */
  transferSecOverride?: number
  sectionName?: string         // optional engineer-named section for visual grouping
}

export interface CycleBreakdown {
  travelLoadedSec: number
  travelEmptySec: number
  loadSec: number
  unloadSec: number
  liftTimeSec: number
  totalSec: number
  /** True when loadSec/unloadSec came from Flow.transferSecOverride rather than
   *  the vehicle method's declared load/unload times. Display-only. */
  transferOverridden?: boolean
  // Display-only context (not used in any sum)
  methodName: string
  liftHeightFt: number
  routeLayout: RouteLayout
  routeLayoutFactor: number
}

export interface FlowDerived {
  cycleSeconds: number | null
  rawVehicles: number | null   // fractional; demand-only
  breakdown: CycleBreakdown | null
}

export interface GroupSummary {
  vehicleId: string
  flowsCount: number
  baseThru: number
  avgCycleSec: number | null
  groupRaw: number             // Σ rawVehicles
  baseFleet: number            // ceil(groupRaw)
  headroom: number | null      // (baseFleet − groupRaw) / baseFleet
}

export interface ProjectFlowSummary {
  totalFlows: number
  totalThru: number
  totalRawFleet: number
  totalBaseFleet: number
}

// ---- Fleet Engine: charging + buffer ----

export type ChargeMethod = 'opportunity' | 'plugged'
export type ChargeRegime = 'overnight' | 'continuous'

/** Per-vehicle-group charging outcome. `chargingDelta` is the extra vehicles
 *  needed so charging downtime doesn't starve the operation (≥ 0). Nulls mean
 *  inputs were insufficient — display "—", never NaN. */
export interface ChargingResult {
  method: ChargeMethod
  runHr: number | null        // hours one charge sustains  = usable / draw
  chargeHr: number | null     // hours to put it back       = usable / charge
  availability: number | null // A ∈ (0,1] — share of the staffed window workable
  dutyRatio: number | null    // charge/(charge+draw) — the floor if charging ever un-staggers
  offShiftCharge: number | null // fraction of a full charge the off-shift delivers
  usableKwh: number | null
  /** The draw/charge figures behind this are back-derived, not measured. */
  provisional: boolean
  sustainable: boolean        // false when inputs invalid/zero
  reason: string              // human explanation
}

/** Which cause set `fleetSold`. v4: one constraint, so this says whether
 *  charging contributed at all. */
export type FleetBinding = 'charging' | 'utilization'

export interface FleetGroup {
  vehicleId: string
  groupRaw: number             // peak demand in vehicle-equivalents
  baseFleet: number            // ⌈groupRaw⌉ — the physical floor
  charging: ChargingResult
  /** Fleet once charging downtime is covered, before utilization headroom:
   *  max(baseFleet, ⌈raw / A⌉). Charging is costed FIRST so this stays a pure
   *  platform property — it does not move when the utilization dial moves. */
  fleetWithCharging: number
  /** Pre-ceil demand = groupRaw / (availability × targetUtilization). The SINGLE
   *  source for the constraint arithmetic — display layers read it, never
   *  re-derive it. */
  demand: number
  /** fleetWithCharging − baseFleet. Vehicles bought BECAUSE of charging. */
  chargingDelta: number
  /** fleetSold − fleetWithCharging. Vehicles bought for headroom. */
  utilizationDelta: number
  fleetSold: number
  binding: FleetBinding
}

export interface FleetSummary {
  groups: FleetGroup[]
  totalBaseFleet: number
  totalChargingDelta: number
  totalUtilizationDelta: number
  totalFleetSold: number
  targetUtilization: number
}

/** Project-level fleet settings consumed by the engine. `dailyOpHr` is derived
 *  from Step 1 (shiftsPerDay × hoursPerShift, capped at 24). */
export interface FleetSettings {
  regime: ChargeRegime            // legacy — kept for the engine UI's display toggle only
  /** Share of AVAILABLE working time the fleet should run at, ∈ (0,1]. Not of
   *  the clock: charging downtime is not usable slack, so headroom sits on top
   *  of availability. v4 renamed this from the inverse `bufferPct` so one
   *  vocabulary runs end to end. */
  targetUtilization: number
  dailyOpHr: number               // H = min(24, shifts × hours)
  chargeMethods: Record<string, ChargeMethod>
}

/** Route-average speed factor map. Engineers pick low/medium/high per flow;
 *  the calc scales rated cruise speed by this fraction to get the effective
 *  route-average travel speed. These are *averages over the whole route*, not
 *  instantaneous caps — a vehicle accelerates, decelerates, and rounds corners,
 *  so it never sustains rated cruise end-to-end. The scale therefore tops out
 *  at 0.7 (High/Open, low-traffic): even the best case averages ~70% of rated.
 *  Medium/Mixed (0.5) is typical warehouse traffic; Low/Congested (0.3) is
 *  heavy traffic with many turns and tight corners. */
export const ROUTE_LAYOUT_FACTORS: Record<RouteLayout, number> = {
  low: 0.3,
  medium: 0.5,
  high: 0.7,
}

/**
 * Fleet headroom is a TARGET UTILIZATION, stored and computed as one number in
 * one vocabulary (v4, 2026-10-09). It used to be stored as the inverse "buffer
 * multiplier" and displayed as utilization, so the same field appeared on screen
 * under three names — "target utilization", "buffer" and "headroom". "Headroom"
 * now names only the DELTA (the +N vehicles it costs), never the dial.
 *
 * Default 90% (owner decision, 2026-10-09; was 80%). The throughput the engineer
 * enters is PEAK, not average — Step 1 says so on the field — so the fleet is
 * already sized for the spike. A 20% headroom on top of a peak-sized fleet let it
 * sustain 126% of the stated peak, which is the same insurance bought twice. At
 * 90% the headroom covers what peak demand does NOT: maintenance, availability,
 * and operational friction.
 *
 * KNOWN TENSION, left deliberately: fleet capacity behaves like an M/M/c queue,
 * so past ~85% utilization blocking and wait time climb non-linearly. That is a
 * CONGESTION effect and it belongs in cycle time (route layout factor), not in
 * fleet count — but it is a real reason 90% is aggressive if the route factor is
 * ever calibrated upward. Revisit the two together, never one alone.
 *
 * The UI presents utilization; the calc keeps the buffer multiplier.
 */
export const DEFAULT_TARGET_UTILIZATION = 0.90

/** Usable depth-of-discharge fraction — display/ROM only (SoC chart floor, energy
 *  OPEX kW, battery-energy figures). The v3 charging calc uses cutsheet hours
 *  (`runTimeHr`/`chargeTimeMin`) directly and needs no DOD. */
export const DEFAULT_DOD = 0.80
