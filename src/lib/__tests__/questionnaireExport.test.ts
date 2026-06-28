import { describe, it, expect } from 'vitest'
import { buildQuestionnaireEnvelope } from '@/src/lib/questionnaire/questionnaireExport'
import { importProjectFromJson } from '@/src/lib/storage'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
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

  it('ports cleanly into the main app — rep, install date, flows, and loads', () => {
    const env = buildQuestionnaireEnvelope({
      customerName: 'Acme',
      talRepName: 'Sam Rep',
      targetGoLiveDate: '2027-03-01',
      typicalUnitType: 'Standard Pallet',
      maxLoadWeightLbs: 2400,
      requiredThroughputPerHour: 60,
      flows: [{ id: 'f1', origin: 'Dock A', destination: 'Storage 1', distanceFt: 200, thruPerHr: 60, routeLayout: 'medium', liftHeightFt: 0 }],
    })
    const imported = importProjectFromJson(JSON.stringify(env))
    // questionnaire-only names map onto the canonical Step-1 fields
    expect(imported.bastianRep).toBe('Sam Rep')          // shows as "TAL Engineer" in the app header
    expect(imported.desiredInstallDate).toBe('2027-03-01')
    // flows port directly to Step 3
    expect(imported.flows).toHaveLength(1)
    expect(imported.flows?.[0]?.origin).toBe('Dock A')
    // singular load fields flow through ApplicationRequirements (Step 2/3 sizing)
    const req = appRequirementsFromProject(imported)
    expect(req.typicalUnitType).toBe('Standard Pallet')
    expect(req.maxLoadWeightLbs).toBe(2400)
  })

  it('does not clobber canonical fields when already set', () => {
    const env = buildQuestionnaireEnvelope({ bastianRep: 'Existing', talRepName: 'Sam', desiredInstallDate: '2027-01-01', targetGoLiveDate: '2027-09-09' })
    expect(env.project.bastianRep).toBe('Existing')
    expect(env.project.desiredInstallDate).toBe('2027-01-01')
  })
})
