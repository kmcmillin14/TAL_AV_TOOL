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
  it('is judged once a run covers two days; a week on the sample keeps up; too few chargers do not', () => {
    const { layout, flows } = sampleLayout()
    const shift = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 8 }))!, 8 * 3600)
    expect(results(shift).types[0].checks.battery).toBeNull()
    const week = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 8 }))!, 7 * 86400)
    const t = results(week).types[0]
    expect(t.checks.battery).toBe(true)
    expect(t.battery.dayStarts.length).toBe(8)
    // Staffed round the clock at double demand: no off-shift to charge in — the charge does not keep up.
    const hard = runFor(createSim(layout, flows, LIBRARY, settings({ fleet: { cb18: 3 }, staffedHr: 24, demandPct: 200 }))!, 4 * 86400)
    const h = results(hard).types[0]
    expect(h.checks.battery === false || h.checks.orders === false).toBe(true)
    if (h.checks.battery === false) expect(h.battery.why).toBeTruthy()
  }, 120000)
})
