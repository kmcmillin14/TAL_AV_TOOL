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
