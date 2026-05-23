import { describe, it, expect } from 'vitest'
import { cycleSeconds } from '../flowMetrics'
import { TURN_TIME_SEC } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const cb18: Pick<Vehicle, 'calc' | 'transferMethods'> = {
  calc: {
    speedLoadedFps: 9.84,
    speedUnloadedFps: 11.5,
    liftSpeedFps: 0.65,
  } as Vehicle['calc'],
  transferMethods: [
    { method: 'Fork', loadTimeSec: 5, unloadTimeSec: 5 },
    { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8, lifts: true },
  ],
}

const noLiftSpeed: Pick<Vehicle, 'calc' | 'transferMethods'> = {
  calc: { speedLoadedFps: 9.84, speedUnloadedFps: 11.5 } as Vehicle['calc'],
  transferMethods: [
    { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8, lifts: true },
  ],
}

describe('cycleSeconds', () => {
  it('sums travel-loaded + travel-empty + load + unload + turns × TURN_TIME_SEC', () => {
    // distance 100 ft, Fork transfer (no lift), 2 turns, liftHeight 0:
    //   loaded   100 / 9.84 ≈ 10.16 s
    //   empty    100 / 11.5 ≈  8.70 s
    //   load + unload          = 10 s
    //   turns 2 × 4            =  8 s
    //   total                 ≈ 36.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 2, 0, 0)).toBeCloseTo(36.86, 1)
  })

  it('handles zero turns', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 0, 0)).toBeCloseTo(28.86, 1)
  })

  it('uses transferMethodIdx to pick load/unload times', () => {
    // distance 100 ft, Lift Platform (idx 1) with liftHeightFt = 0,
    // so no lift time is added even though lifts: true:
    //   10.16 + 8.70 + 8 + 8 = 34.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 0, 1)).toBeCloseTo(34.86, 1)
  })

  it('defaults transferMethodIdx to 0 when omitted', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 0)).toBeCloseTo(28.86, 1)
  })

  it('returns load+unload only when distance is 0 and no lift', () => {
    expect(cycleSeconds(0, cb18 as Vehicle, 0, 0, 0)).toBeCloseTo(10, 5)
  })

  it('adds liftHeightFt / liftSpeedFps for lifts:true transfer methods', () => {
    // distance 0, Lift Platform (idx 1), turns 0, liftHeightFt = 10 ft,
    // liftSpeedFps = 0.65 → liftTime = 10 / 0.65 = 15.38 s
    //   load + unload = 16, + lift 15.38 = 31.38 s
    expect(cycleSeconds(0, cb18 as Vehicle, 0, 10, 1)).toBeCloseTo(31.38, 1)
  })

  it('uses the spec example: liftHeight 10 ft at 0.5 fps → +20 s', () => {
    const v: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      calc: { speedLoadedFps: 5, speedUnloadedFps: 5, liftSpeedFps: 0.5 } as Vehicle['calc'],
      transferMethods: [{ method: 'Lift', loadTimeSec: 0, unloadTimeSec: 0, lifts: true }],
    }
    // distance 0, no turns, liftHeight 10, liftSpeed 0.5 → 20 s exactly
    expect(cycleSeconds(0, v as Vehicle, 0, 10, 0)).toBeCloseTo(20, 5)
  })

  it('ignores liftHeightFt when the transfer method does not have lifts: true', () => {
    // Fork (idx 0) has no lifts flag. liftHeightFt provided but should add 0.
    //   100 ft → 10.16 + 8.70 + 5 + 5 = 28.86 s; lift adds nothing.
    expect(cycleSeconds(100, cb18 as Vehicle, 0, 50, 0)).toBeCloseTo(28.86, 1)
  })

  it('adds 0 lift time when liftSpeedFps is missing on the vehicle', () => {
    // Transfer claims lifts: true but vehicle has no liftSpeedFps → graceful 0.
    //   100 ft loaded at 9.84 = 10.16 s + 100/11.5 = 8.70 + 16 (load+unload) = 34.86 s
    expect(cycleSeconds(100, noLiftSpeed as Vehicle, 0, 10, 0)).toBeCloseTo(34.86, 1)
  })

  it('returns null when distance is negative', () => {
    expect(cycleSeconds(-1, cb18 as Vehicle, 0, 0, 0)).toBeNull()
  })

  it('returns null when turns is negative', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, -1, 0, 0)).toBeNull()
  })

  it('returns null when liftHeightFt is negative', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 0, -1, 0)).toBeNull()
  })

  it('returns null when vehicle has no transferMethods', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, transferMethods: [] }
    expect(cycleSeconds(100, broken, 0, 0, 0)).toBeNull()
  })

  it('returns null when transferMethodIdx is out of range', () => {
    expect(cycleSeconds(100, cb18, 0, 0, 99)).toBeNull()
  })

  it('returns null when speedLoadedFps is 0', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, calc: { ...cb18.calc, speedLoadedFps: 0 } }
    expect(cycleSeconds(100, broken, 0, 0, 0)).toBeNull()
  })

  it('returns null when speedUnloadedFps is 0', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, calc: { ...cb18.calc, speedUnloadedFps: 0 } }
    expect(cycleSeconds(100, broken, 0, 0, 0)).toBeNull()
  })

  it('pins TURN_TIME_SEC at 4 (changes here are a spec change)', () => {
    expect(TURN_TIME_SEC).toBe(4)
  })
})

// ---- rawVehicles ----

import { rawVehicles } from '../flowMetrics'

describe('rawVehicles', () => {
  it('matches verification row 1: 45/hr × 138s → 1.725', () => {
    expect(rawVehicles(45, 138)).toBeCloseTo(1.725, 3)
  })

  it('matches verification row 7: 28/hr × 85s → 0.661', () => {
    expect(rawVehicles(28, 85)).toBeCloseTo(0.661, 3)
  })

  it('returns 0 when throughput is 0', () => {
    expect(rawVehicles(0, 100)).toBe(0)
  })

  it('returns 0 when throughput is negative', () => {
    expect(rawVehicles(-1, 100)).toBe(0)
  })

  it('returns null when cycle is null', () => {
    expect(rawVehicles(10, null)).toBeNull()
  })
})

// ---- flowDerived orchestrator ----

import { flowDerived } from '../flowMetrics'
import type { Flow } from '../types'

describe('flowDerived (orchestrator)', () => {
  const cb18Veh = cb18 as Vehicle

  it('returns nulls when vehicle is undefined', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 10, weightLbs: 500, turns: 0, liftHeightFt: 0,
    }
    expect(flowDerived(flow, undefined)).toEqual({
      cycleSeconds: null,
      rawVehicles: null,
      breakdown: null,
    })
  })

  it('ties cycle → raw together (Fork transfer, with turns)', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 30, weightLbs: 500, turns: 1, liftHeightFt: 0,
      vehicleId: 'cb18', transferMethodIdx: 0,
    }
    const d = flowDerived(flow, cb18Veh)
    // cycle = 10.16 + 8.70 + 5 + 5 + 4 = 32.86 s
    expect(d.cycleSeconds).toBeCloseTo(32.86, 1)
    // raw = 30 × 32.86 / 3600 ≈ 0.274
    expect(d.rawVehicles).toBeCloseTo(0.274, 3)
  })

  it('threads liftHeightFt through to cycleSeconds (Lift Platform)', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 0, thruPerHr: 60, weightLbs: 500, turns: 0, liftHeightFt: 13,
      vehicleId: 'cb18', transferMethodIdx: 1,
    }
    const d = flowDerived(flow, cb18Veh)
    // travel 0; load + unload = 16; lift 13 / 0.65 = 20 → cycle 36 s
    expect(d.cycleSeconds).toBeCloseTo(36, 1)
    // raw = 60 × 36 / 3600 = 0.6
    expect(d.rawVehicles).toBeCloseTo(0.6, 3)
  })
})

// ---- groupSummary ----

import { groupSummary } from '../flowMetrics'

describe('groupSummary', () => {
  const cb18Flows: Flow[] = [
    { id: '1', origin: 'Dock A',    destination: 'Storage 1', distanceFt: 590, thruPerHr: 45, weightLbs: 1984, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '2', origin: 'Storage 1', destination: 'Pack Line', distanceFt: 394, thruPerHr: 30, weightLbs: 1764, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '4', origin: 'Dock A',    destination: 'Storage 2', distanceFt: 722, thruPerHr: 38, weightLbs: 2425, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '5', origin: 'Storage 2', destination: 'Pack Line', distanceFt: 476, thruPerHr: 25, weightLbs: 2094, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '6', origin: 'Inbound',   destination: 'Storage 1', distanceFt: 312, thruPerHr: 22, weightLbs: 2646, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
  ]
  const derivedCb18 = new Map([
    ['1', { cycleSeconds: 138, rawVehicles: 1.725, breakdown: null }],
    ['2', { cycleSeconds:  98, rawVehicles: 0.817, breakdown: null }],
    ['4', { cycleSeconds: 165, rawVehicles: 1.742, breakdown: null }],
    ['5', { cycleSeconds: 115, rawVehicles: 0.799, breakdown: null }],
    ['6', { cycleSeconds:  81, rawVehicles: 0.495, breakdown: null }],
  ])

  it('aggregates the CB18 group per the verification table', () => {
    const g = groupSummary('cb18', cb18Flows, derivedCb18)
    expect(g.flowsCount).toBe(5)
    expect(g.baseThru).toBe(160)
    expect(g.groupRaw).toBeCloseTo(5.578, 2)
    expect(g.baseFleet).toBe(6)                       // ceil(5.578)
    expect(g.avgCycleSec).toBeCloseTo(125.5, 0)
    expect(g.headroom).toBeCloseTo(0.070, 2)          // (6 − 5.578) / 6
  })

  const ml2Flows: Flow[] = [
    { id: '3', origin: 'Pack Line', destination: 'Dock B',    distanceFt: 295, thruPerHr: 15, weightLbs: 110, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
    { id: '7', origin: 'Pick Wall', destination: 'Pack Line', distanceFt: 197, thruPerHr: 28, weightLbs:  77, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
    { id: '8', origin: 'Storage 1', destination: 'Pick Wall', distanceFt: 246, thruPerHr: 18, weightLbs:  62, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
  ]
  const derivedMl2 = new Map([
    ['3', { cycleSeconds: 118, rawVehicles: 0.492, breakdown: null }],
    ['7', { cycleSeconds:  85, rawVehicles: 0.661, breakdown: null }],
    ['8', { cycleSeconds: 101, rawVehicles: 0.505, breakdown: null }],
  ])

  it('aggregates the ML2 group per the verification table', () => {
    const g = groupSummary('ml2', ml2Flows, derivedMl2)
    expect(g.flowsCount).toBe(3)
    expect(g.baseThru).toBe(61)
    expect(g.groupRaw).toBeCloseTo(1.658, 2)
    expect(g.baseFleet).toBe(2)                        // ceil(1.658)
    expect(g.avgCycleSec).toBeCloseTo(97.8, 0)
    expect(g.headroom).toBeCloseTo(0.171, 2)           // (2 − 1.658) / 2
  })

  it('returns null avgCycle and headroom for an empty group', () => {
    const g = groupSummary('cb18', [], new Map())
    expect(g.flowsCount).toBe(0)
    expect(g.baseThru).toBe(0)
    expect(g.groupRaw).toBe(0)
    expect(g.baseFleet).toBe(0)
    expect(g.avgCycleSec).toBeNull()
    expect(g.headroom).toBeNull()
  })

  it('skips flows assigned to other vehicles', () => {
    const mixed: Flow[] = [
      ...cb18Flows,
      { id: 'X', origin: '', destination: '', distanceFt: 100, thruPerHr: 99, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
    ]
    const derived = new Map(derivedCb18)
    derived.set('X', { cycleSeconds: 50, rawVehicles: 1.0, breakdown: null })
    const g = groupSummary('cb18', mixed, derived)
    expect(g.flowsCount).toBe(5)            // ML2 flow not counted
    expect(g.baseThru).toBe(160)
  })
})

// ---- projectFlowSummary ----

import { projectFlowSummary } from '../flowMetrics'

describe('projectFlowSummary', () => {
  it('matches verification totals: 8 flows · 221 thru · 8 base fleet', () => {
    const allFlows: Flow[] = [
      { id: '1', origin: '', destination: '', distanceFt: 1, thruPerHr: 45, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '2', origin: '', destination: '', distanceFt: 1, thruPerHr: 30, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '3', origin: '', destination: '', distanceFt: 1, thruPerHr: 15, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
      { id: '4', origin: '', destination: '', distanceFt: 1, thruPerHr: 38, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '5', origin: '', destination: '', distanceFt: 1, thruPerHr: 25, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '6', origin: '', destination: '', distanceFt: 1, thruPerHr: 22, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '7', origin: '', destination: '', distanceFt: 1, thruPerHr: 28, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
      { id: '8', origin: '', destination: '', distanceFt: 1, thruPerHr: 18, weightLbs: 0, turns: 0, liftHeightFt: 0, vehicleId: 'ml2' },
    ]
    const derived = new Map([
      ['1', { cycleSeconds: 138, rawVehicles: 1.725, breakdown: null }],
      ['2', { cycleSeconds:  98, rawVehicles: 0.817, breakdown: null }],
      ['3', { cycleSeconds: 118, rawVehicles: 0.492, breakdown: null }],
      ['4', { cycleSeconds: 165, rawVehicles: 1.742, breakdown: null }],
      ['5', { cycleSeconds: 115, rawVehicles: 0.799, breakdown: null }],
      ['6', { cycleSeconds:  81, rawVehicles: 0.495, breakdown: null }],
      ['7', { cycleSeconds:  85, rawVehicles: 0.661, breakdown: null }],
      ['8', { cycleSeconds: 101, rawVehicles: 0.505, breakdown: null }],
    ])
    const s = projectFlowSummary(allFlows, derived)
    expect(s.totalFlows).toBe(8)
    expect(s.totalThru).toBe(221)
    expect(s.totalRawFleet).toBeCloseTo(7.236, 2)
    expect(s.totalBaseFleet).toBe(8)                  // 6 + 2
  })

  it('returns zeroed totals when there are no flows', () => {
    const s = projectFlowSummary([], new Map())
    expect(s.totalFlows).toBe(0)
    expect(s.totalThru).toBe(0)
    expect(s.totalRawFleet).toBe(0)
    expect(s.totalBaseFleet).toBe(0)
  })
})

import { cycleBreakdown } from '../flowMetrics'

describe('cycleBreakdown', () => {
  it('returns components that sum to totalSec (CB18, 100 ft, 2 turns, Fork, 0 lift)', () => {
    const b = cycleBreakdown(100, cb18 as Vehicle, 2, 0, 0)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.travelLoadedSec).toBeCloseTo(100 / 9.84, 3)
    expect(b.travelEmptySec).toBeCloseTo(100 / 11.5, 3)
    expect(b.loadSec).toBe(5)
    expect(b.unloadSec).toBe(5)
    expect(b.liftTimeSec).toBe(0)
    expect(b.turnPenaltySec).toBe(8)
    const sum = b.travelLoadedSec + b.travelEmptySec
              + b.loadSec + b.unloadSec
              + b.liftTimeSec + b.turnPenaltySec
    expect(b.totalSec).toBeCloseTo(sum, 5)
  })

  it('adds lift time when transfer method has lifts: true and liftSpeedFps > 0', () => {
    const lifter: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      calc: {
        speedLoadedFps: 9.84,
        speedUnloadedFps: 11.5,
        liftSpeedFps: 0.5,
      } as Vehicle['calc'],
      transferMethods: [
        { method: 'Lift Platform', loadTimeSec: 8, unloadTimeSec: 8, lifts: true },
      ],
    }
    const b = cycleBreakdown(0, lifter as Vehicle, 0, 10, 0)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.liftTimeSec).toBe(20)        // 10 ft / 0.5 fps = 20 s
    expect(b.totalSec).toBeCloseTo(8 + 8 + 20, 5)
  })

  it('returns null for the same edge cases as cycleSeconds', () => {
    expect(cycleBreakdown(-1, cb18 as Vehicle, 0, 0, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, -1, 0, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 0, -1, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 0, 0, 99)).toBeNull()
    const noTransfers: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      ...cb18,
      transferMethods: [],
    }
    expect(cycleBreakdown(100, noTransfers as Vehicle, 0, 0, 0)).toBeNull()
  })
})
