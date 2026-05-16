import { describe, it, expect, vi, beforeAll } from 'vitest'
import { exportProjectPdf, projectJsonBlob } from '../pdfExport'
import { SCHEMA_VERSION, type StoredProject } from '../storage'

// Mock the logo fetch (the export tries to embed /assets/TAL-Logo-Black.png).
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('TAL-Logo')) {
      return new Response(new Uint8Array(), { status: 404 })
    }
    if (url.includes('/api/vehicles')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }))
})

const fixture: StoredProject = {
  id: 'p_test123',
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-16T20:00:00.000Z',
  versionNumber: 'v1.0',
  step1Complete: true,
  step2Complete: false,
  step3Complete: false,
  step4Complete: false,
  step5Complete: false,
  projectName: 'Acme Distribution Center - West',
  customerName: 'Acme Logistics',
  facilityLocation: 'Phoenix, AZ',
  bastianRep: 'M. Rodriguez',
  opportunityNumber: '1234567',
  opportunityType: 'opp',
  maxLoadWeightLbs: 3000,
  typicalUnitType: 'Standard Pallet',
  transferMethod: 'Fork',
  deliveryPattern: 'Floor-Floor',
  minAisleWidthFt: 12,
  certifications: ['ISO 3691-4'],
  shiftsPerDay: 2,
  hoursPerShift: 8,
  operatingDaysPattern: 'Mon-Fri',
  breaksPerShift: 1,
  breakDurationMin: 30,
  requiredThroughputPerHour: 60,
  avgDistanceFt: 200,
  distanceType: 'one_way',
  operatorsPerShift: 3,
  rampDistanceFt: 0,
  maxRampGrade: 0,
  outdoorRequired: false,
  freezerCapable: false,
  interlocks: [],
  otherAGVs: false,
  wmsRequired: false,
}

describe('exportProjectPdf', () => {
  it('produces a PDF Blob with the application/pdf MIME type', async () => {
    const blob = await exportProjectPdf(fixture)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('starts with a valid PDF header', async () => {
    const blob = await exportProjectPdf(fixture)
    const buf = new Uint8Array(await blob.arrayBuffer())
    // PDFs start with the literal bytes "%PDF-"
    const header = new TextDecoder().decode(buf.slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('embeds project.json as a parseable attachment that round-trips the full project', async () => {
    const blob = await exportProjectPdf(fixture)
    const buf = new Uint8Array(await blob.arrayBuffer())

    // Re-open the PDF with pdfjs-dist (the same library Phase 6b import will use)
    // and pull the project.json attachment out of the embedded files table.
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjsLib.getDocument({ data: buf, disableWorker: true }).promise
    const attachments = await doc.getAttachments() as Record<string, { content: Uint8Array; filename: string }>

    expect(attachments).toBeTruthy()
    expect(attachments['project.json']).toBeTruthy()

    const jsonText = new TextDecoder().decode(attachments['project.json'].content)
    const payload = JSON.parse(jsonText)

    expect(payload.schemaVersion).toBe(SCHEMA_VERSION)
    expect(payload.project.id).toBe(fixture.id)
    expect(payload.project.projectName).toBe(fixture.projectName)
    expect(payload.project.customerName).toBe(fixture.customerName)
    expect(payload.project.opportunityNumber).toBe(fixture.opportunityNumber)
    expect(payload.project.maxLoadWeightLbs).toBe(fixture.maxLoadWeightLbs)
    expect(payload.project.certifications).toEqual(fixture.certifications)
  })

  it('JSON payload round-trips through projectJsonBlob', async () => {
    const blob = projectJsonBlob(fixture)
    const json = await blob.text()
    const parsed = JSON.parse(json)
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
    expect(parsed.project.id).toBe(fixture.id)
    expect(parsed.project.projectName).toBe(fixture.projectName)
    expect(parsed.project.maxLoadWeightLbs).toBe(3000)
    expect(parsed.project.certifications).toEqual(['ISO 3691-4'])
  })

  it('handles a near-empty project without crashing', async () => {
    const empty: StoredProject = {
      ...fixture,
      projectName: '',
      customerName: '',
      facilityLocation: '',
      bastianRep: '',
      maxLoadWeightLbs: 0,
      typicalUnitType: '',
      transferMethod: '',
      deliveryPattern: '',
      certifications: [],
    }
    const blob = await exportProjectPdf(empty)
    expect(blob.size).toBeGreaterThan(1000)
  })
})
