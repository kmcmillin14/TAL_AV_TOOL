import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import companyA from '@/src/content/samples/company-a-project.json'
import michelin from '@/src/content/samples/michelin-questionnaire.json'
import {
  createProject, exportProjectJson, getDrawingData, getProject, importProjectFromJson,
  resetProjectsCache, undoLastChange, updateProject,
} from '../storage'
import { SCHEMA_VERSION, partialProjectSchema } from '../validations/schemas'

// storage.ts persists only when `window` exists — give it a localStorage shim we can inspect.
type WindowSlot = { window?: unknown }
const slot = globalThis as WindowSlot
const originalWindow = slot.window
let store: Map<string, string>
beforeEach(() => {
  store = new Map()
  slot.window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    },
  }
  resetProjectsCache()
  vi.useFakeTimers()
})
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })   // let the debounced write finish so the next test can schedule its own
afterAll(() => { slot.window = originalWindow })

/** What localStorage holds after the debounced write has run. Fails loudly if nothing was written,
 *  so "the image is not in storage" can never pass on an empty store. */
const persisted = () => {
  vi.runOnlyPendingTimers()
  const all = [...store.values()].join('')
  expect(all.length).toBeGreaterThan(0)
  return all
}
const IMAGE = 'data:image/png;base64,' + 'A'.repeat(4000)
const strip = (p: Record<string, unknown>) => {
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p
  return rest
}

const simProject = {
  projectName: 'Sim round trip',
  flows: [{
    id: 'f1', origin: 'Dock', destination: 'Rack', distanceFt: 120, thruPerHr: 30, routeLayout: 'medium' as const,
    liftHeightFt: 0, vehicleId: 'cb18', fromPointId: 'A', toPointId: 'B', distanceSource: 'layout' as const,
    hourlyProfile: Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 22 ? 1 : 0)), batchSize: 2, priority: 1,
  }],
  simLayout: {
    points: [
      { id: 'A', x: 0, y: 0, type: 'stand' as const, role: 'pick' as const, name: 'Dock', heightFt: 0 },
      { id: 'B', x: 120, y: 0, type: 'conveyor' as const, role: 'drop' as const, name: 'Rack', heightFt: 3, handshakeSec: 4, approachHeadingDeg: 90 },
      { id: 'C', x: -20, y: 0, type: 'charger' as const },
    ],
    segments: [
      { id: 's1', a: 'A', b: 'B', dir: 'two' as const, lane: 'single' as const },
      { id: 's2', a: 'C', b: 'A', dir: 'ab' as const, curve: { kind: 'arc' as const, mid: { x: -10, y: 4 } } },
    ],
    objects: [{ id: 'o1', x: 10, y: 4, w: 40, h: 1, rotationDeg: 0, name: 'Wall' }],
    background: { kind: 'pdf' as const, fileName: 'site.pdf', page: 2, fingerprint: 'abc123', scale: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, lengthFt: 50 } },
  },
  simSettings: {
    fleet: { cb18: 3 }, demandPct: 100, seed: 4, replications: 10, overrides: { 'cb18.turnSpeedFps': 3 },
    clearance: { thresholdFps: 3.94, lowSpeedIn: 6, fullSpeedIn: 19.69, sharedBetweenVehicles: true, edition: 'B56.5-2019' },
  },
}

describe('Milestone 2 — existing projects load unchanged', () => {
  it.each([['Company A sample', companyA], ['Michelin questionnaire', michelin]])('%s gains no simulation keys', (_n, sample) => {
    const project = (sample as { project: Record<string, unknown> }).project
    const parsed = partialProjectSchema.parse(project) as Record<string, unknown>
    expect('simLayout' in parsed).toBe(false)
    expect('simSettings' in parsed).toBe(false)
    for (const f of (parsed.flows as Record<string, unknown>[] | undefined) ?? []) {
      for (const k of ['fromPointId', 'toPointId', 'distanceSource', 'hourlyProfile', 'batchSize', 'priority']) expect(k in f).toBe(false)
    }
  })

  it.each([['Company A sample', companyA], ['Michelin questionnaire', michelin]])('%s survives export → import identically', (_n, sample) => {
    const first = importProjectFromJson(JSON.stringify(sample))
    const again = importProjectFromJson(exportProjectJson(first.id)!)
    expect(strip(again as unknown as Record<string, unknown>)).toEqual(strip(first as unknown as Record<string, unknown>))
  })
})

describe('Milestone 2 — simulation fields round-trip', () => {
  it('flow links, layout and settings survive save, export and import', () => {
    const p = createProject(simProject)
    const back = importProjectFromJson(exportProjectJson(p.id)!)
    expect(back.flows?.[0]).toMatchObject(simProject.flows[0])
    expect(back.simLayout).toEqual(simProject.simLayout)
    expect(back.simSettings).toEqual(simProject.simSettings)
  })

  it('rejects layout data that is not a valid shape', () => {
    const bad = { ...simProject.simLayout, segments: [{ id: 's', a: 'A', b: 'B', dir: 'sideways' }] }
    expect(partialProjectSchema.safeParse({ simLayout: bad }).success).toBe(false)
  })
})

describe('Milestone 2 — the drawing never reaches browser storage (D-4, acceptance 39)', () => {
  const withImage = { ...simProject, simLayout: { ...simProject.simLayout, background: { ...simProject.simLayout.background, data: IMAGE } } }

  it('importing a revision with a drawing keeps the image in memory only', () => {
    const p = importProjectFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, project: withImage }))
    expect(persisted()).not.toContain(IMAGE)
    expect(getDrawingData(p.id)).toBe(IMAGE)
    resetProjectsCache()                         // read back from localStorage alone
    expect(getProject(p.id)?.simLayout?.background?.fileName).toBe('site.pdf')
    expect(getProject(p.id)?.simLayout?.background?.data).toBeUndefined()
  })

  it('a save that carries the image stores everything else and keeps the image in memory', () => {
    const p = createProject({ projectName: 'Draw' })
    updateProject(p.id, { simLayout: withImage.simLayout })
    expect(persisted()).not.toContain(IMAGE)
    expect(getProject(p.id)?.simLayout?.background?.data).toBeUndefined()
    expect(getDrawingData(p.id)).toBe(IMAGE)
  })

  it('the exported revision file carries the image, and importing it restores the drawing', () => {
    const p = createProject(withImage)
    const file = exportProjectJson(p.id)!
    expect(file).toContain(IMAGE)
    const back = importProjectFromJson(file)
    expect(getDrawingData(back.id)).toBe(IMAGE)
    expect(persisted()).not.toContain(IMAGE)
  })

  it('the image is only ever paired with the drawing it came from', () => {
    const p = createProject(withImage)
    const bg = simProject.simLayout.background
    updateProject(p.id, { simLayout: { ...simProject.simLayout, background: { ...bg, scale: undefined } } })
    expect(getDrawingData(p.id)).toBe(IMAGE)                 // same drawing, other settings: kept
    updateProject(p.id, { simLayout: { ...simProject.simLayout, background: { ...bg, page: 3 } } })
    expect(getDrawingData(p.id)).toBeUndefined()             // another page of the PDF: not this image
    expect(exportProjectJson(p.id)).not.toContain(IMAGE)
    undoLastChange(p.id)                                     // back to page 2: the image belongs again
    expect(getDrawingData(p.id)).toBe(IMAGE)
    updateProject(p.id, { simLayout: { ...simProject.simLayout, background: { ...bg, fingerprint: 'other' } } })
    expect(exportProjectJson(p.id)).not.toContain(IMAGE)     // a different file
  })
})
