import { SCHEMA_VERSION, type StoredProject } from './storage'
import { winAnsiSafe } from './utils/winAnsi'
import { qualifyVehicle } from '../calc/trafficLight'
import { appRequirementsFromProject } from './appRequirements'
import type { Vehicle } from './vehicleLibrary'
import type { QualificationResult } from '../calc/types'

export interface ProjectExportPayload {
  schemaVersion: number
  exportedAt: string
  project: StoredProject
}

function buildPayload(project: StoredProject): ProjectExportPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  }
}

async function fetchVehiclesSafe(): Promise<Vehicle[]> {
  try {
    const res = await fetch('/api/vehicles')
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as Vehicle[]) : []
  } catch {
    return []
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtOpp(p: StoredProject): string {
  if (!p.opportunityNumber) return '—'
  const prefix = p.opportunityType === 'lead' ? 'LEAD-' : 'OPP-'
  return `${prefix}${p.opportunityNumber}`
}

function joinList(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' · ') || '—'
}

function statusReasonSummary(result: QualificationResult): string {
  const failed = [...result.hardGates, ...result.softPreferences]
    .filter(g => !g.skipped && !g.passed)
  if (failed.length === 0) return 'All evaluated gates pass.'
  return failed.map(g => `${g.name}: ${g.reason}`).join(' | ')
}

export async function exportProjectPdf(project: StoredProject): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdfDoc.embedFont(StandardFonts.Courier)

  pdfDoc.setTitle(project.projectName || 'TAL Fleet Calculator Project')
  pdfDoc.setAuthor('TAL Fleet Calculator')
  pdfDoc.setSubject('AGV/AMR Fleet Sizing Proposal')
  pdfDoc.setCreator('TAL Fleet Calculator')

  const TAL_RED = rgb(235 / 255, 10 / 255, 30 / 255)
  const TEXT = rgb(0.1, 0.1, 0.12)
  const MUTED = rgb(0.45, 0.45, 0.5)
  const RULE = rgb(0.85, 0.85, 0.88)

  const W = 612
  const H = 792
  const MX = 56

  // ─────────── text-wrapping helper ───────────
  type PDFFont = Awaited<ReturnType<typeof pdfDoc.embedFont>>
  const wrapText = (raw: string, useFont: PDFFont, size: number, maxWidth: number): string[] => {
    if (!raw) return ['']
    const text = winAnsiSafe(raw)   // WinAnsi font can't measure/draw e.g. "→"
    const paragraphs = text.split(/\n+/)
    const out: string[] = []
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean)
      if (words.length === 0) {
        out.push('')
        continue
      }
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        const w = useFont.widthOfTextAtSize(candidate, size)
        if (w > maxWidth && current) {
          out.push(current)
          current = word
        } else {
          current = candidate
        }
      }
      if (current) out.push(current)
    }
    return out
  }

  let logoImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
  try {
    const logoRes = await fetch('/assets/TAL-Logo-Black.png')
    if (logoRes.ok) {
      const bytes = new Uint8Array(await logoRes.arrayBuffer())
      logoImg = await pdfDoc.embedPng(bytes)
    }
  } catch { /* logo optional */ }

  // ─────────── PAGE 1: COVER ───────────
  {
    const page = pdfDoc.addPage([W, H])

    if (logoImg) {
      const dims = logoImg.scaleToFit(140, 50)
      page.drawImage(logoImg, { x: MX, y: H - 90, width: dims.width, height: dims.height })
    } else {
      page.drawText('TAL', { x: MX, y: H - 70, size: 28, font: bold, color: TAL_RED })
    }

    page.drawText('FLEET SIZING PROPOSAL', {
      x: MX, y: H - 130, size: 10, font: bold, color: TAL_RED,
      // letter-spacing via character spacing is awkward in pdf-lib; rely on caps
    })
    page.drawLine({
      start: { x: MX, y: H - 140 },
      end: { x: W - MX, y: H - 140 },
      thickness: 0.5,
      color: RULE,
    })

    const nameLines = wrapText(
      project.projectName || 'Untitled Project',
      bold, 28, W - 2 * MX,
    )
    let titleY = H - 200
    for (const line of nameLines) {
      page.drawText(line, { x: MX, y: titleY, size: 28, font: bold, color: TEXT })
      titleY -= 34
    }
    page.drawText(winAnsiSafe(project.customerName || 'Customer —'), {
      x: MX, y: titleY + 4, size: 14, font, color: MUTED,
    })

    // Meta block
    const rows: Array<[string, string]> = [
      ['Location',     project.facilityLocation || '—'],
      ['TAL Engineer', project.bastianRep || '—'],
      ['Opportunity',  fmtOpp(project)],
      ['Revision',     project.versionNumber || '—'],
      ['Date',         formatDate(project.createdAt)],
    ]
    let y = titleY - 50
    for (const [k, v] of rows) {
      page.drawText(k.toUpperCase(), { x: MX, y, size: 8, font: bold, color: MUTED })
      page.drawText(winAnsiSafe(v), { x: MX + 110, y, size: 11, font, color: TEXT })
      y -= 22
    }

    // Footer note
    page.drawText('Project data is embedded as a JSON attachment.', {
      x: MX, y: 60, size: 8, font, color: MUTED,
    })
    page.drawText('Open in Adobe Reader to access the attachments panel.', {
      x: MX, y: 48, size: 8, font, color: MUTED,
    })
  }

  // ─────────── APPLICATION REQUIREMENTS (auto-paginates) ───────────
  {
    let page = pdfDoc.addPage([W, H])
    let y = 0
    const lineH = 16
    const sectionGapTop = 10
    const sectionGapBottom = 4
    const bottomMargin = 70

    const drawHeader = () => {
      page.drawText('APPLICATION REQUIREMENTS', {
        x: MX, y: H - 60, size: 10, font: bold, color: TAL_RED,
      })
      page.drawLine({
        start: { x: MX, y: H - 70 },
        end: { x: W - MX, y: H - 70 },
        thickness: 0.5, color: RULE,
      })
      y = H - 100
    }
    const ensureRoom = (needed: number) => {
      if (y - needed < bottomMargin) {
        page = pdfDoc.addPage([W, H])
        drawHeader()
        page.drawText('(continued)', { x: W - MX - 60, y: H - 60, size: 8, font, color: MUTED })
      }
    }
    const sec = (title: string) => {
      ensureRoom(lineH + sectionGapTop + sectionGapBottom)
      y -= sectionGapTop
      page.drawText(title, { x: MX, y, size: 10, font: bold, color: TEXT })
      y -= lineH + sectionGapBottom
    }
    const VALUE_X = MX + 200
    const VALUE_WIDTH = W - VALUE_X - MX
    const row = (label: string, value: string | number | null | undefined) => {
      const display = value == null || value === '' ? '—' : String(value)
      const lines = wrapText(display, font, 10, VALUE_WIDTH)
      const rowH = Math.max(lineH, lines.length * (lineH - 2))
      ensureRoom(rowH)
      page.drawText(label, { x: MX, y, size: 9, font, color: MUTED })
      let ly = y
      for (const line of lines) {
        page.drawText(line, { x: VALUE_X, y: ly, size: 10, font, color: TEXT })
        ly -= lineH - 2
      }
      y -= rowH
    }

    drawHeader()

    sec('Section 1 — What are you moving?')
    if ((project.loads?.length ?? 0) > 1) {
      // Multi-load: one block per load. (Single-load projects keep the legacy
      // rows below — loads[0] is mirrored into them on save.)
      project.loads!.forEach((l, i) => {
        row(`Load ${i + 1} — type`, l.unitType)
        row(`Load ${i + 1} — weight`, l.weightLbs ? `${l.weightLbs.toLocaleString()} lbs` : null)
        row(`Load ${i + 1} — L × W × H`, joinList([
          l.lengthIn ? `${l.lengthIn} in` : null,
          l.widthIn  ? `${l.widthIn} in`  : null,
          l.heightIn ? `${l.heightIn} in` : null,
        ]))
        row(`Load ${i + 1} — pallet subtype`, l.palletSubtype)
        row(`Load ${i + 1} — description`, l.customDescription || l.otherDescription)
      })
    } else {
      row('Max load weight', project.maxLoadWeightLbs ? `${project.maxLoadWeightLbs.toLocaleString()} lbs` : null)
      row('Unit / load type', project.typicalUnitType)
      row('Pallet subtype', project.palletBottomBoard)
      row('Custom pallet', project.customPalletDescription)
      row('Other unit description', project.otherUnitTypeDescription)
      row('Load (L × W × H)', joinList([
        project.loadLengthIn ? `${project.loadLengthIn} in` : null,
        project.loadWidthIn  ? `${project.loadWidthIn} in`  : null,
        project.loadHeightIn ? `${project.loadHeightIn} in` : null,
      ]))
    }

    sec('Section 2 — How is it transferred?')
    row('Transfer method', project.transferMethod)
    row('Delivery pattern', project.deliveryPattern)
    row('Pick height', project.pickHeightFt != null ? `${project.pickHeightFt} ft` : null)
    row('Drop height', project.dropHeightFt != null ? `${project.dropHeightFt} ft` : null)

    sec('Section 3 — Where does it operate?')
    row('Min aisle width', project.minAisleWidthFt ? `${project.minAisleWidthFt} ft` : null)
    row('Floor condition', project.floorCondition)

    sec('Section 4 — Operating schedule')
    row('Shifts / day', project.shiftsPerDay)
    row('Hours / shift', project.hoursPerShift)
    row('Operating days', project.operatingDaysPattern)
    row('Operating days (custom)', Array.isArray(project.operatingDaysCustom) ? project.operatingDaysCustom.join(', ') : null)
    row('Breaks / shift', project.breaksPerShift)
    row('Break duration', project.breakDurationMin ? `${project.breakDurationMin} min` : null)

    sec('Section 5 — Throughput & distance')
    row('Required throughput', project.requiredThroughputPerHour ? `${project.requiredThroughputPerHour} moves/hr` : null)
    row('Average distance', project.avgDistanceFt ? `${project.avgDistanceFt} ft` : null)
    row('Distance type', project.distanceType)

    sec('Section 6 — Labor & ROI')
    row('Operators / shift', project.operatorsPerShift)

    sec('Section 7 — Ramps & inclines')
    row('Ramp distance', project.rampDistanceFt ? `${project.rampDistanceFt} ft` : null)
    row('Max ramp grade', project.maxRampGrade ? `${project.maxRampGrade}%` : null)

    sec('Section 8 — Opportunity & Contact')
    row('Vehicle in mind', project.vehicleInMind)
    row('RFQ', project.isRfq ? `Yes${project.rfqNumber ? ` (${project.rfqNumber})` : ''}` : null)
    row('CAD available', project.cadAvailable ? 'Yes' : null)
    row('Project stage', project.projectStage)
    row('Budget', joinList([project.budgetStatus, project.budgetRange]))
    row('Drivers', (project.projectDrivers ?? []).join(', ') || null)
    row('Specialty applications', (project.specialtyApplications ?? []).join(', ') || null)
    row('Target go-live', project.targetGoLiveDate)
    row('Customer contact', joinList([project.customerContactName, project.customerContactEmail]))
    row('TAL representative', joinList([project.talRepName, project.talRepEmail]))
    row('OEM dealer', project.oemDealer)
    row('Dealership name', project.dealershipName)
    row('Dealer representative', project.dealerRep)

    sec('Section 9 — Certifications')
    row('Required certifications', (project.certifications ?? []).join(', ') || null)

    sec('Section 10 — Equipment integration')
    row('Required interlocks', (project.interlocks ?? []).join(', ') || null)
    row('Other AGVs on site', project.otherAGVs ? 'Yes' : 'No')
    row('Other AGV vendor', project.otherAGVVendor)

    sec('Section 11 — Environment')
    row('Min temperature', project.tempMinF != null ? `${project.tempMinF}°F` : null)
    row('Max temperature', project.tempMaxF != null ? `${project.tempMaxF}°F` : null)
    row('Outdoor required', project.outdoorRequired ? 'Yes' : 'No')
    row('Freezer required', project.freezerCapable ? 'Yes' : 'No')
    row('Dust / moisture', project.dustMoisture)

    sec('Section 12 — Software integration')
    row('WMS required', project.wmsRequired ? 'Yes' : 'No')
    row('WMS vendor', project.wmsVendor)

    sec('Section 13 — Project notes')
    row('Notes', project.projectNotes)
  }

  // ─────────── PAGE 3: VEHICLE COMPATIBILITY ───────────
  const vehicles = await fetchVehiclesSafe()
  if (vehicles.length > 0) {
    const page = pdfDoc.addPage([W, H])
    page.drawText('VEHICLE COMPATIBILITY', {
      x: MX, y: H - 60, size: 10, font: bold, color: TAL_RED,
    })
    page.drawLine({
      start: { x: MX, y: H - 70 },
      end: { x: W - MX, y: H - 70 },
      thickness: 0.5, color: RULE,
    })
    page.drawText('Informational only — vehicles evaluated against the requirements on page 2.', {
      x: MX, y: H - 88, size: 9, font, color: MUTED,
    })

    let y = H - 120
    const appReq = appRequirementsFromProject(project)
    for (const vehicle of vehicles) {
      if (y < 100) break
      const result = qualifyVehicle(vehicle, appReq)
      const statusColor =
        result.status === 'GREEN'  ? rgb(0.18, 0.7, 0.35) :
        result.status === 'YELLOW' ? rgb(0.85, 0.65, 0.10) :
        rgb(0.85, 0.20, 0.20)

      page.drawCircle({ x: MX + 5, y: y + 4, size: 4, color: statusColor })
      page.drawText(vehicle.name, { x: MX + 18, y, size: 11, font: bold, color: TEXT })
      page.drawText(vehicle.display.manufacturer, { x: MX + 18, y: y - 12, size: 8, font, color: MUTED })
      page.drawText(result.status, { x: W - MX - 60, y, size: 9, font: bold, color: statusColor })
      y -= 16

      const reason = statusReasonSummary(result)
      const reasonLines = wrapText(reason, mono, 8, W - MX - 18 - MX)
      for (const line of reasonLines.slice(0, 3)) {
        if (y < 80) break
        page.drawText(line, { x: MX + 18, y, size: 8, font: mono, color: MUTED })
        y -= 10
      }
      y -= 8
    }
  }

  // ─────────── EMBED JSON ───────────
  const payload = buildPayload(project)
  const jsonText = JSON.stringify(payload, null, 2)
  const jsonBytes = new TextEncoder().encode(jsonText)
  await pdfDoc.attach(jsonBytes, 'project.json', {
    mimeType: 'application/json',
    description: 'TAL Fleet Calculator project data',
    creationDate: new Date(),
    modificationDate: new Date(),
  })

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes.slice()], { type: 'application/pdf' })
}

export function projectJsonBlob(project: StoredProject): Blob {
  const payload = buildPayload(project)
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

function filename(project: StoredProject, ext: string): string {
  const base = (project.projectName || 'project').replace(/[^a-z0-9-_]+/gi, '_')
  const rev = project.versionNumber ? `_${project.versionNumber}` : ''
  return `${base}${rev}.${ext}`
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Download the project as a single PDF with embedded JSON attachment. */
export async function downloadProjectPdf(project: StoredProject): Promise<void> {
  const pdfBlob = await exportProjectPdf(project)
  triggerDownload(pdfBlob, filename(project, 'pdf'))
}
