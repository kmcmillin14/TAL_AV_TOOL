// Branded ROM PowerPoint export: load the TAL template deck, remove the slides
// the user didn't select (and non-fleet vehicle overviews), fill placeholders,
// and download. Preserves the template's theme/masters/media. Client-side only.
import PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import { computeFleetModel } from '@/src/lib/fleetModel'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import { removeSlides, replaceInSlides, cloneSlide, setSlideTitle } from '@/src/lib/pptx/ooxml'
import { buildCoverTokens } from '@/src/lib/pptx/tokenMap'
import { fillKpis } from '@/src/lib/pptx/content'
import {
  fillRequirements, fillMatrix, fillMaterialFlow, fillFleetEngine, fillInvestment, fillRoi,
  fillMethodology, fillFlowMath,
} from '@/src/lib/pptx/tables'
import { renderFlowDiagramPng } from '@/src/lib/pptx/flowDiagram'
import { renderPaybackChartPng } from '@/src/lib/pptx/romChart'
import {
  PPTX_SECTIONS, VEHICLE_SLIDE, ROM_SLIDE, slidesToRemove, type PptxSelection,
} from '@/src/lib/pptx/sections'

const TEMPLATE_URL = '/templates/tal-rom-template.pptx'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** Distinct vehicleIds assigned to flows in Step 3 — the chassis in the fleet.
 *  Drives which product-overview slides are offered/included. */
export function fleetVehicleIds(project: StoredProject): string[] {
  const ids = new Set<string>()
  for (const f of project.flows ?? []) {
    if (f.vehicleId && f.vehicleId in VEHICLE_SLIDE) ids.add(f.vehicleId)
  }
  return [...ids]
}

/** Everything on by default: all toggleable sections + every fleet vehicle. */
export function defaultSelection(project: StoredProject): PptxSelection {
  const sections: Record<string, boolean> = {}
  for (const s of PPTX_SECTIONS) if (!s.always) sections[s.key] = true
  const vehicles: Record<string, boolean> = {}
  for (const id of fleetVehicleIds(project)) vehicles[id] = true
  return { sections, vehicles }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Filename convention: "Rev# Opp# Customer Project". Empty parts are skipped;
 *  only filesystem-illegal characters are stripped (spaces kept). */
function buildFilename(p: StoredProject): string {
  const oppPrefix = p.opportunityType === 'lead' ? 'LEAD' : 'OPP'
  const opp = p.opportunityNumber?.trim() ? `${oppPrefix}${p.opportunityNumber.trim()}` : ''
  const parts = [p.versionNumber?.trim(), opp, p.customerName?.trim(), p.projectName?.trim()]
    .filter(Boolean) as string[]
  const base = parts.length ? parts.join(' ') : 'TAL ROM Proposal'
  return `${base.replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()}.pptx`
}

/** Build and download the branded ROM deck for the given section/vehicle selection. */
export async function exportBrandedRomPptx(
  project: StoredProject,
  selection: PptxSelection,
): Promise<void> {
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error(`Could not load PPTX template (${res.status})`)
  const buf = await res.arrayBuffer()
  const zip = new PizZip(buf)

  const vehicles = await fetchVehiclesCached()
  const model = computeFleetModel(project, vehicles)
  const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))

  // Append appendix slides cloned from a content shell BEFORE any removal/fill (so
  // the source S18 is still a clean shell). New slides sit past S35, so removeSlides
  // never touches them. Methodology + a paginated per-flow cycle-math appendix.
  const methodSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const mathFlows = model.flows.filter(f => f.vehicleId && model.derivedByFlowId.get(f.id)?.breakdown)
  const FLOWS_PER_SLIDE = 11
  const mathPages: Array<{ slide: number; flows: typeof mathFlows }> = []
  for (let i = 0; i < mathFlows.length; i += FLOWS_PER_SLIDE) {
    const slide = cloneSlide(zip, ROM_SLIDE.requirements)
    if (slide != null) mathPages.push({ slide, flows: mathFlows.slice(i, i + FLOWS_PER_SLIDE) })
  }

  const removed = slidesToRemove(selection)
  removeSlides(zip, removed)
  replaceInSlides(zip, buildCoverTokens(project))

  // Fill the kept step slides with native editable content. Each filler no-ops on
  // any slide the user removed; the canvas images are only rendered when their
  // slide survives (skip the PNG-encode work otherwise).
  fillKpis(zip, model, names)                  // S25–26 KPIs
  fillRequirements(zip, project)               // S18 Application Requirements
  fillMatrix(zip, project, vehicles)           // S19–20 Vehicle Selection Matrix
  fillFleetEngine(zip, model, vehicles, names) // S21–23 Raw / Charging / Buffer tables
  fillInvestment(zip, model, names)            // S27 dynamic per-line pricing table

  // S24 Material Flow — diagram image (browser canvas) on top, table beneath.
  const flowPng = removed.includes(ROM_SLIDE.materialFlow) ? null : renderFlowDiagramPng(model.flows, names)
  fillMaterialFlow(zip, model, names, flowPng)

  // S28 ROI — payback-curve chart (browser canvas) on top, metrics table beneath.
  const paybackPng = removed.includes(ROM_SLIDE.roi) ? null : renderPaybackChartPng(model.rom)
  fillRoi(zip, model, paybackPng)

  // Methodology appendix — variable definitions, formulas, and why. Always
  // included as a reference appendix (not one of the picker's selectable sections).
  if (methodSlide != null) {
    setSlideTitle(zip, methodSlide, 'Methodology — how the fleet is calculated')
    fillMethodology(zip, methodSlide)
  }

  // Per-flow cycle math appendix — each flow's substituted formula → cycle → demand.
  mathPages.forEach((page, i) => {
    const suffix = mathPages.length > 1 ? ` (${i + 1}/${mathPages.length})` : ''
    setSlideTitle(zip, page.slide, `Cycle math — per flow${suffix}`)
    fillFlowMath(zip, page.slide, model, vehicles, names, page.flows)
  })

  const blob = zip.generate({ type: 'blob', mimeType: PPTX_MIME }) as Blob
  triggerDownload(blob, buildFilename(project))
}
