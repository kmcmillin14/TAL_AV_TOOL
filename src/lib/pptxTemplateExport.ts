// Branded ROM PowerPoint export: load the TAL template deck, remove the slides
// the user didn't select (and non-fleet vehicle overviews), fill placeholders,
// and download. Preserves the template's theme/masters/media. Client-side only.
import PizZip from 'pizzip'
import type { StoredProject } from '@/src/lib/storage'
import { removeSlides, replaceInSlides } from '@/src/lib/pptx/ooxml'
import { buildCoverTokens } from '@/src/lib/pptx/tokenMap'
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

const safeName = (s: string | undefined, fallback: string) =>
  (s?.trim() || fallback).replace(/[^\w.-]+/g, '_')

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

  const blob = zip.generate({ type: 'blob', mimeType: PPTX_MIME }) as Blob
  triggerDownload(blob, `${safeName(project.projectName, 'TAL-ROM-Proposal')}.pptx`)
}
