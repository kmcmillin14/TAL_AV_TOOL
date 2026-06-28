import { describe, it, expect } from 'vitest'
import { partialProjectSchema } from '@/src/lib/validations/schemas'
import { SCHEMA_VERSION } from '@/src/lib/validations/schemas'
import { SPECIALTY_APPLICATIONS, PROJECT_DRIVERS } from '@/src/lib/constants/enums'

describe('sales / opportunity schema fields', () => {
  it('parses a fully-populated sales block', () => {
    const r = partialProjectSchema.safeParse({
      vehicleInMind: 'CB18',
      vehiclesOfInterest: ['cb18', '8tb50a'],
      pickContext: 'Floor', dropContext: 'Rack', peakThroughputPerHour: 90,
      isRfq: true, rfqNumber: 'RFQ-42', rfqDueDate: '2026-08-01',
      cadAvailable: true, cadNotes: 'DWG attached',
      projectStage: 'budgeting', budgetStatus: 'budgetary', budgetRange: '$1-2M',
      decisionDate: '2026-09-01', targetGoLiveDate: '2027-01-01',
      projectDrivers: ['Labor cost', 'Safety'], currentProcess: 'Manual forklifts',
      volumeGrowthNote: '10%/yr', seasonalityNote: 'Q4 peak',
      facilitySizeSqFt: 250000, dockDoors: 12, networkReady: true, itContact: 'jane@co',
      existingAutomation: 'None', siteWalkthroughAvailable: true,
      specialtyApplications: ['Trailer loading', 'High reach / racking'],
      customerContactName: 'Bob', customerContactRole: 'Ops', customerContactEmail: 'b@co', customerContactPhone: '555',
      talRepName: 'Sam', talRepEmail: 's@tal', talRepPhone: '556',
    })
    expect(r.success).toBe(true)
  })

  it('treats every sales field as optional (empty object is valid)', () => {
    expect(partialProjectSchema.safeParse({}).success).toBe(true)
  })

  it('rejects an invalid enum value', () => {
    expect(partialProjectSchema.safeParse({ projectStage: 'nope' }).success).toBe(false)
  })

  it('exposes SCHEMA_VERSION and the chip enums', () => {
    expect(typeof SCHEMA_VERSION).toBe('number')
    expect(SPECIALTY_APPLICATIONS).toContain('Trailer loading')
    expect(PROJECT_DRIVERS).toContain('Labor cost')
  })
})
