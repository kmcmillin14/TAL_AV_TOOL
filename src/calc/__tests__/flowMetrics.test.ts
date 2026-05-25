import { describe, it, expect } from 'vitest'
import { cycleSeconds, routeLayoutFactor } from '../flowMetrics'
import { ROUTE_LAYOUT_FACTORS } from '../types'
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

describe('routeLayoutFactor', () => {
  it('maps low/medium/high to 0.3/0.5/0.7 (route-average; 0.7 ceiling)', () => {
    expect(routeLayoutFactor('low')).toBe(0.3)
    expect(routeLayoutFactor('medium')).toBe(0.5)
    expect(routeLayoutFactor('high')).toBe(0.7)
  })

  it('pins the constants exported on the type module', () => {
    expect(ROUTE_LAYOUT_FACTORS.low).toBe(0.3)
    expect(ROUTE_LAYOUT_FACTORS.medium).toBe(0.5)
    expect(ROUTE_LAYOUT_FACTORS.high).toBe(0.7)
  })
})

describe('cycleSeconds', () => {
  it('medium routeLayout (×0.5): travel + load + unload', () => {
    // distance 100 ft, Fork, medium routeLayout, no lift, no delay
    //   effective speed loaded = 9.84 × 0.5 = 4.92 fps → 100 / 4.92 ≈ 20.33 s
    //   effective speed empty  = 11.5 × 0.5 = 5.75 fps → 100 / 5.75 ≈ 17.39 s
    //   load + unload                                  = 10 s
    //   total                                          ≈ 47.72 s
    expect(cycleSeconds(100, cb18 as Vehicle, 'medium', 0, 0)).toBeCloseTo(47.72, 1)
  })

  it('high routeLayout (×0.7): faster travel', () => {
    // 100 / (9.84*0.7) + 100 / (11.5*0.7) + 10 = 14.52 + 12.42 + 10 = 36.94 s
    expect(cycleSeconds(100, cb18 as Vehicle, 'high', 0, 0)).toBeCloseTo(36.94, 1)
  })

  it('low routeLayout (×0.3): much slower travel', () => {
    // 100 / (9.84*0.3) + 100 / (11.5*0.3) + 10 = 33.88 + 28.99 + 10 = 72.86 s
    expect(cycleSeconds(100, cb18 as Vehicle, 'low', 0, 0)).toBeCloseTo(72.86, 1)
  })

  it('uses transferMethodIdx to pick load/unload times', () => {
    // medium routeLayout, Lift Platform (idx 1), liftHeightFt 0:
    //   20.33 + 17.39 + 8 + 8 = 53.72 s
    expect(cycleSeconds(100, cb18 as Vehicle, 'medium', 0, 1)).toBeCloseTo(53.72, 1)
  })

  it('defaults transferMethodIdx to 0 when omitted', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 'medium', 0)).toBeCloseTo(47.72, 1)
  })

  it('returns load+unload only when distance is 0 and no lift', () => {
    expect(cycleSeconds(0, cb18 as Vehicle, 'medium', 0, 0)).toBeCloseTo(10, 5)
  })

  it('adds liftHeightFt / liftSpeedFps for lifts:true transfer methods', () => {
    // distance 0, Lift Platform (idx 1), liftHeightFt = 10 ft, liftSpeedFps = 0.65
    //   liftTime = 10 / 0.65 = 15.38 s; load + unload = 16, + 15.38 = 31.38 s
    expect(cycleSeconds(0, cb18 as Vehicle, 'medium', 10, 1)).toBeCloseTo(31.38, 1)
  })

  it('uses the spec example: liftHeight 10 ft at 0.5 fps → +20 s', () => {
    const v: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      calc: { speedLoadedFps: 5, speedUnloadedFps: 5, liftSpeedFps: 0.5 } as Vehicle['calc'],
      transferMethods: [{ method: 'Lift', loadTimeSec: 0, unloadTimeSec: 0, lifts: true }],
    }
    // distance 0 (routeLayout irrelevant when distance is 0), liftHeight 10, liftSpeed 0.5 → 20 s exactly
    expect(cycleSeconds(0, v as Vehicle, 'medium', 10, 0)).toBeCloseTo(20, 5)
  })

  it('ignores liftHeightFt when the transfer method does not have lifts: true', () => {
    // Fork (idx 0) in this fixture has no lifts flag. liftHeightFt provided but adds 0.
    //   medium routeLayout: 20.33 + 17.39 + 5 + 5 = 47.72 s
    expect(cycleSeconds(100, cb18 as Vehicle, 'medium', 50, 0)).toBeCloseTo(47.72, 1)
  })

  it('adds 0 lift time when liftSpeedFps is missing on the vehicle', () => {
    // Transfer has lifts:true but vehicle has no liftSpeedFps → graceful 0.
    //   medium: 20.33 + 17.39 + 8 + 8 = 53.72 s
    expect(cycleSeconds(100, noLiftSpeed as Vehicle, 'medium', 10, 0)).toBeCloseTo(53.72, 1)
  })

  it('returns null when distance is negative', () => {
    expect(cycleSeconds(-1, cb18 as Vehicle, 'medium', 0, 0)).toBeNull()
  })

  it('returns null when liftHeightFt is negative', () => {
    expect(cycleSeconds(100, cb18 as Vehicle, 'medium', -1, 0)).toBeNull()
  })

  it('returns null when vehicle has no transferMethods', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, transferMethods: [] }
    expect(cycleSeconds(100, broken, 'medium', 0, 0)).toBeNull()
  })

  it('returns null when transferMethodIdx is out of range', () => {
    expect(cycleSeconds(100, cb18, 'medium', 0, 99)).toBeNull()
  })

  it('returns null when speedLoadedFps is 0', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, calc: { ...cb18.calc, speedLoadedFps: 0 } }
    expect(cycleSeconds(100, broken, 'medium', 0, 0)).toBeNull()
  })

  it('returns null when speedUnloadedFps is 0', () => {
    const broken: Pick<Vehicle, 'calc' | 'transferMethods'> = { ...cb18, calc: { ...cb18.calc, speedUnloadedFps: 0 } }
    expect(cycleSeconds(100, broken, 'medium', 0, 0)).toBeNull()
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
      distanceFt: 100, thruPerHr: 10, routeLayout: 'medium', liftHeightFt: 0,
    }
    expect(flowDerived(flow, undefined)).toEqual({
      cycleSeconds: null,
      rawVehicles: null,
      breakdown: null,
    })
  })

  it('ties cycle → raw together (Fork, medium routeLayout)', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 100, thruPerHr: 30, routeLayout: 'medium', liftHeightFt: 0,
      vehicleId: 'cb18', transferMethodIdx: 0,
    }
    const d = flowDerived(flow, cb18Veh)
    // medium ×0.5: 20.33 + 17.39 + 5 + 5 = 47.72 s
    expect(d.cycleSeconds).toBeCloseTo(47.72, 1)
    // raw = 30 × 47.72 / 3600 ≈ 0.398
    expect(d.rawVehicles).toBeCloseTo(0.398, 3)
  })

  it('threads liftHeightFt through to cycleSeconds (Lift Platform)', () => {
    const flow: Flow = {
      id: 'f1', origin: 'A', destination: 'B',
      distanceFt: 0, thruPerHr: 60, routeLayout: 'medium', liftHeightFt: 13,
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
    { id: '1', origin: 'Dock A',    destination: 'Storage 1', distanceFt: 590, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '2', origin: 'Storage 1', destination: 'Pack Line', distanceFt: 394, thruPerHr: 30, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '4', origin: 'Dock A',    destination: 'Storage 2', distanceFt: 722, thruPerHr: 38, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '5', origin: 'Storage 2', destination: 'Pack Line', distanceFt: 476, thruPerHr: 25, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
    { id: '6', origin: 'Inbound',   destination: 'Storage 1', distanceFt: 312, thruPerHr: 22, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
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
    { id: '3', origin: 'Pack Line', destination: 'Dock B',    distanceFt: 295, thruPerHr: 15, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
    { id: '7', origin: 'Pick Wall', destination: 'Pack Line', distanceFt: 197, thruPerHr: 28, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
    { id: '8', origin: 'Storage 1', destination: 'Pick Wall', distanceFt: 246, thruPerHr: 18, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
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
      { id: 'X', origin: '', destination: '', distanceFt: 100, thruPerHr: 99, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
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
      { id: '1', origin: '', destination: '', distanceFt: 1, thruPerHr: 45, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '2', origin: '', destination: '', distanceFt: 1, thruPerHr: 30, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '3', origin: '', destination: '', distanceFt: 1, thruPerHr: 15, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
      { id: '4', origin: '', destination: '', distanceFt: 1, thruPerHr: 38, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '5', origin: '', destination: '', distanceFt: 1, thruPerHr: 25, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '6', origin: '', destination: '', distanceFt: 1, thruPerHr: 22, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18' },
      { id: '7', origin: '', destination: '', distanceFt: 1, thruPerHr: 28, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
      { id: '8', origin: '', destination: '', distanceFt: 1, thruPerHr: 18, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ml2' },
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
  it('returns components that sum to totalSec (CB18, 100 ft, medium routeLayout, Fork, 0 lift)', () => {
    const b = cycleBreakdown(100, cb18 as Vehicle, 'medium', 0, 0)
    expect(b).not.toBeNull()
    if (!b) return
    // medium factor 0.5
    expect(b.travelLoadedSec).toBeCloseTo(100 / (9.84 * 0.5), 3)
    expect(b.travelEmptySec).toBeCloseTo(100 / (11.5 * 0.5), 3)
    expect(b.loadSec).toBe(5)
    expect(b.unloadSec).toBe(5)
    expect(b.liftTimeSec).toBe(0)
    expect(b.methodName).toBe('Fork')
    expect(b.liftHeightFt).toBe(0)
    expect(b.routeLayout).toBe('medium')
    expect(b.routeLayoutFactor).toBe(0.5)
    const sum = b.travelLoadedSec + b.travelEmptySec
              + b.loadSec + b.unloadSec
              + b.liftTimeSec
    expect(b.totalSec).toBeCloseTo(sum, 5)
  })

  it('routeLayout choice scales travel speed (loaded + empty)', () => {
    const low = cycleBreakdown(100, cb18 as Vehicle, 'low', 0, 0)!
    const med = cycleBreakdown(100, cb18 as Vehicle, 'medium', 0, 0)!
    const hi  = cycleBreakdown(100, cb18 as Vehicle, 'high', 0, 0)!
    expect(low.travelLoadedSec).toBeGreaterThan(med.travelLoadedSec)
    expect(med.travelLoadedSec).toBeGreaterThan(hi.travelLoadedSec)
    // load + unload identical across the three
    expect(low.loadSec).toBe(med.loadSec)
    expect(med.loadSec).toBe(hi.loadSec)
  })

  it('echoes methodName, liftHeightFt, routeLayout, and factor for popover display', () => {
    const b = cycleBreakdown(0, cb18 as Vehicle, 'high', 4, 1)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.methodName).toBe('Lift Platform')
    expect(b.liftHeightFt).toBe(4)
    expect(b.routeLayout).toBe('high')
    expect(b.routeLayoutFactor).toBe(0.7)
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
    // distance 0 → travel is 0 regardless of routeLayout; 10 ft / 0.5 fps = 20 s
    const b = cycleBreakdown(0, lifter as Vehicle, 'medium', 10, 0)
    expect(b).not.toBeNull()
    if (!b) return
    expect(b.liftTimeSec).toBe(20)
    expect(b.totalSec).toBeCloseTo(8 + 8 + 20, 5)
  })

  it('returns null for the same edge cases as cycleSeconds', () => {
    expect(cycleBreakdown(-1, cb18 as Vehicle, 'medium', 0, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 'medium', -1, 0)).toBeNull()
    expect(cycleBreakdown(100, cb18 as Vehicle, 'medium', 0, 99)).toBeNull()
    const noTransfers: Pick<Vehicle, 'calc' | 'transferMethods'> = {
      ...cb18,
      transferMethods: [],
    }
    expect(cycleBreakdown(100, noTransfers as Vehicle, 'medium', 0, 0)).toBeNull()
  })
})
