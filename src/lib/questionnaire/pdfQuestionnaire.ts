// Standalone TAL-branded questionnaire PDF. Imports ONLY the shared schema + the
// envelope builder (split-ready: no storage, no calc, no step internals).
import { type PartialProjectFormData } from '@/src/lib/validations/schemas'
import { buildQuestionnaireEnvelope } from './questionnaireExport'
import { winAnsiSafe } from '@/src/lib/utils/winAnsi'
import { lbsToKg, inToCm, ftToM, sqftToM2, fToC, type QUnitSystem } from './useQUnit'

const TAL_RED_RGB = [235 / 255, 10 / 255, 30 / 255] as const

// Always returns a printable string; uses '—' for unanswered fields.
function fmt(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function fmtBool(v: boolean | undefined | null): string {
  if (v == null) return '—'
  return v ? 'Yes' : 'No'
}

export async function exportQuestionnairePdf(p: PartialProjectFormData, unitSystem: QUnitSystem = 'imperial'): Promise<Blob> {
  // Always print both units so the PDF is unambiguous regardless of how it was filled out.
  const fmtFt  = (v: number | null | undefined) => v != null ? `${v} ft / ${+ftToM(v).toFixed(2)} m` : '—'
  const fmtIn  = (v: number | null | undefined) => v != null ? `${v} in / ${+inToCm(v).toFixed(1)} cm` : '—'
  const fmtLbs = (v: number | null | undefined) => v != null ? `${v.toLocaleString()} lbs / ${+lbsToKg(v).toFixed(1)} kg` : '—'
  const fmtSqft = (v: number | null | undefined) => v != null ? `${v.toLocaleString()} sq ft / ${+sqftToM2(v).toFixed(0)} m²` : '—'
  const fmtTemp = (v: number | null | undefined) => v != null ? `${v}°F / ${+fToC(v).toFixed(1)}°C` : '—'
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
  const wrap = (raw: string, useFont: PDFFont, size: number, maxW: number): string[] => {
    if (!raw) return ['']
    const text = winAnsiSafe(raw)
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

  const decorate = (pg: Awaited<ReturnType<typeof pdfDoc.addPage>>) => {
    if (logoImg) {
      const d = logoImg.scaleToFit(110, 40)
      pg.drawImage(logoImg, { x: W - MX - d.width, y: H - 50, width: d.width, height: d.height })
    } else {
      pg.drawText('TAL', { x: W - MX - 40, y: H - 44, size: 20, font: bold, color: TAL_RED })
    }
    const repParts = [p.talRepName, p.talRepEmail, p.talRepPhone].filter(Boolean)
    const footer = repParts.length ? repParts.join('  ·  ') : 'Toyota Advanced Logistics'
    pg.drawText(winAnsiSafe(footer), { x: MX, y: 36, size: 8, font, color: MUTED })
  }

  let page = pdfDoc.addPage([W, H])
  decorate(page)
  let y = 0
  const lineH = 16, bottom = 64
  const VALUE_X = MX + 210, VALUE_W = W - VALUE_X - MX

  const newPage = (title: string) => {
    page = pdfDoc.addPage([W, H]); decorate(page)
    page.drawText(title, { x: MX, y: H - 70, size: 10, font: bold, color: TAL_RED })
    page.drawLine({ start: { x: MX, y: H - 80 }, end: { x: W - MX, y: H - 80 }, thickness: 0.5, color: RULE })
    y = H - 110
  }
  const ensure = (need: number) => { if (y - need < bottom) newPage('CUSTOMER QUESTIONNAIRE (cont.)') }
  const sec = (title: string) => {
    ensure(lineH + 18); y -= 14
    page.drawText(winAnsiSafe(title.toUpperCase()), { x: MX, y, size: 8, font: bold, color: TAL_RED })
    y -= 4
    page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.3, color: RULE })
    y -= lineH - 2
  }

  // Draws a label + value row. Always prints; unanswered fields show '—'.
  const row = (label: string, value: string) => {
    const safe = winAnsiSafe(value)
    const lines = wrap(safe, font, 10, VALUE_W)
    const rowH = Math.max(lineH, lines.length * (lineH - 2) + 2); ensure(rowH)
    page.drawText(winAnsiSafe(label), { x: MX, y, size: 9, font, color: MUTED })
    let ly = y
    for (const l of lines) { page.drawText(l, { x: VALUE_X, y: ly, size: 10, font, color: TEXT }); ly -= lineH - 2 }
    y -= rowH
  }

  // ── Cover header ────────────────────────────────────────────────────────────
  const now = new Date()
  const tz = 'America/New_York'
  const submitted = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
    + ' at ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz })
  page.drawText('AV QUESTIONNAIRE', { x: MX, y: H - 110, size: 10, font: bold, color: TAL_RED })
  page.drawLine({ start: { x: MX, y: H - 120 }, end: { x: W - MX, y: H - 120 }, thickness: 0.5, color: RULE })
  const coverTitle = winAnsiSafe(p.customerName || p.projectName || 'Untitled Opportunity')
  page.drawText(coverTitle, { x: MX, y: H - 156, size: 24, font: bold, color: TEXT })
  if (p.projectName && p.customerName && p.projectName !== p.customerName) {
    page.drawText(winAnsiSafe(p.projectName), { x: MX, y: H - 178, size: 14, font, color: MUTED })
    page.drawText(`Submitted ${submitted}`, { x: MX, y: H - 196, size: 11, font, color: MUTED })
    y = H - 232
  } else {
    page.drawText(`Submitted ${submitted}`, { x: MX, y: H - 178, size: 13, font, color: MUTED })
    y = H - 220
  }

  // ── §01  Submission routing ─────────────────────────────────────────────────
  sec('Submission routing')
  const subTypeLabel: Record<string, string> = {
    customer: 'Customer (direct)',
    dealer: 'Dealer',
    partner: 'Integration partner',
    internal: 'TAL internal',
  }
  row('Submitted by', p.submissionType ? subTypeLabel[p.submissionType] ?? p.submissionType : '—')

  if (p.submissionType === 'dealer') {
    row('Dealer / OEM', fmt([p.oemDealer, p.dealershipName].filter(Boolean).join(' — ')))
    row('Dealer rep', fmt(p.dealerRep))
  }
  if (p.submissionType === 'partner') {
    row('Partner company', fmt(p.partnerCompanyName))
    row('Partner contact', fmt(p.partnerRepContact))
  }
  if (p.submissionType === 'internal') {
    const oppLabel = p.opportunityType === 'lead' ? 'Lead' : p.opportunityType === 'opp' ? 'Opportunity' : '—'
    row('CRM record type', oppLabel)
    row('Lead / Opp number', fmt(p.opportunityNumber))
  }

  // ── §02  Contacts ───────────────────────────────────────────────────────────
  sec('Contacts')
  const custContact = [p.customerContactName, p.customerContactRole].filter(Boolean).join(' — ')
  row('Customer contact', fmt(custContact))
  const custReach = [p.customerContactEmail, p.customerContactPhone].filter(Boolean).join('  ·  ')
  row('Customer email / phone', fmt(custReach))
  row('TAL representative', fmt(p.talRepName))
  const repReach = [p.talRepEmail, p.talRepPhone].filter(Boolean).join('  ·  ')
  row('TAL rep email / phone', fmt(repReach))
  row('Current Toyota forklifts', fmt(p.currentToyotaForklifts))
  row('History with TAL / Toyota', fmt(p.talHistory))

  // ── §03  Opportunity ────────────────────────────────────────────────────────
  sec('Opportunity')
  row('Facility location', fmt(p.facilityLocation))
  row('CAD / drawings available', p.cadAvailable == null ? '—' : p.cadAvailable ? `Yes${p.cadNotes ? ` — ${p.cadNotes}` : ''}` : 'No')

  // ── §04-C  Commercial ───────────────────────────────────────────────────────
  sec('Commercial')
  row('Project stage', fmt(p.projectStage))
  row('Budget status', fmt(p.budgetStatus))
  const budgetStr = p.budgetMin != null || p.budgetMax != null
    ? [p.budgetMin != null ? `$${p.budgetMin.toLocaleString()}` : null, p.budgetMax != null ? `$${p.budgetMax.toLocaleString()}` : null].filter(Boolean).join(' – ')
    : fmt(p.budgetRange)
  row('Budget', budgetStr)
  row('ROI target', p.roiTargetYears != null ? `${p.roiTargetYears} yr${p.roiTargetYears !== 1 ? 's' : ''}` : '—')
  row('RFQ', p.isRfq == null ? '—' : p.isRfq ? `Yes${p.rfqNumber ? ` — ${p.rfqNumber}` : ''}${p.rfqDueDate ? ` (due ${p.rfqDueDate})` : ''}` : 'No')
  row('Decision date', fmt(p.decisionDate))
  row('Target go-live', fmt(p.targetGoLiveDate))

  // ── §04  What you move ──────────────────────────────────────────────────────
  sec('What you move')
  // Prefer multi-select unitLoadTypes; fall back to legacy singular typicalUnitType
  const loadTypes = (p.unitLoadTypes ?? []).length
    ? fmt(p.unitLoadTypes)
    : fmt(p.typicalUnitType ?? p.loads?.[0]?.unitType)
  row('Unit / load types', loadTypes)
  if (p.palletBottomBoard) row('Pallet subtype', fmt(p.palletBottomBoard))
  if (p.palletEntryType) {
    const entryLabels: Record<string, string> = { stringer: 'Stringer (2-way)', block: 'Block (4-way)', not_sure: 'Not sure' }
    row('Pallet bottom board', entryLabels[p.palletEntryType] ?? p.palletEntryType)
  }
  // Print per-load detail rows when multiple loads are defined
  if ((p.loads ?? []).length > 1) {
    for (const ld of p.loads ?? []) {
      const dims = [ld.lengthIn, ld.widthIn, ld.heightIn].some(d => d != null)
        ? [ld.lengthIn, ld.widthIn, ld.heightIn].map(d => d != null ? `${d} in` : '—').join(' × ')
        : null
      const wt = ld.weightLbs != null ? `${ld.weightLbs.toLocaleString()} lbs` : null
      const detail = [ld.unitType || ld.customDescription, dims, wt].filter(Boolean).join('  ·  ')
      row('  Load', fmt(detail))
    }
  } else {
    row('Max load weight', fmtLbs(p.maxLoadWeightLbs))
    const dims = [p.loadLengthIn, p.loadWidthIn, p.loadHeightIn].some(d => d != null)
      ? [p.loadLengthIn, p.loadWidthIn, p.loadHeightIn].map(fmtIn).join(' × ')
      : '—'
    row('Load L × W × H', dims)
  }

  // ── §05  How loads are handled ──────────────────────────────────────────────
  sec('How loads are handled')
  row('Pick loads up from', fmt(p.pickContext))
  row('Set loads down at', fmt(p.dropContext))
  row('Transfer type', fmt(p.transferType))
  row('Transfer height', fmtFt(p.transferHeightFt))
  row('Lift type needed', fmt(p.liftTypeNeeded))
  row('Max lift height', fmtFt(p.maxLiftHeightFt))
  row('Top of roller height', fmtFt(p.topOfRollerHeightFt))
  row('Dwell time at station', p.dwellTimeMin != null ? `${p.dwellTimeMin} min` : '—')
  const chargingLabels: Record<string, string> = { plug_in: 'Plug in', opportunity: 'Opportunity charging', hydrogen: 'Hydrogen refueling', floor_contact: 'Floor contact / pantograph', inductive: 'Inductive (wireless)', battery_swap: 'Battery swap', not_sure: 'Not sure' }
  row('Charging preference', p.chargingStrategyPreference ? chargingLabels[p.chargingStrategyPreference] ?? p.chargingStrategyPreference : '—')

  // ── §06  Facility environment ───────────────────────────────────────────────
  sec('Facility environment')
  row('Facility size', fmtSqft(p.facilitySizeSqFt))
  row('Dock doors', fmt(p.dockDoors))
  row('Indoor / outdoor', p.outdoorRequired == null ? '—' : p.outdoorRequired ? 'Outdoor' : 'Indoor')
  const tempEnvLabels: Record<string, string> = { ambient: 'Ambient', refrigerated: 'Refrigerated', freezer: 'Freezer' }
  row('Temperature environment', p.temperatureEnvironment ? tempEnvLabels[p.temperatureEnvironment] ?? p.temperatureEnvironment : '—')
  row('Min temperature', fmtTemp(p.tempMinF))
  row('Max temperature', fmtTemp(p.tempMaxF))
  row('Dust / moisture', fmt(p.dustMoisture))
  row('Floor condition', fmt(p.floorCondition))
  row('Drive aisle width', fmtFt(p.driveAisleWidthFt))
  row('Picking from racking', fmtBool(p.pickingFromRacking))
  row('Racking aisle width', fmtFt(p.rackingAisleWidthFt))
  row('Shared traffic', fmt(p.sharedTrafficTypes))
  const guidanceLabels: Record<string, string> = { wire: 'Wire-guided', rail: 'Rail-guided' }
  row('VNA guidance type', p.guidanceType ? guidanceLabels[p.guidanceType] ?? p.guidanceType : '—')
  row('Ramps / grades', fmtBool(p.rampRequired))
  row('Max ramp grade', p.maxRampGrade ? `${p.maxRampGrade}%` : '—')
  row('Ramp length', fmtFt(p.rampDistanceFt))

  // ── §07  Schedule ───────────────────────────────────────────────────────────
  sec('Schedule')
  row('Shifts / day', fmt(p.shiftsPerDay))
  row('Hours / shift', fmt(p.hoursPerShift))
  row('Operating days', fmt(p.operatingDaysPattern))
  if ((p.operatingDaysCustom ?? []).length) row('Custom days', fmt(p.operatingDaysCustom))
  row('Breaks / shift', p.breaksPerShift ? `${p.breaksPerShift}` : '—')
  row('Break duration', p.breakDurationMin ? `${p.breakDurationMin} min` : '—')

  // ── §08  Throughput & flows ─────────────────────────────────────────────────
  sec('Throughput & flows')
  row('Average throughput', p.requiredThroughputPerHour ? `${p.requiredThroughputPerHour} moves/hr` : '—')
  row('Peak throughput', p.peakThroughputPerHour ? `${p.peakThroughputPerHour} moves/hr` : '—')
  const distTypeLabelP: Record<string, string> = { one_way: 'one-way', round_trip: 'round trip' }
  const avgDistLabel = p.avgDistanceFt
    ? `${fmtFt(p.avgDistanceFt)}${p.distanceType ? ` (${distTypeLabelP[p.distanceType] ?? p.distanceType})` : ''}`
    : '—'
  row('Average distance', avgDistLabel)
  for (const f of p.flows ?? []) {
    if (!f.origin && !f.destination && !f.distanceFt && !f.thruPerHr) continue
    const distLabel = f.distanceFt ? `${fmtFt(f.distanceFt)}${f.distanceType ? ` ${distTypeLabelP[f.distanceType] ?? f.distanceType}` : ''}` : null
    const parts = [
      `${f.origin || '?'} → ${f.destination || '?'}`,
      distLabel,
      f.thruPerHr ? `${f.thruPerHr}/hr` : null,
    ].filter(Boolean).join('  ·  ')
    row(f.sectionName ? `Flow (${f.sectionName})` : 'Flow', parts)
  }

  // ── §09  Vehicles & interests ───────────────────────────────────────────────
  sec('Vehicles & interests')
  row('Vehicles of interest', fmt(p.vehiclesOfInterest?.length ? p.vehiclesOfInterest : null))
  row('Vehicle in mind', fmt(p.vehicleInMind))
  row('Specialty applications', fmt(p.specialtyApplications))
  row('Install date', fmt(p.desiredInstallDate))

  // ── §10  Certifications & controls ─────────────────────────────────────────
  sec('Certifications & controls')
  row('Certifications', fmt(p.certifications))
  row('Interlocks', fmt(p.interlocks))
  row('Hazard zone classification', fmt(p.hazardZoneClassification))
  row('Barcode scanning required', fmtBool(p.barcodeScanningRequired))
  row('WMS required', fmtBool(p.wmsRequired))
  if (p.wmsRequired) {
    row('WMS vendor', fmt(p.wmsVendor))
    const ifaceLabels: Record<string, string> = {
      rest_api: 'REST API', file: 'File-based', middleware: 'Middleware', other: 'Other',
    }
    row('WMS interface type', p.wmsInterfaceType ? ifaceLabels[p.wmsInterfaceType] ?? p.wmsInterfaceType : '—')
    const apiLabels: Record<string, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure' }
    row('REST API available', p.restApiAvailable ? apiLabels[p.restApiAvailable] ?? p.restApiAvailable : '—')
    const scanLabels: Record<string, string> = {
      barcode: 'Barcode', qr: 'QR code', rfid: 'RFID', none: 'None',
    }
    row('Tagging / scan method', p.taggingScanMethod ? scanLabels[p.taggingScanMethod] ?? p.taggingScanMethod : '—')
  }

  // ── §11  Technology & network ───────────────────────────────────────────────
  sec('Technology & network')
  row('Network ready', fmtBool(p.networkReady))
  row('IT contact', fmt(p.itContact))
  row('Site walkthrough available', fmtBool(p.siteWalkthroughAvailable))

  // ── §12  Current state ──────────────────────────────────────────────────────
  sec('Current state')
  row('Existing automation', fmtBool(p.hasExistingAutomation))
  if (p.hasExistingAutomation) {
    row('Automation (brand / fleet)', fmt(p.existingAutomation))
    row('Interoperability notes', fmt(p.existingAutomationInterop))
  }
  row('Why automating', fmt(p.projectDrivers))
  row('Current process', fmt(p.currentProcess))
  row('People / forklifts doing this today', p.currentHeadcount != null ? `${p.currentHeadcount}` : '—')
  row('Operators doing task per shift', p.operatorsPerShift ? `${p.operatorsPerShift}` : '—')
  row('Fully burdened rate', p.fullyBurdenedRateUsdPerYear != null ? `$${p.fullyBurdenedRateUsdPerYear.toLocaleString()}/yr per operator` : '—')
  row('Volume growth', fmt(p.volumeGrowthNote))
  row('Seasonality', fmt(p.seasonalityNote))

  // ── §13  Notes ──────────────────────────────────────────────────────────────
  if (p.projectNotes) {
    sec('Notes')
    row('Notes', fmt(p.projectNotes))
  }

  // ── Embed JSON envelope ──────────────────────────────────────────────────────
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
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileBase(p: PartialProjectFormData): string {
  const name = (p.customerName || p.projectName || 'questionnaire').replace(/[^a-z0-9-_]+/gi, '_')
  const date = new Date().toISOString().slice(0, 10)
  return `${name}_AV-Questionnaire_${date}`
}

export async function downloadQuestionnairePdf(p: PartialProjectFormData, unitSystem: QUnitSystem = 'imperial'): Promise<void> {
  triggerDownload(await exportQuestionnairePdf(p, unitSystem), `${fileBase(p)}.pdf`)
}
