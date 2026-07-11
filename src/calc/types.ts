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
  sectionName?: string         // optional engineer-named section for visual grouping
}

export interface CycleBreakdown {
  travelLoadedSec: number
  travelEmptySec: number
  loadSec: number
  unloadSec: number
  liftTimeSec: number
  totalSec: number
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
  runHr: number | null        // operating hours one charge sustains
  chargeHr: number | null     // hours to a full recharge
  availability: number | null // final A ∈ (0,1]
  aEnergy: number | null      // energy availability (off-shift + weekend reset)
  aCap: number | null         // within-window battery-capacity availability
  chargingDelta: number       // extra vehicles for charging (≥ 0)
  sustainable: boolean        // false when inputs invalid/zero
  reason: string              // human explanation
}

export interface FleetGroup {
  vehicleId: string
  groupRaw: number
  baseFleet: number
  charging: ChargingResult
  fleetWithCharging: number   // baseFleet + chargingDelta
  fleetSold: number           // ⌈ fleetWithCharging × (1 + bufferPct) ⌉
}

export interface FleetSummary {
  groups: FleetGroup[]
  totalBaseFleet: number
  totalChargingDelta: number
  totalFleetSold: number
  bufferPct: number
}

/** Project-level fleet settings consumed by the engine. `dailyOpHr` is derived
 *  from Step 1 (shiftsPerDay × hoursPerShift, capped at 24). */
export interface FleetSettings {
  regime: ChargeRegime            // legacy — kept for the engine UI's display toggle only
  bufferPct: number
  dailyOpHr: number               // clock staffed hours/day = min(24, shifts × hours)
  breakHrs: number                // total break hours/day
  consecutiveOpDays: number       // C — consecutive operating days before a rest (Infinity if none)
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

/** Default project-level buffer fraction applied by the Fleet Engine after
 *  base + charging. */
export const DEFAULT_BUFFER_PCT = 0.10

/** Usable depth-of-discharge fraction for battery runtime/charge math. */
export const DEFAULT_DOD = 0.80

/** Charge derate applied to the nameplate charge rate in the charging model — folds
 *  round-trip loss, the near-full CV taper, and real charger-access overhead into one
 *  honest factor, so effective recharge is ~15% slower than ideal (a safety margin). */
export const CHARGE_EFFICIENCY = 0.85
