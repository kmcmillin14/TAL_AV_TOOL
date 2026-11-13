import { describe, expect, it } from 'vitest'
import { createSim, DT, runFor, step } from '../engine'
import { results } from '../results'
import { inShift, staffedSeconds } from '../shift'
import { LIBRARY, sampleLayout, settings } from './fixtures'

describe('the staffed day and charging (owner, 2026-11-13)', () => {
  it('shifts run from midnight; staffed seconds count only them', () => {
    const P = { staffedHr: 16 }
    expect(inShift(P, 3600)).toBe(true)
    expect(inShift(P, 17 * 3600)).toBe(false)
    expect(inShift(P, 86400 + 60)).toBe(true)
    expect(staffedSeconds(P, 86400 + 3600)).toBe(17 * 3600)
    expect(staffedSeconds({ staffedHr: 24 }, 5000)).toBe(5000)
    // five working days: day 6 is off
    expect(inShift({ staffedHr: 8, daysPerWeek: 5 }, 5 * 86400 + 3600)).toBe(false)
    expect(staffedSeconds({ staffedHr: 8, daysPerWeek: 5 }, 7 * 86400)).toBe(5 * 8 * 3600)
  })

  it('no orders off-shift; rates are per staffed hour', () => {
    const { layout, flows } = sampleLayout()
    const S = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 8 }))!, 24 * 3600)
    const gen = S.flows.reduce((a, F) => a + F.gen, 0)
    const perHr = flows.reduce((a, f) => a + f.thruPerHr, 0)
    expect(gen).toBeLessThan(perHr * 8 * 1.05)                 // one 8 h shift of orders, not 24 h
    expect(results(S).types[0].perHr).toBeGreaterThan(perHr * 0.9)
  })

  it('vehicles without a mission are on chargers; one below the threshold stays until it is above', () => {
    const { layout, flows } = sampleLayout()
    // 6 vehicles, 4 chargers: after a shift's work, the idle ones end on chargers
    const S = createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 6 }, staffedHr: 8, demandPct: 200 }))!
    let left = false
    for (let t = 0; t < 22 * 3600; t += DT) {          // the shift and most of the off-shift
      step(S)
      for (const v of S.veh) if (v.prof.battery && v.mustCharge && v.mode !== 'charging' && v.mode !== 'toCharge' && v.mode !== 'home') left = true
    }
    expect(left).toBe(false)                                        // a vehicle that must charge never takes work
    const onCharger = S.veh.filter(v => S.G.points[v.node].type === 'charger' && v.atNode).length
    expect(onCharger).toBe(Math.min(4, S.veh.length))
    expect((S.socSeries.get('cb18') ?? []).length).toBeGreaterThan(100)
  })
})

describe('charge keeps up — the third sizing check', () => {
  it('is judged once a run covers two days; charge may fall through the week if it stays above the charge level and recovers', () => {
    const { layout, flows } = sampleLayout()
    const shift = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 8 }))!, 8 * 3600)
    expect(results(shift).types[0].checks.battery).toBeNull()
    const week = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 8 }))!, 7 * 86400)
    const t = results(week).types[0]
    expect(t.checks.battery).toBe(true)
    expect(t.battery.dayStarts.length).toBe(8)
    // Round the clock: charge cycles in its band, never below the charge level — it keeps up.
    const allDay = results(runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 4 }, staffedHr: 24, daysPerWeek: 7 }))!, 7 * 86400)).types[0]
    expect(allDay.battery.dayStarts.length).toBe(8)
    expect(allDay.battery.lowest.run!).toBeGreaterThan(29)
    expect(allDay.checks.battery).toBe(true)
    // Charge falling through a 5-day week, recovered over the weekend, passes.
    const wk = results(runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 16, daysPerWeek: 5 }))!, 7 * 86400)).types[0]
    expect(wk.battery.dayStarts[7]).toBeGreaterThanOrEqual(wk.battery.dayStarts[0] - 2)
    expect(wk.checks.battery).toBe(true)
  }, 120000)
})
