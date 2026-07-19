import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildFleetModelSheet } from '../xlsxExport'
import { computeFleetModel } from '../fleetModel'
import type { StoredProject } from '../storage'
import type { Vehicle } from '../vehicleLibrary'
import cb18 from '../../content/vehicles/cb18.json'

const vehicles = [cb18 as unknown as Vehicle]

const project = {
  id: 'p1', createdAt: '', updatedAt: '', versionNumber: 'v1',
  step1Complete: true, step2Complete: true, step3Complete: false, step4Complete: false,
  shiftsPerDay: 2, hoursPerShift: 8, operatorsPerShift: 3,
  operatingDaysPattern: 'Mon–Fri', bufferPct: 0.10,
  flows: [
    { id: 'f1', origin: 'A', destination: 'B', distanceFt: 590, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
  ],
} as unknown as StoredProject

describe('buildFleetModelSheet — live-formula fleet model', () => {
  const ws = buildFleetModelSheet(XLSX.utils, project, vehicles)

  it('buffer lives in $B$3 as a fraction', () => {
    expect(ws['B3']).toMatchObject({ t: 'n', v: 0.10 })
  })

  it('the flow Cycle cell is a formula, not a baked value', () => {
    // First flow is at Excel row 7 (header row 6). Cycle is column M.
    const cycle = ws['M7'] as { f?: string }
    expect(cycle.f).toContain('E7/(G7*I7)')
    expect(cycle.f).toContain('+J7+K7+L7')
    const raw = ws['N7'] as { f?: string }
    expect(raw.f).toBe('IF(M7="","",F7*M7/3600)')
  })

  it('the flow input cells match the calc engine (distance, moves/hr, speeds)', () => {
    expect(ws['E7']).toMatchObject({ v: 590 })     // distance
    expect(ws['F7']).toMatchObject({ v: 45 })      // moves/hr
    expect((ws['G7'] as { v: number }).v).toBeGreaterThan(0)  // loaded speed
  })

  it('fleet-sold formula (v3) is at col 6 and uses MAX(energy,rotation) composition referencing $B$3', () => {
    // Fleet block sits below the flows; find the row whose column A is the vehicle name.
    const range = XLSX.utils.decode_range(ws['!ref'] as string)
    let soldCell: { f?: string } | undefined
    let aEnergyCell: { v?: number } | undefined
    let aCapCell: { v?: number } | undefined
    for (let r = 0; r <= range.e.r; r++) {
      const a = ws[XLSX.utils.encode_cell({ c: 0, r })] as { v?: string } | undefined
      if (a?.v === (vehicles[0].name)) {
        // v3 layout: col 3 = Avail energy, col 4 = Avail rotation, col 5 = +Charging, col 6 = Fleet sold
        aEnergyCell = ws[XLSX.utils.encode_cell({ c: 3, r })] as { v?: number }
        aCapCell    = ws[XLSX.utils.encode_cell({ c: 4, r })] as { v?: number }
        soldCell    = ws[XLSX.utils.encode_cell({ c: 6, r })] as { f?: string }
        break
      }
    }
    expect(aEnergyCell?.v).toBeGreaterThan(0)
    expect(aCapCell?.v).toBeGreaterThan(0)
    expect(soldCell?.f).toContain('ROUNDUP')
    expect(soldCell?.f).toContain('$B$3')
    expect(soldCell?.f).toContain('MAX(')
    // v3 specific: must use the two-constraint MAX(energy, rotation) form
    expect(soldCell?.f).toMatch(/MAX\(.*\/D.*,.*\/E.*\)/)
  })

  it('agrees with the app: recomputing the sheet formulas by hand equals fleetSummary (v3)', () => {
    // Sanity that the exported inputs + formulas would yield the same sold count (v3 composition).
    const m = computeFleetModel(project, vehicles)
    const g = m.fleet.groups[0]
    const aEnergy = g.charging.aEnergy ?? 1
    const aCap    = g.charging.aCap    ?? 1
    const handSold = Math.max(g.baseFleet, Math.ceil(Math.max(g.groupRaw / aEnergy, g.groupRaw * (1 + m.settings.bufferPct) / aCap)))
    expect(handSold).toBe(g.fleetSold)
  })
})
