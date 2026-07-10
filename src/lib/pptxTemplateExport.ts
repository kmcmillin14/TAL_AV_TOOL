// Branded ROM PowerPoint export: load the TAL template deck, clone appendix shells
// (verdicts · gate grid · sizing derivations · methodology · cycle math · cost
// detail), remove unselected body slides, fill all body + appendix slides with
// native content, and download. S19 is dropped when no vehicles are assigned —
// the tool never picks a vehicle. This is the only fetch/DOM site in the pptx
// pipeline; src/lib/pptx/* is pure and never fetches. Client-side only.
import PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import { computeFleetModel } from '@/src/lib/fleetModel'
import { projectFilename } from '@/src/lib/projectFilename'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import { removeSlides, replaceInSlides, cloneSlide, setSlideTitle } from '@/src/lib/pptx/ooxml'
import { buildCoverTokens } from '@/src/lib/pptx/tokenMap'
import { fillFinancials, fillCostDetail } from '@/src/lib/pptx/content'
import {
  fillRequirements, fillVehicleCards, fillVerdictAppendix, fillGateGrid,
  fillFleetSizing, buildTierDerivations, fillDerivation,
  fillMaterialFlow, fillInvestment, fillRoi, fillMethodology, fillFlowMath,
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

/** Filename convention: "Rev# Opp# Customer Project.pptx" (shared by all exports). */
function buildFilename(p: StoredProject): string {
  return projectFilename(p, 'pptx')
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
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const serviceLifeYears = project.serviceLifeYears ?? 10

  // ── Appendix shells cloned BEFORE removal/fill (S18 must still be a clean shell).
  // Deck order after contact: verdicts · gate grid · sizing derivations ·
  // methodology · cycle math · cost detail.
  const verdictSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const gridSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const tiers = buildTierDerivations(model, vehicles, names)
  const tierSlides = tiers.map(t => (t.deriv ? cloneSlide(zip, ROM_SLIDE.requirements) : null))
  const methodSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const mathFlows = model.flows.filter(f => f.vehicleId && model.derivedByFlowId.get(f.id)?.breakdown)
  const FLOWS_PER_SLIDE = 9
  const mathPages: Array<{ slide: number; flows: typeof mathFlows }> = []
  for (let i = 0; i < mathFlows.length; i += FLOWS_PER_SLIDE) {
    const slide = cloneSlide(zip, ROM_SLIDE.requirements)
    if (slide != null) mathPages.push({ slide, flows: mathFlows.slice(i, i + FLOWS_PER_SLIDE) })
  }
  const costSlide = model.rom.pricing.totalMid > 0 ? cloneSlide(zip, ROM_SLIDE.requirements) : null

  // ── Remove unselected slides. S19 shows only assigned chassis — nothing
  // assigned means the tool would have to pick, and it never picks: drop it.
  const removed = new Set(slidesToRemove(selection))
  const assignedIds = fleetVehicleIds(project)
  if (assignedIds.length === 0) removed.add(ROM_SLIDE.vehicles)
  removeSlides(zip, [...removed])
  replaceInSlides(zip, buildCoverTokens(project))

  // ── Vehicle photos for the fit cards (only when S19 survives; card renders
  // text-only for any photo that fails to load).
  const photos: Record<string, Uint8Array | null> = {}
  if (!removed.has(ROM_SLIDE.vehicles)) {
    await Promise.all(assignedIds.map(async id => {
      const hero = vehicleById.get(id)?.display.heroImage
      try {
        const r = hero ? await fetch(hero) : null
        photos[id] = r?.ok ? new Uint8Array(await r.arrayBuffer()) : null
      } catch { photos[id] = null }
    }))
  }

  // ── Body slides (each filler no-ops on a removed slide).
  fillRequirements(zip, project)                       // S18
  fillVehicleCards(zip, project, vehicles, photos)     // S19
  fillFleetSizing(zip, model, names)                   // S21
  fillFinancials(zip, model)                           // S25
  fillInvestment(zip, model, names)                    // S27

  // S24 Material Flow — diagram image (browser canvas) on top, table beneath.
  const flowPng = removed.has(ROM_SLIDE.materialFlow) ? null : renderFlowDiagramPng(model.flows, names)
  fillMaterialFlow(zip, model, names, flowPng)

  // S28 ROI — payback-curve chart (browser canvas) on top, metrics table beneath.
  const paybackPng = removed.has(ROM_SLIDE.roi) ? null : renderPaybackChartPng(model.rom)
  fillRoi(zip, model, serviceLifeYears, paybackPng)

  // ── Appendix fills (each guarded non-null).
  if (verdictSlide != null) {
    setSlideTitle(zip, verdictSlide, 'Vehicle screening — verdicts')
    fillVerdictAppendix(zip, verdictSlide, project, vehicles)
  }
  if (gridSlide != null) {
    setSlideTitle(zip, gridSlide, 'Vehicle screening — gate results')
    fillGateGrid(zip, gridSlide, project, vehicles)
  }
  tiers.forEach((tier, i) => {
    const slide = tierSlides[i]
    if (slide == null) return
    setSlideTitle(zip, slide, `Fleet sizing — ${tier.name.toLowerCase()}`)
    fillDerivation(zip, slide, tier)
  })
  if (methodSlide != null) {
    setSlideTitle(zip, methodSlide, 'Methodology — how the fleet is calculated')
    fillMethodology(zip, methodSlide)
  }
  mathPages.forEach((page, i) => {
    const suffix = mathPages.length > 1 ? ` (${i + 1}/${mathPages.length})` : ''
    setSlideTitle(zip, page.slide, `Cycle math — per flow${suffix}`)
    fillFlowMath(zip, page.slide, model, vehicles, names, page.flows)
  })
  if (costSlide != null) {
    setSlideTitle(zip, costSlide, 'Cost model detail')
    fillCostDetail(zip, costSlide, model, serviceLifeYears)
  }

  const blob = zip.generate({ type: 'blob', mimeType: PPTX_MIME }) as Blob
  triggerDownload(blob, buildFilename(project))
}
