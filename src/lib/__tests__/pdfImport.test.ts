import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { exportProjectPdf } from '../pdfExport'
import { parseProjectPdf } from '../pdfImport'
import { importProjectFromJson, SCHEMA_VERSION, type StoredProject } from '../storage'

// Same fetch shim as pdfExport tests — the export path tries to embed the TAL
// logo and fetch the vehicle library.
beforeAll(async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const logoPath = path.resolve(process.cwd(), 'public/assets/TAL-Logo-Black.png')
  let logoBytes: Uint8Array | null = null
  try {
    const data = await fs.readFile(logoPath)
    logoBytes = new Uint8Array(data)
  } catch { /* logo optional */ }

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('TAL-Logo') && logoBytes) {
      return new Response(logoBytes.slice() as BodyInit, { status: 200 })
    }
    if (url.includes('TAL-Logo')) return new Response(new Uint8Array(), { status: 404 })
    if (url.includes('/api/vehicles')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('', { status: 404 })
  }))
})

// Reset localStorage between tests so generateId / readAll stay independent.
beforeEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear()
})

const fixture: StoredProject = {
  id: 'p_source',
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-16T20:00:00.000Z',
  versionNumber: 'v1.3',
  step1Complete: true,
  step2Complete: false,
  step3Complete: false,
  step4Complete: false,
  projectName: 'Round-Trip Test Project',
  customerName: 'Acme Logistics',
  facilityLocation: 'Phoenix, AZ',
  bastianRep: 'M. Rodriguez',
  opportunityNumber: '7654321',
  opportunityType: 'opp',
  maxLoadWeightLbs: 2500,
  typicalUnitType: 'Standard Pallet',
  transferMethod: 'Fork',
  deliveryPattern: 'Floor-Floor',
  minAisleWidthFt: 11,
  certifications: ['ISO 3691-4', 'ANSI B56.5'],
  shiftsPerDay: 2,
  hoursPerShift: 8,
  operatingDaysPattern: 'Mon-Fri',
  breaksPerShift: 1,
  breakDurationMin: 30,
  requiredThroughputPerHour: 60,
  avgDistanceFt: 180,
  distanceType: 'one_way',
  operatorsPerShift: 3,
  rampDistanceFt: 0,
  maxRampGrade: 0,
  outdoorRequired: false,
  freezerCapable: false,
  interlocks: [],
  otherAGVs: false,
  wmsRequired: true,
  wmsVendor: 'SAP EWM',
  projectNotes: 'Special handling required for fragile items.',
}

function makeFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type })
}

describe('parseProjectPdf — happy paths', () => {
  it('round-trips a project through export → parseProjectPdf', async () => {
    const pdfBlob = await exportProjectPdf(fixture)
    const file = makeFile(pdfBlob, 'project.pdf', 'application/pdf')

    const recovered = await parseProjectPdf(file)

    // Fresh id + timestamps (we don't overwrite the source project)
    expect(recovered.id).not.toBe(fixture.id)
    expect(recovered.createdAt).not.toBe(fixture.createdAt)

    // Field values preserved
    expect(recovered.projectName).toBe(fixture.projectName)
    expect(recovered.customerName).toBe(fixture.customerName)
    expect(recovered.opportunityNumber).toBe(fixture.opportunityNumber)
    expect(recovered.maxLoadWeightLbs).toBe(fixture.maxLoadWeightLbs)
    expect(recovered.certifications).toEqual(fixture.certifications)
    expect(recovered.projectNotes).toBe(fixture.projectNotes)

    // Version number preserved (manual override survives import)
    expect(recovered.versionNumber).toBe('v1.3')

    // Completion flags preserved
    expect(recovered.step1Complete).toBe(true)
    expect(recovered.step2Complete).toBe(false)
  })

  it('detects .pdf by extension when MIME type is missing', async () => {
    const pdfBlob = await exportProjectPdf(fixture)
    const file = makeFile(pdfBlob, 'proposal.pdf', '') // no MIME
    const recovered = await parseProjectPdf(file)
    expect(recovered.projectName).toBe(fixture.projectName)
  })
})

describe('parseProjectPdf — error paths', () => {
  it('rejects a non-PDF file', async () => {
    const txtBlob = new Blob(['hello world'], { type: 'text/plain' })
    const file = makeFile(txtBlob, 'notes.txt', 'text/plain')
    await expect(parseProjectPdf(file)).rejects.toThrow(/not a PDF/i)
  })

  it('rejects a corrupt or non-readable PDF', async () => {
    const junk = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/pdf' })
    const file = makeFile(junk, 'broken.pdf', 'application/pdf')
    await expect(parseProjectPdf(file)).rejects.toThrow(/(corrupt|password|project data)/i)
  })

  it('rejects a valid PDF that has no project.json attachment', async () => {
    // Build a minimal valid PDF with pdf-lib but skip the attachment.
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    const file = makeFile(new Blob([bytes.slice() as BlobPart], { type: 'application/pdf' }), 'blank.pdf', 'application/pdf')
    await expect(parseProjectPdf(file)).rejects.toThrow(/doesn't contain TAL project data/i)
  })
})

describe('importProjectFromJson — wrapped + unwrapped envelopes', () => {
  it('accepts the wrapped envelope (schemaVersion + project)', () => {
    const wrapped = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-05-16T20:00:00.000Z',
      project: fixture,
    })
    const recovered = importProjectFromJson(wrapped)
    expect(recovered.projectName).toBe(fixture.projectName)
    expect(recovered.versionNumber).toBe('v1.3')
  })

  it('accepts the legacy unwrapped envelope (raw StoredProject)', () => {
    const unwrapped = JSON.stringify(fixture)
    const recovered = importProjectFromJson(unwrapped)
    expect(recovered.projectName).toBe(fixture.projectName)
  })

  it('rejects a payload with a schemaVersion newer than the app', () => {
    const wrapped = JSON.stringify({
      schemaVersion: SCHEMA_VERSION + 99,
      project: fixture,
    })
    expect(() => importProjectFromJson(wrapped)).toThrow(/newer version/i)
  })
})
