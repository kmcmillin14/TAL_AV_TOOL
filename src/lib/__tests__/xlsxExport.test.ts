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
  operatingDaysPattern: 'Mon–Fri', targetUtilization: 0.9091,
  flows: [
    { id: 'f1', origin: 'A', destination: 'B', distanceFt: 590, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
  ],
} as unknown as StoredProject

describe('buildFleetModelSheet — live-formula fleet model', () => {
  const ws = buildFleetModelSheet(XLSX.utils, project, vehicles)

  it('target utilization lives in $B$3 as a fraction — the one dial the sheet reads', () => {
    expect(ws['B3']).toMatchObject({ t: 'n', v: 0.9091 })
    expect((ws['A3'] as { v?: string })?.v).toBe('Target utilization')
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

  it('the fleet block is the v4 additive waterfall and references $B$3', () => {
    const range = XLSX.utils.decode_range(ws['!ref'] as string)
    let avail: { v?: number } | undefined, duty: { v?: number } | undefined
    let chg: { f?: string } | undefined, head: { f?: string } | undefined, sold: { f?: string } | undefined
    for (let r = 0; r <= range.e.r; r++) {
      const a = ws[XLSX.utils.encode_cell({ c: 0, r })] as { v?: string } | undefined
      if (a?.v === vehicles[0].name) {
        // v4 layout: 3 Availability · 4 Duty ratio · 5 +Charging · 6 +Headroom · 7 Fleet sold
        avail = ws[XLSX.utils.encode_cell({ c: 3, r })] as { v?: number }
        duty  = ws[XLSX.utils.encode_cell({ c: 4, r })] as { v?: number }
        chg   = ws[XLSX.utils.encode_cell({ c: 5, r })] as { f?: string }
        head  = ws[XLSX.utils.encode_cell({ c: 6, r })] as { f?: string }
        sold  = ws[XLSX.utils.encode_cell({ c: 7, r })] as { f?: string }
        break
      }
    }
    expect(avail?.v).toBeGreaterThan(0)
    expect(duty?.v).toBeGreaterThan(0)
    expect(duty!.v!).toBeLessThanOrEqual(avail!.v!)   // duty is the floor availability sits above
    // Charging is costed first and does not reference the utilization dial.
    expect(chg?.f).toContain('ROUNDUP')
    expect(chg?.f).not.toContain('$B$3')
    // Headroom is the only stage that moves with the dial.
    expect(head?.f).toContain('$B$3')
    // Sold is literally the three stages added, so the sheet shows the same story.
    expect(sold?.f).toMatch(/^C\d+\+F\d+\+G\d+$/)
    // v3's two-constraint MAX(energy, rotation) form must not come back.
    expect(sold?.f).not.toMatch(/MAX\(.*\/D.*,.*\/E.*\)/)
  })

  it('agrees with the app: recomputing the sheet formulas by hand equals fleetSummary', () => {
    const m = computeFleetModel(project, vehicles)
    const g = m.fleet.groups[0]
    const A = g.charging.availability ?? 1
    const withCharging = Math.max(g.baseFleet, Math.ceil(g.groupRaw / A))
    const handSold = Math.max(withCharging, Math.ceil(g.groupRaw / (A * m.settings.targetUtilization)))
    expect(handSold).toBe(g.fleetSold)
    expect(g.baseFleet + g.chargingDelta + g.utilizationDelta).toBe(g.fleetSold)
  })
})
