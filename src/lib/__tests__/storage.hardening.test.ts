import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  createProject, updateProject, getProject, resetProjectsCache,
  mergeProjects, subscribeStorageError, importProjectFromJson, type StoredProject,
} from '../storage'
import { partialProjectSchema } from '../validations/schemas'

type WindowSlot = { window?: unknown }
const slot = globalThis as WindowSlot
const originalWindow = slot.window

function shim(setItem?: (k: string, v: string) => void) {
  const store = new Map<string, string>()
  slot.window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: setItem ?? ((k: string, v: string) => { store.set(k, v) }),
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    },
  }
  return store
}

beforeEach(() => { shim(); resetProjectsCache() })
afterAll(() => { slot.window = originalWindow })

const proj = (id: string, updatedAt: string, name: string): StoredProject =>
  ({ id, updatedAt, projectName: name } as StoredProject)

describe('mergeProjects — per-project reconciliation (cross-tab)', () => {
  it('keeps both tabs’ edits to DIFFERENT projects (no whole-array clobber)', () => {
    const local = [proj('a', '2026-01-02', 'A-local')]            // this tab edited A
    const disk = [proj('a', '2026-01-01', 'A-old'), proj('b', '2026-01-03', 'B-other')] // other tab added B
    const merged = mergeProjects(local, disk)
    expect(merged.find(p => p.id === 'a')?.projectName).toBe('A-local') // ours is newer
    expect(merged.find(p => p.id === 'b')?.projectName).toBe('B-other') // other tab's survives
    expect(merged).toHaveLength(2)
  })

  it('disk wins when its copy is newer', () => {
    const merged = mergeProjects([proj('a', '2026-01-01', 'old')], [proj('a', '2026-02-01', 'new')])
    expect(merged.find(p => p.id === 'a')?.projectName).toBe('new')
  })
})

describe('flush — failed disk write is surfaced, not silent', () => {
  it('fires subscribeStorageError and keeps the in-memory copy on quota error', () => {
    vi.useFakeTimers()
    let fail = false
    shim((k, v) => { if (fail) { const e = new Error('exceeded quota'); e.name = 'QuotaExceededError'; throw e } void k; void v })
    resetProjectsCache()
    const errors: string[] = []
    const unsub = subscribeStorageError(m => errors.push(m))
    const p = createProject({ projectName: 'A' })
    fail = true
    updateProject(p.id, { projectName: 'B' })
    vi.runOnlyPendingTimers()           // debounced flush fires → setItem throws
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/not saved/i)
    expect(getProject(p.id)?.projectName).toBe('B')  // still live in memory
    unsub(); vi.useRealTimers()
  })
})

describe('importProjectFromJson — bounds & version guards', () => {
  it('rejects an oversized payload before parsing', () => {
    const huge = '{"x":"' + 'a'.repeat(8_000_001) + '"}'
    expect(() => importProjectFromJson(huge)).toThrow(/too large/i)
  })

  it('rejects a non-integer / out-of-range schemaVersion', () => {
    expect(() => importProjectFromJson(JSON.stringify({ schemaVersion: 1.5, project: {} }))).toThrow(/not a valid/i)
    expect(() => importProjectFromJson(JSON.stringify({ schemaVersion: 0, project: {} }))).toThrow(/not a valid/i)
  })

  it('still imports a valid wrapped envelope', () => {
    const imported = importProjectFromJson(JSON.stringify({ schemaVersion: 1, project: { projectName: 'OK' } }))
    expect(imported.projectName).toBe('OK')
    expect(imported.id).toBeTruthy()
  })
})

describe('schema array bounds (DoS guard)', () => {
  it('rejects an over-cap flows array', () => {
    const flows = Array.from({ length: 501 }, (_, i) => ({ id: `f${i}` }))
    expect(partialProjectSchema.safeParse({ flows }).success).toBe(false)
    expect(partialProjectSchema.safeParse({ flows: flows.slice(0, 10) }).success).toBe(true)
  })

  it('rejects an over-cap certifications array', () => {
    expect(partialProjectSchema.safeParse({ certifications: Array(51).fill('X') }).success).toBe(false)
  })
})
