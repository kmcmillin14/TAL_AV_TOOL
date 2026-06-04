import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createProject, getProject, updateProject, resetProjectsCache } from '../storage'

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
  // storage.ts caches the parsed array in module memory; drop it so each test
  // starts from its own fresh localStorage shim.
  resetProjectsCache()
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
        routeLayout: 'medium',
        liftHeightFt: 0,
        vehicleId: 'cb18',
      }],
    })

    const read = getProject(p.id)
    expect(read?.flows).toHaveLength(1)
    expect(read?.flows?.[0]).toMatchObject({
      id: 'f1',
      distanceFt: 100,
      routeLayout: 'medium',
      vehicleId: 'cb18',
    })
  })

  it('persists sectionName when set; leaves it undefined when not', () => {
    const p = createProject({ projectName: 'Sections' })

    updateProject(p.id, {
      flows: [
        {
          id: 'f1',
          origin: 'Dock',
          destination: 'Storage',
          distanceFt: 100,
          thruPerHr: 10,
          routeLayout: 'medium',
          liftHeightFt: 0,
          sectionName: 'Phase 1',
        },
        {
          id: 'f2',
          origin: 'Storage',
          destination: 'Pack',
          distanceFt: 200,
          thruPerHr: 12,
          routeLayout: 'medium',
          liftHeightFt: 0,
          // no sectionName
        },
      ],
    })

    const read = getProject(p.id)
    expect(read?.flows?.[0]?.sectionName).toBe('Phase 1')
    expect(read?.flows?.[1]?.sectionName).toBeUndefined()
  })
})

// Regression: a partial updateProject patch must touch ONLY the fields the caller
// passed. Zod v4 `.partial()` does NOT strip `.default()`, so parsing a partial
// patch re-injects defaults for absent fields (flows: [], flowGroups: [], certs: []…).
// The merge must not let those injected defaults clobber existing stored values.
describe('partial update preserves unspecified fields', () => {
  const flow = (id: string, sectionName?: string) => ({
    id,
    origin: 'A',
    destination: 'B',
    distanceFt: 100,
    thruPerHr: 10,
    routeLayout: 'medium' as const,
    liftHeightFt: 0,
    sectionName,
  })

  it('keeps flows when patching only flowGroups (the reported bug)', () => {
    const p = createProject({ projectName: 'Groups' })
    updateProject(p.id, { flows: [flow('f1')] })

    // Add a group — a flowGroups-only patch. Flows must NOT disappear.
    updateProject(p.id, { flowGroups: ['Dock'] })

    const read = getProject(p.id)
    expect(read?.flows).toHaveLength(1)
    expect(read?.flows?.[0]?.id).toBe('f1')
    expect(read?.flowGroups).toEqual(['Dock'])
  })

  it('accumulates multiple groups across patches', () => {
    const p = createProject({ projectName: 'MultiGroup' })
    updateProject(p.id, { flowGroups: ['Group 1'] })
    updateProject(p.id, { flowGroups: ['Group 1', 'Group 2'] })

    expect(getProject(p.id)?.flowGroups).toEqual(['Group 1', 'Group 2'])
  })

  it('keeps flowGroups when patching only flows', () => {
    const p = createProject({ projectName: 'Reverse' })
    updateProject(p.id, { flowGroups: ['Zone A'] })

    // Edit/add a flow — a flows-only patch. Groups must survive.
    updateProject(p.id, { flows: [flow('f1', 'Zone A')] })

    const read = getProject(p.id)
    expect(read?.flowGroups).toEqual(['Zone A'])
    expect(read?.flows).toHaveLength(1)
  })

  it('keeps unrelated defaulted fields (certifications) across an unrelated patch', () => {
    const p = createProject({ projectName: 'Certs', certifications: ['ISO 3691-4'] })
    updateProject(p.id, { flowGroups: ['A'] })

    expect(getProject(p.id)?.certifications).toEqual(['ISO 3691-4'])
  })

  it('persists per-group color overrides and keeps them across a flowGroups patch', () => {
    const p = createProject({ projectName: 'Colors' })
    updateProject(p.id, { flowGroups: ['Dock'], flowGroupColors: { Dock: '#5eea90' } })
    expect(getProject(p.id)?.flowGroupColors).toEqual({ Dock: '#5eea90' })

    // Adding another group must not drop the existing color override.
    updateProject(p.id, { flowGroups: ['Dock', 'ASRS'] })
    expect(getProject(p.id)?.flowGroupColors).toEqual({ Dock: '#5eea90' })
  })
})
