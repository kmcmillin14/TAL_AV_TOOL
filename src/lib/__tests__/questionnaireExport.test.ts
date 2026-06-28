import { describe, it, expect } from 'vitest'
import { buildQuestionnaireEnvelope } from '@/src/lib/questionnaire/questionnaireExport'
import { importProjectFromJson } from '@/src/lib/storage'
import { SCHEMA_VERSION } from '@/src/lib/validations/schemas'

describe('buildQuestionnaireEnvelope', () => {
  const answers = {
    projectName: 'Acme DC', customerName: 'Acme',
    vehicleInMind: 'CB18', isRfq: true, rfqNumber: 'RFQ-7',
    projectDrivers: ['Labor cost'], specialtyApplications: ['Trailer loading'],
    talRepName: 'Sam', maxLoadWeightLbs: 2400, transferType: 'forklift' as const,
  }

  it('wraps answers in the { schemaVersion, exportedAt, project } envelope', () => {
    const env = buildQuestionnaireEnvelope(answers)
    expect(env.schemaVersion).toBe(SCHEMA_VERSION)
    expect(typeof env.exportedAt).toBe('string')
    expect(env.project.vehicleInMind).toBe('CB18')
  })

  it('round-trips through Step 00 import with all sales fields intact', () => {
    const env = buildQuestionnaireEnvelope(answers)
    const imported = importProjectFromJson(JSON.stringify(env))
    expect(imported.customerName).toBe('Acme')
    expect(imported.vehicleInMind).toBe('CB18')
    expect(imported.isRfq).toBe(true)
    expect(imported.rfqNumber).toBe('RFQ-7')
    expect(imported.projectDrivers).toEqual(['Labor cost'])
    expect(imported.specialtyApplications).toEqual(['Trailer loading'])
    expect(imported.talRepName).toBe('Sam')
    expect(imported.maxLoadWeightLbs).toBe(2400)
    expect(imported.transferType).toBe('forklift')
    expect(imported.id).toBeTruthy()
  })
})
