// src/calc/sim/types.ts — Fleet Simulation data types. PURE: no React, no I/O.
// Units: feet, seconds, ft/s, kW, % SOC. See docs/superpowers/specs/2026-11-10-fleet-simulation-design-v2.md.

/** What a point is (its glyph). Flow points carry a role; charger/parking are vehicle points. */
export type SimPointType =
  | 'junction' | 'stand' | 'conveyor' | 'machine' | 'dock' | 'charger' | 'parking'

/** What happens at a flow point. */
export type SimRole = 'pick' | 'drop' | 'pickDrop'

export interface SimPoint {
  id: string
  /** Position in feet (layout frame). */
  x: number
  y: number
  type: SimPointType
  role?: SimRole
  name?: string
  /** Transfer height in ft (floor = 0). Drives lift time at this point. */
  heightFt?: number
  /** Direction a vehicle travels while moving into this position, degrees (0 = +x, 90 = +y).
   *  Undefined → along the route the vehicle arrives on. */
  approachHeadingDeg?: number
  /** Extra seconds for a conveyor/machine handshake at this point. */
  handshakeSec?: number
}

/** Optional curve on a segment. `arc`: circular arc through `mid`. `bezier`: cubic with two handles. */
export type SimCurve =
  | { kind: 'arc'; mid: { x: number; y: number } }
  | { kind: 'bezier'; c1: { x: number; y: number }; c2: { x: number; y: number } }

export interface SimSegment {
  id: string
  a: string
  b: string
  /** 'two' = both directions; 'ab' / 'ba' = one-way. */
  dir: 'two' | 'ab' | 'ba'
  /** 'two' = two-lane (opposite traffic passes); 'single' = no passing. Default 'two'. */
  lane?: 'single' | 'two'
  curve?: SimCurve
  /** Segment speed limit (slow zone), ft/s. */
  speedLimitFps?: number
}

export interface SimLayout {
  points: SimPoint[]
  segments: SimSegment[]
}

/** One flow the simulation runs: a Pick point → a Drop point at a rate, by one vehicle type. */
export interface SimFlow {
  id: string
  fromPointId: string
  toPointId: string
  thruPerHr: number
  vehicleId: string
  transferMethodIdx?: number
  transferSecOverride?: number
}

// Vehicle simulation data is part of the vehicle data model (vehicle JSON `calc.sim`).
export type { TransferOrientation, TravelEnd, VehicleSimData } from '@/src/lib/vehicleLibrary'

export interface SimSettings {
  /** Vehicles per vehicleId. */
  fleet: Record<string, number>
  /** Demand as % of each flow's moves/h. */
  demandPct: number
  seed: number
  arrivals: 'regular' | 'random'
  /** Fallback % of rated speed when a vehicle has no motion data (owner default 70). */
  pacePct: number
  /** Extra following gap beyond the vehicle length, ft. */
  safetyFt: number
  /** Staffed hours per day (Step 1 shifts × hours). < 24 → shift starts at max SOC. */
  staffedHr: number
  /** Project target utilization (0–1). The verdict is measured against it (D-9). */
  targetUtilization: number
}

/** One flag on the results: a fallback was used because data is missing. */
export interface SimFlag {
  vehicleId?: string
  field: string
  message: string
}

export type Verdict = 'warming' | 'meets' | 'tight' | 'short' | 'gridlock'

export interface Gridlock {
  t: number
  /** cycle: vehicles wait on each other; parked: blocked by a parked vehicle; stall: nothing with work moved. */
  kind: 'cycle' | 'parked' | 'stall'
  nodeId: string
  vehicle: string
  blockedBy: string | null
  where: string
}

export interface TimeSplit {
  travel: number
  handle: number
  reposition: number
  wait: number
  charge: number
  idle: number
}

export interface FlowResult {
  flowId: string
  measuredFt: number
  perHr: number
  /** Average dispatched-to-delivered seconds. */
  mission: number | null
  /** Average order wait (created → dispatched), seconds. */
  wait: number | null
}

export interface TypeResult {
  vehicleId: string
  fleet: number
  target: number
  perHr: number
  done: number
  generated: number
  delivered: number
  avgWait: number
  /** Busy ÷ time not charging — the Fleet Engine's utilization definition. */
  utilization: number
  /** Busy vehicle-seconds ÷ moves: comparable to the engine cycle. */
  vehicleSecPerMove: number | null
  time: TimeSplit
  socAvg: number
  socMin: number
  chargeTrips: number
  backlogTrend: number
  verdict: Verdict
}

export interface SimResults {
  t: number
  verdict: Verdict
  types: TypeResult[]
  flows: FlowResult[]
  gridlock: Gridlock | null
  flags: SimFlag[]
  excluded: { flowId: string; why: string }[]
  orders: { generated: number; delivered: number; inProgress: number; waiting: number }
}
