import { describe, expect, it } from 'vitest'
import { chargingAvailability } from '../../fleet'
import { cycleBreakdown } from '../../flowMetrics'
import { createSim, layoutReady, runFor, step, type SimState } from '../engine'
import { angleDiff, distanceToGeometry } from '../geometry'
import { results } from '../results'
import type { SimFlow, SimLayout, VehicleSimData } from '../types'
import { CB18_SIM, LIBRARY, cb18, corridor, sampleLayout, settings } from './fixtures'

const flowAB = (thru: number): SimFlow[] => [{ id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: thru, vehicleId: 'cb18' }]
const sim = (layout: SimLayout, flows: SimFlow[], over = {}, simData: Record<string, VehicleSimData> = { cb18: CB18_SIM }) =>
  createSim(layout, flows, LIBRARY, settings(over), simData)!

describe('acceptance 1 — no layout, no simulation', () => {
  it('returns null and reports the layout as not ready', () => {
    const empty: SimLayout = { points: [{ id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }], segments: [] }
    expect(layoutReady(empty)).toBe(false)
    expect(createSim(empty, [], LIBRARY, settings())).toBeNull()
  })
})

describe('acceptance 4 — reproducible', () => {
  it('same project and seed give identical results, whatever the run chunking', () => {
    const { layout, flows } = sampleLayout()
    const over = { fleet: { cb18: 4 }, arrivals: 'random' as const, seed: 3 }
    const a = runFor(sim(layout, flows, over), 2 * 3600)
    const b = sim(layout, flows, over)
    for (let t = 0; t < 2 * 3600; t += 7.5) runFor(b, 7.5)   // like a different playback speed
    expect(JSON.stringify(results(b))).toBe(JSON.stringify(results(a)))
  })
})

describe('acceptance 5 — orders are conserved every step', () => {
  it('generated = delivered + in progress + waiting', () => {
    const { layout, flows } = sampleLayout()
    const S = sim(layout, flows, { fleet: { cb18: 3 }, arrivals: 'random', demandPct: 130 })
    for (let i = 0; i < 4 * 3600 / 0.25; i++) {
      step(S)
      const gen = S.flows.reduce((a, F) => a + F.gen, 0), done = S.flows.reduce((a, F) => a + F.done, 0)
      if (gen !== done + S.orders.length) throw new Error(`step ${i}: ${gen} ≠ ${done} + ${S.orders.length}`)
    }
    const r = results(S).orders
    expect(r.generated).toBe(r.delivered + r.inProgress + r.waiting)
  })
})

describe('acceptance 6 — pick/drop seconds come from JSON and points', () => {
  it('pick = load; drop = unload + lift to the drop height + handshake', () => {
    const L = corridor(200, { dropH: 12 })
    L.points.find(p => p.id === 'B')!.handshakeSec = 4
    const S = sim(L, flowAB(6))
    const F = S.flows[0], lift = cb18.transferMethods[0]
    expect(F.pickSec).toBeCloseTo(lift.loadTimeSec, 9)
    expect(F.dropSec).toBeCloseTo(lift.unloadTimeSec + 12 / cb18.calc.liftSpeedFps! + 4, 9)
    runFor(S, 3600)
    const r = results(S).types[0]
    expect(r.time.handle / r.done).toBeCloseTo(F.pickSec + F.dropSec, 0)
  })
})

describe('acceptance 7 — one vehicle, one flow matches the engine cycle', () => {
  it('vehicle time per move ≈ cycleBreakdown total (±2%) when pace = the route factor', () => {
    const S = sim(corridor(400, { dropH: 12 }), flowAB(60), { pacePct: 50 })
    runFor(S, 2 * 3600)
    const r = results(S).types[0]
    const engine = cycleBreakdown(400, cb18, 'medium', 12)!.totalSec
    expect(Math.abs(r.vehicleSecPerMove! / engine - 1)).toBeLessThan(0.02)
  })
})

describe('acceptance 8 — charging share matches the engine duty ratio', () => {
  // 24/7 schedule, measured over three days so whole charge cycles dominate (one day holds only ~3,
  // which skews a single-day share by several points). The simulation also draws idle power
  // while charging (JSON idlePowerDrawW), which the engine's duty ratio leaves out: ~+1.3 pts.
  it('24/7 busy: charging share ≈ 1 − dutyRatio (±3 pts)', () => {
    const S = sim(corridor(400), flowAB(60), { staffedHr: 24 })
    runFor(S, 3 * 24 * 3600)
    const t = results(S).types[0].time
    const share = t.charge / Object.values(t).reduce((a, b) => a + b, 0)
    const c = cb18.calc
    const d = chargingAvailability({ voltageV: c.voltageV!, ratedAh: c.ratedAh!, usableCapacityPct: c.usableCapacityPct!, avgPowerDrawKw: c.avgPowerDrawKw!, chargerPowerKw: c.chargerPowerKw! }, 24)!.dutyRatio
    expect(Math.abs(share - (1 - d))).toBeLessThan(0.03)
  }, 120_000)
})

describe('acceptance 9 — gridlock is reported, never driven through', () => {
  const headOn = (lane: 'single' | 'two'): SimLayout => ({
    points: [
      { id: 'L', x: 0, y: 0, type: 'stand', role: 'pickDrop', name: 'Left' },
      { id: 'R', x: 200, y: 0, type: 'stand', role: 'pickDrop', name: 'Right' },
      { id: 'JL', x: -20, y: 0, type: 'junction' }, { id: 'JR', x: 220, y: 0, type: 'junction' },
      { id: 'CL', x: -20, y: 20, type: 'charger' }, { id: 'CR', x: 220, y: 20, type: 'charger' },
    ],
    segments: [
      { id: 'LR', a: 'L', b: 'R', dir: 'two', lane },
      { id: 'a', a: 'JL', b: 'L', dir: 'two' }, { id: 'b', a: 'JL', b: 'CL', dir: 'two' },
      { id: 'c', a: 'R', b: 'JR', dir: 'two' }, { id: 'd', a: 'JR', b: 'CR', dir: 'two' },
    ],
  })
  const flows: SimFlow[] = [
    { id: 'lr', fromPointId: 'L', toPointId: 'R', thruPerHr: 120, vehicleId: 'cb18' },
    { id: 'rl', fromPointId: 'R', toPointId: 'L', thruPerHr: 120, vehicleId: 'cb18' },
  ]
  it('a single-lane head-on conflict ends in Gridlock', () => {
    const S = runFor(sim(headOn('single'), flows, { fleet: { cb18: 2 } }), 3600)
    expect(S.gridlock).not.toBeNull()
    expect(results(S).verdict).toBe('gridlock')
  })
  it('the same conflict on a two-lane segment passes', () => {
    const S = runFor(sim(headOn('two'), flows, { fleet: { cb18: 2 } }), 3600)
    expect(S.gridlock).toBeNull()
  })
  // D-11 (exiting vehicle first) + D-12 (junction permission, two-lane passing only). The POC froze,
  // unreported, in 4 of these 48 runs. Three runs remain at the highest density (6 vehicles, 130%):
  // the O-12 pattern — vehicles in both directions queued in a short segment between two junctions. They are real deadlocks
  // for a centreline model without segment reservation and are reported. Pinned so any new one fails.
  it('proof-of-concept sample: fleets 3–6, seeds 1–6, demand 100/130%, random, 16 h → only the known O-12 gridlocks', () => {
    const { layout, flows: f } = sampleLayout()
    const hits: string[] = []
    for (const n of [3, 4, 5, 6]) for (const seed of [1, 2, 3, 4, 5, 6]) for (const demandPct of [100, 130]) {
      const S = runFor(sim(layout, f, { fleet: { cb18: n }, seed, demandPct, arrivals: 'random' }), 16 * 3600)
      if (S.gridlock) hits.push(`fleet ${n} seed ${seed} ${demandPct}%: ${S.gridlock.kind} ${S.gridlock.where}`)
      // the run the POC froze in (O-11) now delivers
      if (n === 5 && seed === 2 && demandPct === 100) expect(results(S).types[0].delivered).toBeGreaterThan(0.98)
    }
    expect(hits).toEqual([
      'fleet 6 seed 3 130%: cycle near Wrapper Outfeed',
      'fleet 6 seed 5 130%: cycle near Charger 4',
      'fleet 6 seed 6 130%: cycle near Warehouse Infeed',
    ])
  }, 600_000)


  it('a fleet that stops moving while orders wait is reported as Gridlock (stall), never hidden', () => {
    const S = sim(corridor(200), flowAB(60))
    runFor(S, 120)                                       // a job is under way
    expect(S.veh.some(v => v.job)).toBe(true)
    const p = S.profiles.get('cb18')!
    p.speedLoaded = 0; p.speedEmpty = 0                  // nothing can move any more
    runFor(S, 600)
    expect(S.gridlock?.kind).toBe('stall')
  })
})

describe('acceptance 23 — the reference point stays on the path', () => {
  it('within 0.1 ft on straights, arcs and splines', () => {
    const L: SimLayout = {
      points: [
        { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'M', x: 60, y: 0, type: 'junction' },
        { id: 'N', x: 100, y: 40, type: 'junction' }, { id: 'B', x: 100, y: 120, type: 'stand', role: 'drop' },
        { id: 'C', x: -20, y: 0, type: 'charger' },
      ],
      segments: [
        { id: 's1', a: 'A', b: 'M', dir: 'two' },
        { id: 's2', a: 'M', b: 'N', dir: 'two', curve: { kind: 'arc', mid: { x: 60 + 40 * Math.sin(Math.PI / 4), y: 40 - 40 * Math.cos(Math.PI / 4) } } },
        { id: 's3', a: 'N', b: 'B', dir: 'two', curve: { kind: 'bezier', c1: { x: 120, y: 60 }, c2: { x: 80, y: 100 } } },
        { id: 's4', a: 'C', b: 'A', dir: 'two' },
      ],
    }
    const S = sim(L, flowAB(20))
    let worst = 0
    for (let i = 0; i < 1800 / 0.25; i++) {
      step(S)
      for (const v of S.veh) {
        const d = Math.min(...S.G.geo.map(g => distanceToGeometry(g, v)))
        if (d > worst) worst = d
      }
    }
    expect(worst).toBeLessThan(0.1)
  })
})

describe('acceptance 25–27 — heading, orientation and fallbacks', () => {
  const handled = (S: SimState) => S.veh.flatMap(v => v.handlingLog)

  it('25 — heading matches the required approach at every pick/drop; a mismatch adds reverse + reorient time', () => {
    const data = { cb18: { ...CB18_SIM, approachDistanceFt: 6, reverseSpeedFps: 2, reorientSec: 4 } }
    const S = runFor(sim(corridor(200), flowAB(10), {}, data), 3600)
    const log = handled(S)
    expect(log.length).toBeGreaterThan(10)
    // Lift → forks-first (rear); arriving forks-trailing never matches → 6/2 + 4 = 7 s each time
    for (const h of log) {
      expect(angleDiff(h.arrivalH, h.required)).toBeGreaterThan((5 * Math.PI) / 180)
      expect(h.repoSec).toBeCloseTo(7, 9)
    }
    // after repositioning the vehicle handles at the required heading
    for (const v of S.veh) if (v.mode === 'pick' || v.mode === 'drop') expect(angleDiff(v.h, v.handlingLog.at(-1)!.required)).toBeLessThan(1e-9)
    expect(results(S).types[0].time.reposition).toBeCloseTo(7 * log.length, -1)
  })

  it('25 — arriving already at the required heading costs no reposition time', () => {
    const data = { cb18: { ...CB18_SIM, preferredTravel: { loaded: 'forksLeading' as const, empty: 'forksLeading' as const }, approachDistanceFt: 6, reverseSpeedFps: 2, reorientSec: 4 } }
    const S = runFor(sim(corridor(200), flowAB(10), {}, data), 3600)
    const log = handled(S)
    expect(log.length).toBeGreaterThan(10)
    for (const h of log) { expect(angleDiff(h.arrivalH, h.required)).toBeLessThanOrEqual((5 * Math.PI) / 180); expect(h.repoSec).toBe(0) }
  })

  it('26 — bi vehicles never reverse in', () => {
    const data = { cb18: { ...CB18_SIM, travelDirection: 'bi' as const, approachDistanceFt: 6, reverseSpeedFps: 2, reorientSec: 4 } }
    const S = runFor(sim(corridor(200), flowAB(10), {}, data), 3600)
    expect(handled(S).every(h => h.repoSec === 0)).toBe(true)
  })

  it('26 — single vehicles travel with the preferred end leading', () => {
    const data = { cb18: { ...CB18_SIM, preferredTravel: { loaded: 'forksLeading' as const, empty: 'forksTrailing' as const } } }
    const S = sim(corridor(200), flowAB(10), {}, data)
    let checked = 0
    for (let i = 0; i < 3600 / 0.25; i++) {
      step(S)
      for (const v of S.veh) {
        if (!(v.moved > 0) || v.pi >= v.nodes.length) continue
        const expected = v.loaded ? v.th + Math.PI : v.th
        expect(angleDiff(v.h, expected)).toBeLessThan(1e-6); checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('27 — missing kinematics run on the stated fallback and are flagged', () => {
    const S = sim(corridor(200), flowAB(10), { pacePct: 70 }, {})
    const fields = S.flags.filter(f => f.vehicleId === 'cb18').map(f => f.field)
    expect(fields).toEqual(expect.arrayContaining(['motion', 'transferOrientation', 'overallLengthFt', 'turnSpeedFps', 'reverseSpeedFps', 'travelDirection', 'preferredTravel', 'reorientSec', 'approachDistanceFt', 'pathRefPointFt']))
    expect(S.profiles.get('cb18')!.speedLoaded).toBeCloseTo(cb18.calc.speedLoadedFps * 0.7, 9)
    expect(S.profiles.get('cb18')!.lengthFt).toBe(cb18.calc.lengthFt)
  })
})

describe('flows that cannot run are excluded with a reason', () => {
  it('refuses Drop → Pick and unknown vehicles', () => {
    const S = sim(corridor(100), [
      { id: 'bad', fromPointId: 'B', toPointId: 'A', thruPerHr: 5, vehicleId: 'cb18' },
      { id: 'nov', fromPointId: 'A', toPointId: 'B', thruPerHr: 5, vehicleId: 'nope' },
    ])
    expect(S.excluded).toEqual([
      { flowId: 'bad', why: 'From point is not a Pick point' },
      { flowId: 'nov', why: 'Vehicle not in the library' },
    ])
  })
})

describe('review fixes — inputs the engine must refuse or flag, never guess', () => {
  it('excludes flows when demand is 0% or the transfer method is not on the vehicle', () => {
    expect(sim(corridor(100), flowAB(10), { demandPct: 0 }).excluded).toEqual([{ flowId: 'f', why: 'Demand is 0%' }])
    const bad = [{ ...flowAB(10)[0], transferMethodIdx: 9 }]
    expect(sim(corridor(100), bad).excluded).toEqual([{ flowId: 'f', why: 'Transfer method not on this vehicle' }])
  })
  it('flags a fleet entry for a vehicle that is not in the library and places whole vehicles only', () => {
    const S = sim(corridor(100), flowAB(10), { fleet: { cb18: 1.9, ghost: 2 } })
    expect(S.veh).toHaveLength(1)
    expect(S.flags.some(f => f.vehicleId === 'ghost' && f.field === 'fleet')).toBe(true)
  })
  it('treats a 0% minimum SOC as data, not as missing', () => {
    const v = { ...cb18, calc: { ...cb18.calc, minSocPct: 0 } }
    const S = createSim(corridor(100), flowAB(10), [v], settings(), { cb18: CB18_SIM })!
    expect(S.profiles.get('cb18')!.battery?.chargeBelowPct).toBe(10)
  })
  it('a trip to a charger counts as charging, not as busy', () => {
    const S = runFor(sim(corridor(400), flowAB(60), { staffedHr: 24 }), 24 * 3600)
    const r = results(S).types[0]
    expect(r.chargeTrips).toBeGreaterThan(0)
    // busy ÷ (busy + idle): with the vehicle never idle, utilization stays at 1, charge trips excluded
    expect(r.utilization).toBeGreaterThan(0.99)
  }, 60_000)
})

describe('D-12 — intersection permission', () => {
  // + crossing: W→E and S→N flows cross at X (0,0); each arm 60 ft; chargers off the far ends
  const cross = (): SimLayout => ({
    points: [
      { id: 'X', x: 0, y: 0, type: 'junction' },
      { id: 'W', x: -60, y: 0, type: 'stand', role: 'pick' }, { id: 'E', x: 60, y: 0, type: 'stand', role: 'drop' },
      { id: 'S', x: 0, y: 60, type: 'stand', role: 'pick' }, { id: 'N', x: 0, y: -60, type: 'stand', role: 'drop' },
      { id: 'JW', x: -80, y: 0, type: 'junction' }, { id: 'CW', x: -80, y: 20, type: 'charger' },
      { id: 'JS', x: 0, y: 80, type: 'junction' }, { id: 'CS', x: 20, y: 80, type: 'charger' },
    ],
    segments: [
      { id: 'a', a: 'W', b: 'X', dir: 'two' }, { id: 'b', a: 'X', b: 'E', dir: 'two' },
      { id: 'c', a: 'S', b: 'X', dir: 'two' }, { id: 'd', a: 'X', b: 'N', dir: 'two' },
      { id: 'e', a: 'JW', b: 'W', dir: 'two' }, { id: 'f', a: 'JW', b: 'CW', dir: 'two' },
      { id: 'g', a: 'JS', b: 'S', dir: 'two' }, { id: 'h', a: 'JS', b: 'CS', dir: 'two' },
    ],
  })
  const crossFlows: SimFlow[] = [
    { id: 'we', fromPointId: 'W', toPointId: 'E', thruPerHr: 60, vehicleId: 'cb18' },
    { id: 'sn', fromPointId: 'S', toPointId: 'N', thruPerHr: 60, vehicleId: 'cb18' },
  ]

  it('a junction never has two vehicles over it, and crossing traffic waits rather than passing through', () => {
    const S = sim(cross(), crossFlows, { fleet: { cb18: 2 } })
    const X = S.G.points.find(p => p.id === 'X')!
    let crossings = 0
    for (let i = 0; i < 3600 / 0.25; i++) {
      step(S)
      const over = S.veh.filter(v => Math.hypot(v.x - X.x, v.y - X.y) < v.prof.lengthFt / 2)
      expect(over.length).toBeLessThanOrEqual(1)
      if (over.length) crossings++
    }
    expect(crossings).toBeGreaterThan(0)
    expect(S.gridlock).toBeNull()
    expect(results(S).types[0].done).toBeGreaterThan(50)
  })

  it('junctions closer than a vehicle length are held together until the vehicle is through', () => {
    // A — J1 — J2 — B along x, with side stubs making J1 and J2 junctions 6 ft apart
    const L: SimLayout = {
      points: [
        { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'B', x: 120, y: 0, type: 'stand', role: 'drop' },
        { id: 'J1', x: 60, y: 0, type: 'junction' }, { id: 'J2', x: 66, y: 0, type: 'junction' },
        { id: 'P1', x: 60, y: 30, type: 'parking' }, { id: 'P2', x: 66, y: -30, type: 'parking' },
        { id: 'C', x: -20, y: 0, type: 'charger' },
      ],
      segments: [
        { id: 's1', a: 'A', b: 'J1', dir: 'two' }, { id: 's2', a: 'J1', b: 'J2', dir: 'two' }, { id: 's3', a: 'J2', b: 'B', dir: 'two' },
        { id: 's4', a: 'J1', b: 'P1', dir: 'two' }, { id: 's5', a: 'J2', b: 'P2', dir: 'two' }, { id: 's6', a: 'C', b: 'A', dir: 'two' },
      ],
    }
    const S = sim(L, flowAB(20))
    const j1 = S.G.idx.get('J1')!, j2 = S.G.idx.get('J2')!
    let together = 0
    for (let i = 0; i < 1800 / 0.25; i++) {
      step(S)
      for (const v of S.veh) {
        const aheadJ2 = v.nodes.indexOf(j2, v.pi) >= 0
        if (v.heldJ.has(j1) && aheadJ2 && v.loaded) { expect(v.heldJ.has(j2)).toBe(true); together++ }
      }
    }
    expect(together).toBeGreaterThan(0)
  })

  it('a vehicle parked close to a junction is still dispatched', () => {
    // the charger stub (3 ft) is shorter than half a vehicle + clearance: parked, the body is over J
    const L = corridor(200)
    L.points.find(p => p.id === 'C1')!.y = 3
    L.points.find(p => p.id === 'C2')!.y = -3
    const S = runFor(sim(L, flowAB(20)), 1800)
    expect(results(S).types[0].done).toBeGreaterThan(5)
  })

  it('a stub zone is held until the leaving vehicle has cleared the gate', () => {
    const L = corridor(200)
    const S = sim(L, flowAB(30), { fleet: { cb18: 1 } })
    const J = S.G.points.find(p => p.id === 'J')!, z = 'C1'
    let checked = 0
    for (let i = 0; i < 3600 / 0.25; i++) {
      step(S)
      const v = S.veh[0]
      const gateDist = Math.hypot(v.x - J.x, v.y - J.y)
      const inStub = v.x === J.x && v.y > J.y   // on the stub J → C1
      if ((inStub || gateDist < v.prof.lengthFt / 2 + 2) && S.locks.get(z) === v.i) checked++
      if (inStub && v.mode !== 'home' && v.mode !== 'charging') expect(v.held.has(z)).toBe(true)
    }
    expect(checked).toBeGreaterThan(0)
  })
})
