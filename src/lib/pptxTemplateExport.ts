// Branded ROM PowerPoint export: load the TAL template deck, remove the slides
// the user didn't select (and non-fleet vehicle overviews), fill placeholders,
// and download. Preserves the template's theme/masters/media. Client-side only.
import PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import { computeFleetModel } from '@/src/lib/fleetModel'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import { removeSlides, replaceInSlides } from '@/src/lib/pptx/ooxml'
import { buildCoverTokens } from '@/src/lib/pptx/tokenMap'
import { fillRomMoney, fillFleetEngineText } from '@/src/lib/pptx/content'
import { fillRequirements, fillMatrix, fillMaterialFlow, fillFleetEngineCharts } from '@/src/lib/pptx/tables'
import { renderFlowDiagramPng } from '@/src/lib/pptx/flowDiagram'
import { renderFleetEngineCharts } from '@/src/lib/pptx/engineChart'
import {
  PPTX_SECTIONS, VEHICLE_SLIDE, slidesToRemove, type PptxSelection,
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

  removeSlides(zip, slidesToRemove(selection))
  replaceInSlides(zip, buildCoverTokens(project))

  // P1/P2: fill the kept step slides with native editable content. Each filler
  // no-ops on any slide the user removed, so these run unconditionally.
  const vehicles = await fetchVehiclesCached()
  const model = computeFleetModel(project, vehicles)
  const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))
  fillRomMoney(zip, model, names)              // S25–28 KPIs / Investment / ROI
  fillRequirements(zip, project)               // S18 Application Requirements
  fillMatrix(zip, project, vehicles)           // S19–20 Vehicle Selection Matrix

  // S21–23 Fleet Engine — canvas charts matching the web app, text fallback.
  const engine = renderFleetEngineCharts(model, names)
  if (engine) fillFleetEngineCharts(zip, engine)
  else fillFleetEngineText(zip, model, names)

  // S24 Material Flow — diagram image (browser canvas) on top, table beneath.
  const flowPng = renderFlowDiagramPng(model.flows, names)
  fillMaterialFlow(zip, model, names, flowPng)

  const blob = zip.generate({ type: 'blob', mimeType: PPTX_MIME }) as Blob
  triggerDownload(blob, buildFilename(project))
}
