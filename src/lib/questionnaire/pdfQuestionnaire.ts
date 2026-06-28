// Standalone TAL-branded questionnaire PDF. Imports ONLY the shared schema + the
// envelope builder (split-ready: no storage, no calc, no step internals).
import { type PartialProjectFormData } from '@/src/lib/validations/schemas'
import { buildQuestionnaireEnvelope } from './questionnaireExport'

const TAL_RED_RGB = [235 / 255, 10 / 255, 30 / 255] as const

function fmt(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export async function exportQuestionnairePdf(p: PartialProjectFormData): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  pdfDoc.setTitle(`${p.customerName || p.projectName || 'TAL'} — AV Questionnaire`)
  pdfDoc.setAuthor('TAL Fleet Calculator')
  pdfDoc.setSubject('AGV/AMR Customer Questionnaire')

  const TAL_RED = rgb(...TAL_RED_RGB)
  const TEXT = rgb(0.1, 0.1, 0.12)
  const MUTED = rgb(0.45, 0.45, 0.5)
  const RULE = rgb(0.85, 0.85, 0.88)
  const W = 612, H = 792, MX = 56

  type PDFFont = Awaited<ReturnType<typeof pdfDoc.embedFont>>
  const wrap = (text: string, useFont: PDFFont, size: number, maxW: number): string[] => {
    if (!text) return ['']
    const out: string[] = []
    for (const para of text.split(/\n+/)) {
      const words = para.split(/\s+/).filter(Boolean)
      if (!words.length) { out.push(''); continue }
      let cur = ''
      for (const word of words) {
        const cand = cur ? `${cur} ${word}` : word
        if (useFont.widthOfTextAtSize(cand, size) > maxW && cur) { out.push(cur); cur = word }
        else cur = cand
      }
      if (cur) out.push(cur)
    }
    return out
  }

  let logoImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
  try {
    const res = await fetch('/assets/TAL-Logo-Black.png')
    if (res.ok) logoImg = await pdfDoc.embedPng(new Uint8Array(await res.arrayBuffer()))
  } catch { /* logo optional */ }

  // Every page: TAL logo top-right + footer contact line.
  const decorate = (page: Awaited<ReturnType<typeof pdfDoc.addPage>>) => {
    if (logoImg) {
      const d = logoImg.scaleToFit(110, 40)
      page.drawImage(logoImg, { x: W - MX - d.width, y: H - 50, width: d.width, height: d.height })
    } else {
      page.drawText('TAL', { x: W - MX - 40, y: H - 44, size: 20, font: bold, color: TAL_RED })
    }
    const footer = fmt([p.talRepName, p.talRepEmail, p.talRepPhone].filter(Boolean).join('  ·  ') || 'Toyota Advanced Logistics')
    page.drawText(footer, { x: MX, y: 36, size: 8, font, color: MUTED })
  }

  let page = pdfDoc.addPage([W, H])
  decorate(page)
  let y = 0
  const lineH = 16, bottom = 64
  const VALUE_X = MX + 200, VALUE_W = W - VALUE_X - MX

  const newPage = (title: string) => {
    page = pdfDoc.addPage([W, H]); decorate(page)
    page.drawText(title, { x: MX, y: H - 70, size: 10, font: bold, color: TAL_RED })
    page.drawLine({ start: { x: MX, y: H - 80 }, end: { x: W - MX, y: H - 80 }, thickness: 0.5, color: RULE })
    y = H - 110
  }
  const ensure = (need: number) => { if (y - need < bottom) newPage('CUSTOMER QUESTIONNAIRE (cont.)') }
  const sec = (title: string) => {
    ensure(lineH + 14); y -= 10
    page.drawText(title, { x: MX, y, size: 10, font: bold, color: TEXT }); y -= lineH + 4
  }
  const row = (label: string, value: unknown) => {
    const lines = wrap(fmt(value), font, 10, VALUE_W)
    const rowH = Math.max(lineH, lines.length * (lineH - 2)); ensure(rowH)
    page.drawText(label, { x: MX, y, size: 9, font, color: MUTED })
    let ly = y
    for (const l of lines) { page.drawText(l, { x: VALUE_X, y: ly, size: 10, font, color: TEXT }); ly -= lineH - 2 }
    y -= rowH
  }

  // ── Cover header ── title = company, dated by submission day.
  const submitted = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  page.drawText('AV QUESTIONNAIRE', { x: MX, y: H - 110, size: 10, font: bold, color: TAL_RED })
  page.drawLine({ start: { x: MX, y: H - 120 }, end: { x: W - MX, y: H - 120 }, thickness: 0.5, color: RULE })
  page.drawText(p.customerName || p.projectName || 'Untitled Opportunity', { x: MX, y: H - 156, size: 24, font: bold, color: TEXT })
  page.drawText(`Submitted ${submitted}`, { x: MX, y: H - 178, size: 13, font, color: MUTED })
  y = H - 220

  sec('Contacts')
  row('Customer contact', [p.customerContactName, p.customerContactRole].filter(Boolean).join(' — '))
  row('Customer email / phone', [p.customerContactEmail, p.customerContactPhone].filter(Boolean).join('  ·  '))
  row('TAL representative', p.talRepName)
  row('Dealer', [p.oemDealer, p.dealershipName, p.dealerRep].filter(Boolean).join(' — '))
  row('History with TAL / Toyota', p.talHistory)

  sec('Opportunity')
  row('Vehicle in mind', p.vehicleInMind)
  row('RFQ', p.isRfq ? `Yes${p.rfqNumber ? ` (${p.rfqNumber})` : ''}` : 'No')
  row('RFQ due date', p.rfqDueDate)
  row('CAD / drawings available', p.cadAvailable ? `Yes${p.cadNotes ? ` — ${p.cadNotes}` : ''}` : 'No')
  row('Project stage', p.projectStage)
  row('Budget status', p.budgetStatus)
  row('Budget range', p.budgetRange)
  row('Decision date', p.decisionDate)
  row('Target go-live', p.targetGoLiveDate)

  sec('Why & how today')
  row('Drivers', p.projectDrivers)
  row('Current process', p.currentProcess)
  row('Volume growth', p.volumeGrowthNote)
  row('Seasonality', p.seasonalityNote)
  row('Existing automation', p.existingAutomation)

  sec('What you’re interested in')
  row('Specialty applications', p.specialtyApplications)
  row('Vehicles of interest', (p.vehiclesOfInterest ?? []).length ? p.vehiclesOfInterest : null)
  row('Other / not listed', p.vehicleInMind)

  sec('What you move')
  row('Unit / load type', p.typicalUnitType ?? (p.loads?.[0]?.unitType))
  row('Max load weight', p.maxLoadWeightLbs ? `${p.maxLoadWeightLbs.toLocaleString()} lbs` : null)
  row('Load L × W × H', [p.loadLengthIn, p.loadWidthIn, p.loadHeightIn].some(d => d != null)
    ? [p.loadLengthIn, p.loadWidthIn, p.loadHeightIn].map(d => d != null ? `${d} in` : '—').join(' × ')
    : null)

  sec('How loads are handled')
  row('Pick loads up from', p.pickContext)
  row('Set loads down at', p.dropContext)
  row('Transfer type', p.transferType)
  row('Transfer height', p.transferHeightFt != null ? `${p.transferHeightFt} ft` : null)

  sec('Environment & site')
  row('Facility size', p.facilitySizeSqFt ? `${p.facilitySizeSqFt.toLocaleString()} sq ft` : null)
  row('Dock doors', p.dockDoors)
  row('Min aisle width', p.minAisleWidthFt != null ? `${p.minAisleWidthFt} ft` : null)
  row('Network ready', p.networkReady)
  row('Site walkthrough available', p.siteWalkthroughAvailable)
  row('Min temperature', p.tempMinF != null ? `${p.tempMinF}°F` : null)
  row('Max temperature', p.tempMaxF != null ? `${p.tempMaxF}°F` : null)

  sec('Schedule')
  row('Shifts / day', p.shiftsPerDay)
  row('Hours / shift', p.hoursPerShift)
  row('Operating days', p.operatingDaysPattern)

  sec('Throughput')
  row('Average throughput', p.requiredThroughputPerHour ? `${p.requiredThroughputPerHour} moves/hr` : null)
  row('Peak throughput', p.peakThroughputPerHour ? `${p.peakThroughputPerHour} moves/hr` : null)
  row('Average distance', p.avgDistanceFt ? `${p.avgDistanceFt} ft` : null)

  sec('Notes')
  row('Notes', p.projectNotes)

  // ── Embed JSON envelope ──
  const env = buildQuestionnaireEnvelope(p)
  const bytes = new TextEncoder().encode(JSON.stringify(env, null, 2))
  await pdfDoc.attach(bytes, 'project.json', {
    mimeType: 'application/json',
    description: 'TAL Fleet Calculator project data',
    creationDate: new Date(), modificationDate: new Date(),
  })

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes.slice()], { type: 'application/pdf' })
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function fileBase(p: PartialProjectFormData): string {
  const name = (p.customerName || p.projectName || 'questionnaire').replace(/[^a-z0-9-_]+/gi, '_')
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${name}_AV-Questionnaire_${date}`
}

export async function downloadQuestionnairePdf(p: PartialProjectFormData): Promise<void> {
  triggerDownload(await exportQuestionnairePdf(p), `${fileBase(p)}.pdf`)
}
