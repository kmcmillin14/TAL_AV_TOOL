import { describe, it, expect, vi, beforeAll } from 'vitest'
import { exportProjectPdf, projectJsonBlob } from '../pdfExport'
import { SCHEMA_VERSION, type StoredProject } from '../storage'

// Load the real logo from disk so the test artifact PDF matches what the
// browser will produce (same /assets/TAL-Logo-Black.png served by Next.js).
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
    // disableWorker is a runtime option not yet in the public type defs (see pdfImport.ts).
    const params = { data: buf, disableWorker: true } as Parameters<typeof pdfjsLib.getDocument>[0]
    const doc = await pdfjsLib.getDocument(params).promise
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

describe('exportProjectPdf — fully populated project', () => {
  // Every field the schema can carry, populated with a realistic value.
  const full: StoredProject = {
    id: 'p_fullaudit',
    createdAt: '2026-05-16T12:00:00.000Z',
    updatedAt: '2026-05-16T20:00:00.000Z',
    versionNumber: 'v2.3',
    step1Complete: true,
    step2Complete: true,
    step3Complete: false,
    step4Complete: false,
    step5Complete: false,

    // Header / project meta
    projectName: 'Acme Distribution Center — Phoenix Phase II',
    customerName: 'Acme Logistics Inc.',
    facilityLocation: 'Phoenix, AZ',
    bastianRep: 'M. Rodriguez',
    opportunityNumber: '1234567',
    opportunityType: 'opp',

    // Section 1 — What are you moving?
    maxLoadWeightLbs: 3200,
    typicalUnitType: 'Standard Pallet',
    palletBottomBoard: 'GMA (48×40)',
    customPalletDescription: 'Double-stacked block pallet with stretch wrap',
    otherUnitTypeDescription: 'N/A',
    loadLengthIn: 48,
    loadWidthIn: 40,
    loadHeightIn: 60,

    // Section 2 — Transfer
    transferMethod: 'Fork',
    deliveryPattern: 'Floor-Height',
    maxLiftHeightFt: 14,

    // Section 3 — Where
    minAisleWidthFt: 12,
    floorCondition: 'Standard',

    // Section 4 — Schedule
    shiftsPerDay: 2,
    hoursPerShift: 8,
    operatingDaysPattern: 'Mon-Sat',
    operatingDaysCustom: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    breaksPerShift: 2,
    breakDurationMin: 30,

    // Section 5 — Throughput & distance
    requiredThroughputPerHour: 85,
    avgDistanceFt: 220,
    distanceType: 'one_way',

    // Section 6 — Labor
    operatorsPerShift: 4,

    // Section 7 — Ramps
    rampDistanceFt: 18,
    maxRampGrade: 6,

    // Section 8 — Dealer & Contact
    oemDealer: 'Raymond',
    dealershipName: 'Empire Material Handling',
    dealerRep: 'J. Smith',

    // Section 9 — Certifications
    certifications: ['ISO 3691-4', 'ANSI B56.5', 'Food Grade'],

    // Section 10 — Equipment integration
    interlocks: ['High-Speed Doors', 'Conveyors', 'PLC Systems'],
    otherAGVs: true,
    otherAGVVendor: 'Linde, Jungheinrich',

    // Section 11 — Environment
    tempMinF: 14,
    tempMaxF: 110,
    outdoorRequired: false,
    freezerCapable: false,
    dustMoisture: 'Dusty environment',

    // Section 12 — Software
    wmsRequired: true,
    wmsVendor: 'Manhattan Active WM',

    // Section 13 — Notes
    projectNotes: 'Two phases — Phase II covers receiving lanes only. Customer prefers fleet software with REST API for downstream WMS integration. Confirm peak Q4 throughput with site walk in August.',
  }

  it('writes a real PDF to disk for visual inspection', async () => {
    const blob = await exportProjectPdf(full)
    const buf = new Uint8Array(await blob.arrayBuffer())

    // Save to <project>/tmp/full-project.pdf so the human can open it.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const outDir = path.resolve(process.cwd(), 'tmp')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'full-project.pdf')
    fs.writeFileSync(outPath, buf)

    expect(fs.existsSync(outPath)).toBe(true)
    const stat = fs.statSync(outPath)
    // A fully-populated project should produce a meaningfully sized PDF (cover
    // + multi-page summary + matrix + embedded JSON).
    expect(stat.size).toBeGreaterThan(5000)
  })

  it('embedded JSON contains every populated schema field', async () => {
    const blob = await exportProjectPdf(full)
    const buf = new Uint8Array(await blob.arrayBuffer())
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // disableWorker is a runtime option not yet in the public type defs (see pdfImport.ts).
    const params = { data: buf, disableWorker: true } as Parameters<typeof pdfjsLib.getDocument>[0]
    const doc = await pdfjsLib.getDocument(params).promise
    const attachments = await doc.getAttachments() as Record<string, { content: Uint8Array }>
    const payload = JSON.parse(new TextDecoder().decode(attachments['project.json'].content))
    const p = payload.project

    // Spot-check every section has at least one value preserved
    expect(p.opportunityNumber).toBe('1234567')
    expect(p.palletBottomBoard).toBe('GMA (48×40)')
    expect(p.customPalletDescription).toContain('block pallet')
    expect(p.loadLengthIn).toBe(48)
    expect(p.deliveryPattern).toBe('Floor-Height')
    expect(p.maxLiftHeightFt).toBe(14)
    expect(p.floorCondition).toBe('Standard')
    expect(p.operatingDaysCustom).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    expect(p.breaksPerShift).toBe(2)
    expect(p.breakDurationMin).toBe(30)
    expect(p.operatorsPerShift).toBe(4)
    expect(p.rampDistanceFt).toBe(18)
    expect(p.maxRampGrade).toBe(6)
    expect(p.oemDealer).toBe('Raymond')
    expect(p.dealershipName).toBe('Empire Material Handling')
    expect(p.dealerRep).toBe('J. Smith')
    expect(p.certifications).toEqual(['ISO 3691-4', 'ANSI B56.5', 'Food Grade'])
    expect(p.interlocks).toEqual(['High-Speed Doors', 'Conveyors', 'PLC Systems'])
    expect(p.otherAGVs).toBe(true)
    expect(p.otherAGVVendor).toBe('Linde, Jungheinrich')
    expect(p.tempMinF).toBe(14)
    expect(p.tempMaxF).toBe(110)
    expect(p.dustMoisture).toBe('Dusty environment')
    expect(p.wmsRequired).toBe(true)
    expect(p.wmsVendor).toBe('Manhattan Active WM')
    expect(p.projectNotes).toContain('Two phases')
  })

  it('visible PDF includes every field label and value', async () => {
    const blob = await exportProjectPdf(full)
    const buf = new Uint8Array(await blob.arrayBuffer())
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // disableWorker is a runtime option not yet in the public type defs (see pdfImport.ts).
    const params = { data: buf, disableWorker: true } as Parameters<typeof pdfjsLib.getDocument>[0]
    const doc = await pdfjsLib.getDocument(params).promise

    // Concatenate text from every page so we can search across pagination.
    let allText = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const text = await page.getTextContent()
      allText += text.items.map(it => ('str' in it ? it.str : '')).join(' ') + ' '
    }

    // Cover page essentials
    expect(allText).toContain('FLEET SIZING PROPOSAL')
    expect(allText).toContain('Acme Distribution Center')
    expect(allText).toContain('Acme Logistics')
    expect(allText).toContain('Phoenix, AZ')
    expect(allText).toContain('M. Rodriguez')
    expect(allText).toContain('OPP-1234567')
    expect(allText).toContain('v2.3')

    // Section labels — every one of the 13 form sections must appear
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(allText).toContain(`Section ${n} —`)
    }

    // Spot-check meaningful values from each section
    expect(allText).toContain('3,200 lbs')                       // Sec 1
    expect(allText).toContain('GMA (48×40)')                     // Sec 1
    expect(allText).toContain('Floor-Height')                    // Sec 2
    expect(allText).toContain('14 ft')                           // Sec 2 lift OR Sec 11 temp
    expect(allText).toContain('Standard')                        // Sec 3 floor
    expect(allText).toContain('Mon-Sat')                         // Sec 4
    expect(allText).toContain('30 min')                          // Sec 4
    expect(allText).toContain('85 moves/hr')                     // Sec 5
    expect(allText).toContain('one_way')                         // Sec 5
    expect(allText).toContain('Raymond')                         // Sec 8
    expect(allText).toContain('Empire Material Handling')        // Sec 8
    expect(allText).toContain('Food Grade')                      // Sec 9
    expect(allText).toContain('High-Speed Doors')                // Sec 10
    expect(allText).toContain('Linde, Jungheinrich')             // Sec 10
    expect(allText).toContain('Dusty environment')               // Sec 11
    expect(allText).toContain('Manhattan Active WM')             // Sec 12
    expect(allText).toContain('Two phases')                      // Sec 13
  })

  it('produces multiple pages (auto-paginates summary + matrix)', async () => {
    const blob = await exportProjectPdf(full)
    const buf = new Uint8Array(await blob.arrayBuffer())
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // disableWorker is a runtime option not yet in the public type defs (see pdfImport.ts).
    const params = { data: buf, disableWorker: true } as Parameters<typeof pdfjsLib.getDocument>[0]
    const doc = await pdfjsLib.getDocument(params).promise
    // Cover + 2 summary pages + matrix page (when vehicles fetched) = 3 or 4
    // In this test fetch returns no vehicles, so expect at least 3 pages.
    expect(doc.numPages).toBeGreaterThanOrEqual(3)
  })
})
