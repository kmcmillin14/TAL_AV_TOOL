import { describe, it, expect } from 'vitest'
import sample from '../../content/samples/toyota-project.json'
import { partialProjectSchema } from '../validations/schemas'

// The Pin transfer method index for the M10 (first and only entry in m10.transferMethods).
const M10_PIN_IDX = 0

describe('toyota sample project', () => {
  it('parses cleanly — every field survives the schema (no silent drops)', () => {
    const r = partialProjectSchema.safeParse(sample.project)
    expect(r.success).toBe(true)
    if (r.success) {
      // No key was stripped: everything we authored is meaningful.
      for (const key of Object.keys(sample.project)) expect(r.data).toHaveProperty(key)
    }
  })

  it('has exactly 6 flows', () => {
    expect(sample.project.flows).toHaveLength(6)
  })

  it('has exactly 3 flowGroups', () => {
    expect(sample.project.flowGroups).toHaveLength(3)
    expect(sample.project.flowGroups).toEqual([
      'Receiving & Putaway',
      'Lineside Delivery',
      'Finished Goods',
    ])
  })

  it('uses exactly the expected vehicle set {cb18, m10, 8hbc40a}', () => {
    const ids = new Set(
      (sample.project.flows as Array<{ vehicleId?: string }>)
        .map(f => f.vehicleId)
        .filter(Boolean),
    )
    expect(ids).toEqual(new Set(['cb18', 'm10', '8hbc40a']))
  })

  it('M10 flows have transferMethodIdx equal to the Pin index', () => {
    const m10Flows = (
      sample.project.flows as Array<{ vehicleId?: string; transferMethodIdx?: number }>
    ).filter(f => f.vehicleId === 'm10')
    expect(m10Flows.length).toBeGreaterThan(0)
    for (const f of m10Flows) {
      expect(f.transferMethodIdx).toBe(M10_PIN_IDX)
    }
  })

  it('flows 1-2 use cb18 with 15 ft lift height', () => {
    const flows = sample.project.flows as Array<{ vehicleId?: string; liftHeightFt?: number }>
    expect(flows[0].vehicleId).toBe('cb18')
    expect(flows[0].liftHeightFt).toBe(15)
    expect(flows[1].vehicleId).toBe('cb18')
    expect(flows[1].liftHeightFt).toBe(15)
  })

  it('flows 5-6 use 8hbc40a for finished goods (floor-level)', () => {
    const flows = sample.project.flows as Array<{ vehicleId?: string; liftHeightFt?: number }>
    expect(flows[4].vehicleId).toBe('8hbc40a')
    expect(flows[4].liftHeightFt).toBe(0)
    expect(flows[5].vehicleId).toBe('8hbc40a')
    expect(flows[5].liftHeightFt).toBe(0)
  })
})
