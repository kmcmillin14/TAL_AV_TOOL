import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { subscribeSaveDrops, createProject, updateProject, resetProjectsCache } from '../storage'

// storage.ts gates its persistence behind `typeof window === 'undefined'`.
// Vitest runs under the `node` environment, so we attach a minimal
// localStorage shim to globalThis.window for round-trip coverage.
type WindowSlot = { window?: unknown }
const slot = globalThis as WindowSlot
const originalWindow = slot.window

beforeEach(() => {
  const store = new Map<string, string>()
  slot.window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    },
  }
  resetProjectsCache()
})

afterAll(() => {
  slot.window = originalWindow
})

describe('subscribeSaveDrops', () => {
  it('fires with key + zod message when a field is dropped, not on clean saves', () => {
    const p = createProject({})
    const events: { key: string; message: string }[][] = []
    const unsub = subscribeSaveDrops(d => events.push(d))
    updateProject(p.id, { shiftsPerDay: 4 } as never)     // max 3 → dropped
    updateProject(p.id, { shiftsPerDay: 2 } as never)     // clean → no event
    unsub()
    expect(events).toHaveLength(1)
    expect(events[0][0].key).toBe('shiftsPerDay')
    expect(events[0][0].message.length).toBeGreaterThan(0)
  })
})
