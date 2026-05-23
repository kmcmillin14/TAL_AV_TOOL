import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createProject, getProject, updateProject } from '../storage'

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
})

afterAll(() => {
  slot.window = originalWindow
})

describe('flows round-trip', () => {
  it('persists flows through create + update + read', () => {
    const p = createProject({ projectName: 'Test' })
    expect(p.flows).toEqual([])

    updateProject(p.id, {
      flows: [{
        id: 'f1',
        origin: 'A',
        destination: 'B',
        distanceFt: 100,
        thruPerHr: 10,
        weightLbs: 500,
        turns: 1,
        liftHeightFt: 0,
        vehicleId: 'cb18',
      }],
    })

    const read = getProject(p.id)
    expect(read?.flows).toHaveLength(1)
    expect(read?.flows?.[0]).toMatchObject({
      id: 'f1',
      distanceFt: 100,
      turns: 1,
      vehicleId: 'cb18',
    })
  })
})
