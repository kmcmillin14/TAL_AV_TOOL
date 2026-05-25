// Shared TypeScript types for the calculation engine
// Pure types only — no React, no I/O imports

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED'
export type Severity = 'hard' | 'soft'

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

export interface QualificationResult {
  status: TrafficLightStatus
  hardGates: GateResult[]
  softPreferences: GateResult[]
}

export interface ApplicationRequirements {
  maxLoadWeightLbs: number
  typicalUnitType: string
  transferMethod: string
  deliveryPattern: string
  maxLiftHeightFt?: number | null
  minAisleWidthFt: number
  certifications?: string[]
  tempMinF?: number | null
  tempMaxF?: number | null
  maxRampGrade?: number
  outdoorRequired?: boolean
  freezerCapable?: boolean
  loadLengthIn?: number | null
  loadWidthIn?: number | null
  loadHeightIn?: number | null
}

// ---- Step 3: Material Flows ----

export type RouteLayout = 'low' | 'medium' | 'high'

export interface Flow {
  id: string
  origin: string
  destination: string
  distanceFt: number           // ≥ 0; one-way (cycle multiplies by 2 for round-trip)
  thruPerHr: number            // cycles/hr, ≥ 0
  routeLayout: RouteLayout     // path geometry: low (50%) / medium (70%) / high (90%) of rated cruise
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

/** Default project-level buffer fraction used by Step 5. Declared here for
 *  cross-step visibility — Step 3 does not use it. */
export const DEFAULT_BUFFER_PCT = 0.10
