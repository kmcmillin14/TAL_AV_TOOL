// Shared TypeScript types for the calculation engine
// Pure types only — no React, no database imports

export type TrafficLightStatus = 'GREEN' | 'YELLOW' | 'RED'

export interface GateResult {
  name: string
  vehicleValue: string
  requiredValue: string
  passed: boolean
  reason?: string
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
}
