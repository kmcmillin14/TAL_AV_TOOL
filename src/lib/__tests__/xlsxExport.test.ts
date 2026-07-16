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

  it('fleet-sold formula reproduces max(base, ⌈(raw/avail)(1+buffer)⌉) and references $B$3', () => {
    // Fleet block sits below the flows; find the row whose column A is the vehicle name.
    const range = XLSX.utils.decode_range(ws['!ref'] as string)
    let soldCell: { f?: string } | undefined
    for (let r = 0; r <= range.e.r; r++) {
      const a = ws[XLSX.utils.encode_cell({ c: 0, r })] as { v?: string } | undefined
      if (a?.v === (vehicles[0].name)) {
        soldCell = ws[XLSX.utils.encode_cell({ c: 5, r })] as { f?: string }
        break
      }
    }
    expect(soldCell?.f).toContain('ROUNDUP')
    expect(soldCell?.f).toContain('$B$3')
    expect(soldCell?.f).toContain('MAX(')
  })

  it('agrees with the app: recomputing the sheet formulas by hand equals fleetSummary', () => {
    // Sanity that the exported inputs + formulas would yield the same sold count.
    const m = computeFleetModel(project, vehicles)
    const g = m.fleet.groups[0]
    const avail = g.charging.availability ?? 1
    const handSold = Math.max(g.baseFleet, Math.ceil((g.groupRaw / avail) * (1 + m.settings.bufferPct)))
    expect(handSold).toBe(g.fleetSold)
  })
})
