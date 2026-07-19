import { describe, it, expect } from 'vitest'
import sample from '../../content/samples/michelin-project.json'
import { partialProjectSchema } from '../validations/schemas'

describe('michelin sample project', () => {
  it('parses cleanly — every field survives the schema (no silent drops)', () => {
    const r = partialProjectSchema.safeParse(sample.project)
    expect(r.success).toBe(true)
    if (r.success) {
      // No key was stripped: everything we authored is meaningful.
      for (const key of Object.keys(sample.project)) expect(r.data).toHaveProperty(key)
    }
  })
  it('carries one assigned flow that produces demand', () => {
    const f = (sample.project as { flows: Array<Record<string, unknown>> }).flows[0]
    expect(f.vehicleId).toBe('cb18')
    expect(f.distanceFt).toBe(300)
    expect(f.thruPerHr).toBe(55)
  })
})
