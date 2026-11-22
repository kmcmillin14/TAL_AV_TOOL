import { describe, expect, it } from 'vitest'
import { batteryMarker, checkScale, gradeBattery, gradeOrders, gradeUtilization, verdictPasses, worstGrade } from '../grades'

describe('sizing checks graded (owner, 2026-11-22)', () => {
  it('orders: green to 0.5 pts short, amber to 3, red beyond or with a growing backlog', () => {
    expect([0, 0.5, 0.6, 3, 3.1].map(x => gradeOrders(x))).toEqual(['good', 'good', 'tight', 'tight', 'bad'])
    expect(gradeOrders(0, true)).toBe('bad')
  })
  it('utilization: spare well under, green to the target, amber 5 pts over, red beyond or over 100%', () => {
    expect([0.6, 0.75, 0.9, 0.9004, 0.95, 0.96].map(u => gradeUtilization(u, 0.9))).toEqual(['spare', 'good', 'good', 'tight', 'tight', 'bad'])
    expect(gradeUtilization(1.01, 0.98)).toBe('bad')
  })
  it('battery: the worst of the floor, nearing it, the morning sag and waiting for chargers', () => {
    const ok = { lowPct: 50, floorPct: 20, sagPts: 1, waitShare: 0 }
    expect(gradeBattery(ok)).toBe('good')
    expect(gradeBattery({ ...ok, sagPts: 2.4 })).toBe('tight')
    expect(gradeBattery({ ...ok, sagPts: 13 })).toBe('bad')
    expect(gradeBattery({ ...ok, waitShare: 0.015 })).toBe('tight')
    expect(gradeBattery({ ...ok, lowPct: 24 })).toBe('tight')
    expect(gradeBattery({ ...ok, lowPct: 20 })).toBe('bad')
    expect(gradeBattery({ ...ok, sagPts: null })).toBe('good')
  })
  it('amber passes; the worst grade decides', () => {
    expect(worstGrade(['spare', 'tight', 'good'])).toBe('tight')
    expect([verdictPasses('meets'), verdictPasses('tight'), verdictPasses('short'), verdictPasses('checking')]).toEqual([true, true, false, false])
  })
  it('scales place a value along bands that cover 0–1', () => {
    const s = checkScale('utilization', 0.9)
    expect(s.bands.map(b => b.grade)).toEqual(['spare', 'good', 'tight', 'bad'])
    expect(s.bands[0].from).toBe(0); expect(s.bands.at(-1)!.to).toBeCloseTo(1)
    expect(s.pos(0.9)).toBeCloseTo(0.9 / 1.1); expect(s.pos(5)).toBe(1)
  })
  it('the battery marker: the sag when it set the grade, else the middle of the band of its grade', () => {
    expect(batteryMarker('tight', 3)).toBe(3)
    expect(batteryMarker('bad', 1)).toBe(7.5)
    expect(batteryMarker('tight', null)).toBe(3.5)
  })
})
