import { describe, it, expect, vi, beforeAll } from 'vitest'
import { exportProjectPdf } from '../pdfExport'
import type { StoredProject } from '../storage'
import cb18 from '../../content/vehicles/cb18.json'

// Serve the real vehicle library (cb18) for /api/vehicles so the exporter sizes a
// real fleet — exercising the customer summary + internal appendix content.
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('TAL-Logo')) return new Response(new Uint8Array(), { status: 404 })
    if (url.includes('/api/vehicles')) {
      return new Response(JSON.stringify([cb18]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('', { status: 404 })
  }))
})

const project = {
  id: 'p_fleet', createdAt: '2026-05-01T12:00:00.000Z', updatedAt: '', versionNumber: 'v1',
  step1Complete: true, step2Complete: true, step3Complete: true, step4Complete: false,
  projectName: 'Fleet PDF Test', customerName: 'Acme', shiftsPerDay: 2, hoursPerShift: 8,
  operatorsPerShift: 3, operatingDaysPattern: 'Mon–Fri', bufferPct: 0.10,
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Storage', distanceFt: 590, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
  ],
} as unknown as StoredProject

async function pdfText(p: StoredProject): Promise<string> {
  const blob = await exportProjectPdf(p)
  const buf = new Uint8Array(await blob.arrayBuffer())
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const params = { data: buf, disableWorker: true } as Parameters<typeof pdfjsLib.getDocument>[0]
  const doc = await pdfjsLib.getDocument(params).promise
  let all = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const text = await page.getTextContent()
    all += text.items.map(it => ('str' in it ? it.str : '')).join(' ') + ' '
  }
  return all
}

describe('exportProjectPdf — two-part (customer + internal appendix)', () => {
  it('includes the customer summary and internal appendix sections', async () => {
    const text = await pdfText(project)
    expect(text).toContain('RECOMMENDED FLEET')
    expect(text).toContain('INVESTMENT & RETURN')
    expect(text).toContain('INTERNAL APPENDIX')
    expect(text).toContain('MATERIAL FLOWS')
    expect(text).toContain('FLEET BUILD-UP')
    expect(text).toContain('ROM DETAIL')
    // A sized fleet renders a total and the flow route in the appendix.
    expect(text).toMatch(/vehicle/i)
    expect(text).toContain('Dock')
  })
})
