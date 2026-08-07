import { describe, it, expect } from 'vitest'
import { projectSchema, flowSchema } from '@/src/lib/validations/schemas'

describe('questionnaire change-log schema additions', () => {
  const keys = new Set(Object.keys(projectSchema.shape))
  const expected = [
    'submissionType', 'partnerCompanyName', 'partnerRepContact',
    'unitLoadTypes', 'dwellTimeMin', 'chargingStrategyPreference', 'topOfRollerHeightFt',
    'driveAisleWidthFt', 'rackingAisleWidthFt', 'sharedTrafficTypes', 'guidanceType',
    'hazardZoneClassification', 'restApiAvailable', 'barcodeScanningRequired',
    'wmsInterfaceType', 'taggingScanMethod', 'hasExistingAutomation',
    'existingAutomationInterop', 'currentHeadcount',
  ]
  it('adds every new key', () => {
    for (const k of expected) expect(keys.has(k), k).toBe(true)
  })
  it('all new keys are optional (partial project stays valid)', () => {
    expect(projectSchema.partial().safeParse({}).success).toBe(true)
    expect(projectSchema.safeParse({}).success).toBe(true)
  })
  it('flow gets an optional per-row distanceType', () => {
    expect('distanceType' in flowSchema.shape).toBe(true)
    expect(flowSchema.safeParse({ id: 'f1' }).success).toBe(true)
    expect(flowSchema.safeParse({ id: 'f1', distanceType: 'round_trip' }).success).toBe(true)
  })
  it('submissionType accepts the four values and rejects others', () => {
    for (const v of ['customer', 'dealer', 'internal', 'partner'])
      expect(projectSchema.safeParse({ submissionType: v }).success).toBe(true)
    expect(projectSchema.safeParse({ submissionType: 'nope' }).success).toBe(false)
  })
})
