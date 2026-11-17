import { describe, expect, it } from 'vitest'
import small from '@/src/content/samples/simulate-racks-small.json'
import medium from '@/src/content/samples/simulate-racks-medium.json'
import large from '@/src/content/samples/simulate-racks-large.json'
import { simLayoutSchema } from '@/src/lib/validations/simSchemas'
import { projectFleetSettings } from '@/src/lib/fleetModel'
import { fleetFromFlows } from '../../fleet'
import { readinessChecks } from '../readiness'
import { B56_5_RULE } from '../clearance'
import { runInputs } from '../runInputs'
import type { SimLayout } from '../types'
import { LIBRARY } from './fixtures'

describe('the rack examples (owner, 2026-11-17: small, medium and large fleets, with racking)', () => {
  const byId = new Map(LIBRARY.map(v => [v.id, v]))
  it.each([['small', small, 2], ['medium', medium, 6], ['large', large, 12]] as const)('%s: loads, passes Validation and sizes to its fleet', (_, sample, fleet) => {
    const layout = simLayoutSchema.parse(sample.layout) as SimLayout
    expect(layout.points.filter(p => p.rack).length).toBeGreaterThan(0)
    expect(sample.flows.every(f => f.id.startsWith('sample-'))).toBe(true)
    const inputs = runInputs(layout, sample.flows as never, byId, B56_5_RULE, {}, [])
    const checks = readinessChecks({ layout, flows: sample.flows as never, vehicles: LIBRARY, driven: inputs.layout, fleetNeeded: fleet })
    expect(checks.filter(c => c.level === 'bad')).toEqual([])
    expect(inputs.flows).toHaveLength(sample.flows.length)
    expect(fleetFromFlows(sample.flows as never, byId, projectFleetSettings({})).fleet.totalFleetSold).toBe(fleet)
  })
})
