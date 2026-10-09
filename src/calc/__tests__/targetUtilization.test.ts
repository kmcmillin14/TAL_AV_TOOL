import { describe, it, expect } from 'vitest'
import { DEFAULT_TARGET_UTILIZATION } from '../types'
import { projectSchema } from '@/src/lib/validations/schemas'

/** v4 (2026-10-09) retired the inverse "buffer multiplier". The field the
 *  engineer sets — a target utilization — is now the field that is stored, so
 *  one vocabulary runs end to end. `bufferFromUtilization` /
 *  `utilizationFromBuffer` / `DEFAULT_BUFFER_PCT` are deleted; this pins that
 *  they do not come back, and that the default and the clamp are what we say. */
describe('target utilization — one number, one vocabulary', () => {
  it('defaults to 90% of AVAILABLE working time', () => {
    expect(DEFAULT_TARGET_UTILIZATION).toBe(0.90)
    expect(projectSchema.parse({}).targetUtilization).toBe(0.90)
  })

  it('REGRESSION: the inverse buffer helpers are gone', async () => {
    const types = await import('../types') as Record<string, unknown>
    for (const gone of ['DEFAULT_BUFFER_PCT', 'bufferFromUtilization', 'utilizationFromBuffer']) {
      expect(types[gone]).toBeUndefined()
    }
  })

  it('clamps to a sane band — headroom can never exceed 2x', () => {
    expect(projectSchema.safeParse({ targetUtilization: 0.5 }).success).toBe(true)
    expect(projectSchema.safeParse({ targetUtilization: 1.0 }).success).toBe(true)
    expect(projectSchema.safeParse({ targetUtilization: 0.4 }).success).toBe(false)
    expect(projectSchema.safeParse({ targetUtilization: 1.1 }).success).toBe(false)
  })
})
