import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TARGET_UTILIZATION, DEFAULT_BUFFER_PCT,
  bufferFromUtilization, utilizationFromBuffer,
} from '../types'

describe('target utilization ↔ buffer multiplier', () => {
  it('are exact inverses', () => {
    for (const u of [0.70, 0.80, 0.85, 0.95, 1.0]) {
      expect(utilizationFromBuffer(bufferFromUtilization(u))).toBeCloseTo(u, 10)
    }
    for (const b of [0, 0.1, 0.25, 0.5, 1.0]) {
      expect(bufferFromUtilization(utilizationFromBuffer(b))).toBeCloseTo(b, 10)
    }
  })

  it('80% utilization is a 0.25 buffer (the default)', () => {
    expect(bufferFromUtilization(0.80)).toBeCloseTo(0.25, 10)
    expect(DEFAULT_TARGET_UTILIZATION).toBe(0.80)
    expect(DEFAULT_BUFFER_PCT).toBeCloseTo(0.25, 10)
  })

  it('standard band maps as documented', () => {
    expect(bufferFromUtilization(0.70)).toBeCloseTo(0.4286, 3)  // conservative
    expect(bufferFromUtilization(0.85)).toBeCloseTo(0.1765, 3)  // aggressive
  })

  it('100% utilization = zero buffer; higher buffer = lower utilization', () => {
    expect(bufferFromUtilization(1.0)).toBe(0)
    expect(utilizationFromBuffer(0)).toBe(1)
    expect(utilizationFromBuffer(0.5)).toBeGreaterThan(utilizationFromBuffer(1.0))
  })

  it('50% utilization stays within the schema buffer cap (≤ 1.0)', () => {
    expect(bufferFromUtilization(0.50)).toBeLessThanOrEqual(1.0)
  })
})
