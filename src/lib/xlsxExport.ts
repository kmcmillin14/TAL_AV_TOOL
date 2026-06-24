// Excel workbook export — client-side via SheetJS (no backend, per
// ARCHITECTURE.md). The library is dynamically imported so it never weighs on
// the initial bundle. All figures imperial / USD, matching storage.
import type { StoredProject } from './storage'
import type { Vehicle } from './vehicleLibrary'
import { computeFleetModel } from './fleetModel'
import { projectFilename } from './projectFilename'

type Row = Array<string | number>

export async function downloadProjectXlsx(project: StoredProject, vehicles: Vehicle[]): Promise<void> {
  const XLSX = await import('xlsx')
  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const { flows, derivedByFlowId, settings, fleet, rom, costs } = computeFleetModel(project, vehicles)

  const wb = XLSX.utils.book_new()
  const sheet = (name: string, rows: Row[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)

  // ── Summary ────────────────────────────────────────────────────────────────
  sheet('Summary', [
    ['TAL Fleet Calculator — Project Summary'],
    [],
    ['Project', project.projectName ?? ''],
    ['Customer', project.customerName ?? ''],
    ['Facility', project.facilityLocation ?? ''],
    ['TAL engineer', project.bastianRep ?? ''],
    ['Revision', project.versionNumber ?? ''],
    ['Date', new Date().toISOString().slice(0, 10)],
    [],
    ['Total fleet (sold)', fleet.totalFleetSold],
    ['Raw fleet (base)', fleet.totalBaseFleet],
    ['Charging adder', fleet.totalChargingDelta],
    ['Buffer', `${Math.round(settings.bufferPct * 100)}%`],
    ['CAPEX range (USD)', `${rom.pricing.totalMin.toLocaleString()} – ${rom.pricing.totalMax.toLocaleString()}`],
    ['Payback (years)', rom.payback.paybackYears == null ? '—' : Number(rom.payback.paybackYears.toFixed(2))],
  ])

  // ── Requirements (loads + environment) ────────────────────────────────────
  const loads = project.loads?.length
    ? project.loads
    : [{ id: 'legacy', unitType: project.typicalUnitType ?? '', lengthIn: project.loadLengthIn, widthIn: project.loadWidthIn, heightIn: project.loadHeightIn, weightLbs: project.maxLoadWeightLbs }]
  sheet('Requirements', [
    ['Load', 'Unit type', 'Length (in)', 'Width (in)', 'Height (in)', 'Weight (lbs)'],
    ...loads.map((l, i): Row => [`Load ${i + 1}`, l.unitType ?? '', l.lengthIn ?? '', l.widthIn ?? '', l.heightIn ?? '', l.weightLbs ?? '']),
    [],
    ['Transfer method', project.transferMethod ?? ''],
    ['Delivery pattern', project.deliveryPattern ?? ''],
    ['Pick height (ft)', project.pickHeightFt ?? ''],
    ['Drop height (ft)', project.dropHeightFt ?? ''],
    ['Min aisle width (ft)', project.minAisleWidthFt ?? ''],
    ['Temp range (°F)', `${project.tempMinF ?? '—'} to ${project.tempMaxF ?? '—'}`],
    ['Outdoor required', project.outdoorRequired ? 'Yes' : 'No'],
    ['Freezer capable', project.freezerCapable ? 'Yes' : 'No'],
    ['Schedule', `${project.shiftsPerDay ?? 1} × ${project.hoursPerShift ?? 8} h (${settings.dailyOpHr} h/day)`],
  ])

  // ── Flows ──────────────────────────────────────────────────────────────────
  sheet('Flows', [
    ['#', 'Origin', 'Destination', 'Vehicle', 'Distance one-way (ft)', 'Moves/hr', 'Cycle (s)', 'Raw vehicles'],
    ...flows.map((f, i): Row => {
      const d = derivedByFlowId.get(f.id)
      return [
        i + 1, f.origin || '', f.destination || '',
        f.vehicleId ? (vehicleById.get(f.vehicleId)?.name ?? f.vehicleId) : '',
        f.distanceFt, f.thruPerHr,
        d?.cycleSeconds == null ? '' : Number(d.cycleSeconds.toFixed(1)),
        d?.rawVehicles == null ? '' : Number(d.rawVehicles.toFixed(3)),
      ]
    }),
  ])

  // ── Fleet waterfall ────────────────────────────────────────────────────────
  sheet('Fleet', [
    ['Vehicle', 'Raw demand', 'Base fleet', '+ Charging', `× Buffer (${Math.round(settings.bufferPct * 100)}%)`, 'Fleet sold'],
    ...fleet.groups.map((g): Row => [
      vehicleById.get(g.vehicleId)?.name ?? g.vehicleId,
      Number(g.groupRaw.toFixed(3)), g.baseFleet,
      g.charging.chargingDelta, Number((1 + settings.bufferPct).toFixed(2)), g.fleetSold,
    ]),
    [],
    ['TOTAL', '', fleet.totalBaseFleet, fleet.totalChargingDelta, '', fleet.totalFleetSold],
  ])

  // ── ROM ────────────────────────────────────────────────────────────────────
  sheet('ROM', [
    ['Vehicle', 'Qty', 'Unit min (USD)', 'Unit max (USD)', 'Line min (USD)', 'Line max (USD)'],
    ...rom.pricing.lines.map((l): Row => [
      vehicleById.get(l.vehicleId)?.name ?? l.vehicleId,
      l.fleetSold, l.unitMin, l.unitMax, l.lineMin, l.lineMax,
    ]),
    ['TOTAL', '', '', '', rom.pricing.totalMin, rom.pricing.totalMax],
    [],
    ['Operators displaced', costs.numberOfOperators],
    ['Fully-burdened cost (USD/yr each)', costs.fullyBurdenedRateUsdPerYear],
    ['Annual labor offset (USD/yr)', rom.payback.annualLaborOffset],
    ['Payback (years) = CAPEX mid ÷ labor offset', rom.payback.paybackYears == null ? '—' : Number(rom.payback.paybackYears.toFixed(2))],
    [],
    ['Informational OPEX — energy (USD/yr)', Math.round(rom.opex.annualEnergyCost)],
    ['Informational OPEX — maintenance (USD/yr)', Math.round(rom.opex.annualMaintenance)],
    ['Operating days / year', costs.operatingDaysPerYear],
  ])

  XLSX.writeFile(wb, projectFilename(project, 'xlsx'))
}
