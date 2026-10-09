import { describe, it, expect } from 'vitest'
import { projectSchema } from '../validations/schemas'

/** Stored projects carry the retired `bufferPct`. `migrateLegacyFields` in
 *  storage.ts converts on read so an existing project keeps the SAME fleet —
 *  without it the schema would silently drop the unknown key and fall back to
 *  the 90% default, quietly re-sizing every saved project. This pins the
 *  conversion arithmetic; the storage path is exercised by storage's own tests. */
const migrate = (raw: Record<string, unknown>) => {
  if (raw.targetUtilization != null) return raw
  const legacy = raw.bufferPct
  if (typeof legacy !== 'number' || !Number.isFinite(legacy) || legacy < 0) return raw
  const { bufferPct: _drop, ...rest } = raw
  return { ...rest, targetUtilization: 1 / (1 + legacy) }
}

describe('legacy bufferPct → targetUtilization', () => {
  it('converts the inverse exactly — a saved project keeps its fleet', () => {
    for (const [buffer, util] of [[0, 1], [0.25, 0.8], [1 / 9, 0.9], [0.1, 1 / 1.1]] as const) {
      expect((migrate({ bufferPct: buffer }) as { targetUtilization: number }).targetUtilization)
        .toBeCloseTo(util, 10)
    }
  })

  it('drops the legacy key so the schema does not see both', () => {
    expect('bufferPct' in migrate({ bufferPct: 0.25 })).toBe(false)
  })

  it('an already-migrated project is left alone', () => {
    const v4 = { targetUtilization: 0.85, bufferPct: 0.25 }
    expect(migrate(v4)).toBe(v4)
  })

  it('a project with neither key falls through to the schema default', () => {
    expect(projectSchema.parse(migrate({})).targetUtilization).toBe(0.90)
  })

  it('ignores a malformed legacy value rather than writing NaN', () => {
    for (const bad of [NaN, -1, 'x', null]) {
      expect('targetUtilization' in migrate({ bufferPct: bad })).toBe(false)
    }
  })
})
