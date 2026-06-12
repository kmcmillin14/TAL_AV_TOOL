// PowerPoint proposal export — client-side via pptxgenjs (no backend, per
// ARCHITECTURE.md), dynamically imported. Dark TAL-styled deck: title,
// requirements, fleet build-up, ROM. 'Toyota Type' is requested as the font
// face; PowerPoint falls back gracefully where the font isn't installed.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import { computeFleetModel } from './fleetModel'

const BG = '17191D'        // dark surface
const BG_CARD = '212429'
const TEXT = 'F5F6F7'
const MUTED = '9AA0A6'
const ACCENT = 'EB0A1E'    // TAL red
const FONT = 'Toyota Type'

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

export async function downloadProjectPptx(project: StoredProject, vehicles: Vehicle[]): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const { flows, settings, fleet, rom, costs } = computeFleetModel(project, vehicles)

  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'WIDE'
  pptx.defineSlideMaster({
    title: 'TAL',
    background: { color: BG },
    objects: [
      { rect: { x: 0, y: 7.28, w: '100%', h: 0.22, fill: { color: ACCENT } } },
      { text: { text: 'TAL Fleet Calculator — ROM proposal (budgetary, not a quote)', options: {
        x: 0.5, y: 6.95, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED } } },
    ],
  })

  const totalThru = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  // ── 1 · Title ──────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide({ masterName: 'TAL' })
    s.addText('AGV / AMR FLEET PROPOSAL', { x: 0.6, y: 1.6, w: 12, h: 0.5, fontFace: FONT, fontSize: 14, color: ACCENT, charSpacing: 4, bold: true })
    s.addText(project.projectName || 'Untitled project', { x: 0.6, y: 2.1, w: 12, h: 1.2, fontFace: FONT, fontSize: 44, color: TEXT, bold: true })
    s.addText([
      { text: project.customerName || '—', options: { fontSize: 20, color: TEXT } },
      { text: project.facilityLocation ? `   ·   ${project.facilityLocation}` : '', options: { fontSize: 20, color: MUTED } },
    ], { x: 0.6, y: 3.4, w: 12, h: 0.5, fontFace: FONT })
    s.addText(
      `${project.versionNumber || 'v1.0'}   ·   ${new Date().toLocaleDateString()}   ·   ${project.bastianRep ? `TAL engineer: ${project.bastianRep}` : 'TAL Engineering'}`,
      { x: 0.6, y: 4.0, w: 12, h: 0.4, fontFace: FONT, fontSize: 13, color: MUTED },
    )
  }

  // ── 2 · Application requirements ──────────────────────────────────────────
  {
    const s = pptx.addSlide({ masterName: 'TAL' })
    s.addText('Application Requirements', { x: 0.6, y: 0.45, w: 12, h: 0.6, fontFace: FONT, fontSize: 26, color: TEXT, bold: true })
    const loads = project.loads?.length
      ? project.loads
      : [{ id: 'legacy', unitType: project.typicalUnitType ?? '', lengthIn: project.loadLengthIn, widthIn: project.loadWidthIn, heightIn: project.loadHeightIn, weightLbs: project.maxLoadWeightLbs }]
    const rows: string[][] = [
      ['Loads', loads.map(l => {
        const dims = [l.lengthIn, l.widthIn, l.heightIn].every(v => v) ? ` (${l.lengthIn}×${l.widthIn}×${l.heightIn} in)` : ''
        const wt = l.weightLbs ? ` · ${l.weightLbs.toLocaleString()} lbs` : ''
        return `${l.unitType || '—'}${dims}${wt}`
      }).join('\n')],
      ['Transfer', `${project.transferMethod || '—'} · ${project.deliveryPattern || '—'}${project.maxLiftHeightFt ? ` · lift to ${project.maxLiftHeightFt} ft` : ''}`],
      ['Environment', `${project.tempMinF ?? '—'}–${project.tempMaxF ?? '—'} °F${project.outdoorRequired ? ' · outdoor' : ''}${project.freezerCapable ? ' · freezer' : ''}${project.maxRampGrade ? ` · ramps to ${project.maxRampGrade}%` : ''}`],
      ['Schedule', `${project.shiftsPerDay ?? 1} shift(s) × ${project.hoursPerShift ?? 8} h = ${settings.dailyOpHr} h/day · ${costs.operatingDaysPerYear} days/yr`],
      ['Demand', `${flows.length} flow(s) · ${totalThru} moves/hr peak`],
    ]
    s.addTable(rows.map(([k, v]) => ([
      { text: k, options: { fontFace: FONT, fontSize: 13, color: ACCENT, bold: true, fill: { color: BG_CARD } } },
      { text: v, options: { fontFace: FONT, fontSize: 13, color: TEXT, fill: { color: BG_CARD } } },
    ])), { x: 0.6, y: 1.3, w: 12.1, colW: [2.4, 9.7], border: { type: 'solid', color: BG, pt: 1 }, rowH: 0.55 })
  }

  // ── 3 · Fleet build-up ────────────────────────────────────────────────────
  {
    const s = pptx.addSlide({ masterName: 'TAL' })
    s.addText('Fleet Build-Up', { x: 0.6, y: 0.45, w: 12, h: 0.6, fontFace: FONT, fontSize: 26, color: TEXT, bold: true })
    s.addText(`${fleet.totalFleetSold}`, { x: 0.6, y: 1.2, w: 3.2, h: 1.6, fontFace: FONT, fontSize: 80, color: ACCENT, bold: true })
    s.addText('vehicles total', { x: 0.7, y: 2.7, w: 3, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED })
    s.addText(
      `Raw ${fleet.totalBaseFleet}   +   Charging ${fleet.totalChargingDelta}   ×   Buffer ${(1 + settings.bufferPct).toFixed(2)}   =   ${fleet.totalFleetSold}`,
      { x: 0.6, y: 3.3, w: 12, h: 0.45, fontFace: FONT, fontSize: 16, color: TEXT },
    )
    const header = ['Vehicle', 'Raw', 'Base', '+Chg', 'Sold'].map(t =>
      ({ text: t, options: { fontFace: FONT, fontSize: 12, color: MUTED, bold: true, fill: { color: BG_CARD } } }))
    const body = fleet.groups.map(g => ([
      { text: vehicleById.get(g.vehicleId)?.name ?? g.vehicleId, options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: g.groupRaw.toFixed(2), options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: String(g.baseFleet), options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: String(g.charging.chargingDelta), options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: String(g.fleetSold), options: { fontFace: FONT, fontSize: 12, color: ACCENT, bold: true, fill: { color: BG_CARD } } },
    ]))
    s.addTable([header, ...body], { x: 4.4, y: 1.2, w: 8.3, colW: [3.5, 1.2, 1.2, 1.2, 1.2], border: { type: 'solid', color: BG, pt: 1 }, rowH: 0.4 })
  }

  // ── 4 · ROM & payback ─────────────────────────────────────────────────────
  {
    const s = pptx.addSlide({ masterName: 'TAL' })
    s.addText('ROM Pricing & Payback', { x: 0.6, y: 0.45, w: 12, h: 0.6, fontFace: FONT, fontSize: 26, color: TEXT, bold: true })
    s.addText(`${usd(rom.pricing.totalMin)} – ${usd(rom.pricing.totalMax)}`, { x: 0.6, y: 1.25, w: 8, h: 0.9, fontFace: FONT, fontSize: 40, color: TEXT, bold: true })
    s.addText('budgetary CAPEX range (always a range, never a point)', { x: 0.62, y: 2.15, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, color: MUTED })
    s.addText(
      rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr`,
      { x: 9.3, y: 1.25, w: 3.4, h: 0.9, fontFace: FONT, fontSize: 40, color: ACCENT, bold: true },
    )
    s.addText('simple payback = system cost ÷ labor offset', { x: 9.3, y: 2.15, w: 3.6, h: 0.5, fontFace: FONT, fontSize: 11, color: MUTED })
    const header = ['Vehicle', 'Qty', 'Unit range', 'Line range'].map(t =>
      ({ text: t, options: { fontFace: FONT, fontSize: 12, color: MUTED, bold: true, fill: { color: BG_CARD } } }))
    const body = rom.pricing.lines.map(l => ([
      { text: vehicleById.get(l.vehicleId)?.name ?? l.vehicleId, options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: String(l.fleetSold), options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: `${usd(l.unitMin)} – ${usd(l.unitMax)}`, options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
      { text: `${usd(l.lineMin)} – ${usd(l.lineMax)}`, options: { fontFace: FONT, fontSize: 12, color: TEXT, fill: { color: BG_CARD } } },
    ]))
    const total = [
      { text: 'TOTAL', options: { fontFace: FONT, fontSize: 12, color: ACCENT, bold: true, fill: { color: BG_CARD } } },
      { text: '', options: { fill: { color: BG_CARD } } },
      { text: '', options: { fill: { color: BG_CARD } } },
      { text: `${usd(rom.pricing.totalMin)} – ${usd(rom.pricing.totalMax)}`, options: { fontFace: FONT, fontSize: 12, color: ACCENT, bold: true, fill: { color: BG_CARD } } },
    ]
    s.addTable([header, ...body, total], { x: 0.6, y: 2.9, w: 12.1, colW: [4.1, 1.2, 3.4, 3.4], border: { type: 'solid', color: BG, pt: 1 }, rowH: 0.42 })
    s.addText(
      `${costs.numberOfOperators} operator(s) displaced × ${usd(costs.fullyBurdenedRateUsdPerYear)}/yr fully burdened = ${usd(rom.payback.annualLaborOffset)}/yr labor offset`,
      { x: 0.6, y: 6.2, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: MUTED },
    )
  }

  const safeName = (project.projectName || 'tal-fleet').replace(/[^\w-]+/g, '-').toLowerCase()
  await pptx.writeFile({ fileName: `${safeName}-proposal.pptx` })
}
