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
  resetProjectsCache()
})

afterAll(() => {
  slot.window = originalWindow
})

// The Step 1 form saves the WHOLE form state on every keystroke. One field
// sitting outside its Zod range (e.g. shiftsPerDay 4 when the schema caps at 3)
// must not poison the save of every OTHER field — valid keys still apply.
describe('updateProject partial-save resilience', () => {
  it('applies valid fields even when a sibling field fails validation', () => {
    const p = createProject({ projectName: 'Poison test' })

    const updated = updateProject(p.id, {
      maxLoadWeightLbs: 2000,        // valid — must stick
      shiftsPerDay: 4,               // invalid (max 3) — must be skipped
    } as Parameters<typeof updateProject>[1])

    expect(updated).not.toBeNull()
    const read = getProject(p.id)!
    expect(read.maxLoadWeightLbs).toBe(2000)
    // invalid value skipped — keeps the pre-existing value (project default 1)
    expect(read.shiftsPerDay).toBe(1)
  })

  it('does not throw on an invalid patch (the form save path swallows errors)', () => {
    const p = createProject({ projectName: 'No-throw test' })
    expect(() =>
      updateProject(p.id, { hoursPerShift: 2 } as Parameters<typeof updateProject>[1]),
    ).not.toThrow()
  })

  it('still applies fully valid patches unchanged', () => {
    const p = createProject({ projectName: 'Happy path' })
    updateProject(p.id, { maxLoadWeightLbs: 1500, shiftsPerDay: 2 })
    const read = getProject(p.id)!
    expect(read.maxLoadWeightLbs).toBe(1500)
    expect(read.shiftsPerDay).toBe(2)
  })
})

describe('updateProject explicit clears (key present with undefined)', () => {
  it('clears a previously stored override', () => {
    const p = createProject({ projectName: 'Clear test' })
    updateProject(p.id, { numberOfOperators: 0 })
    expect(getProject(p.id)!.numberOfOperators).toBe(0)

    // Passing the key explicitly as undefined must REMOVE the stored value
    // (the ROI card clears the legacy total so per-shift × shifts derives).
    updateProject(p.id, { numberOfOperators: undefined, operatorsPerShift: 3 } as Parameters<typeof updateProject>[1])
    const read = getProject(p.id)!
    expect(read.numberOfOperators).toBeUndefined()
    expect(read.operatorsPerShift).toBe(3)
  })
})

describe('ROI card path — legacy project with pinned numberOfOperators: 0', () => {
  it('typing per-shift operators in the card yields a nonzero displaced total', () => {
    // Project created while the schema still pinned numberOfOperators: 0
    const p = createProject({ projectName: 'ML2 legacy', numberOfOperators: 0 })
    expect(getProject(p.id)!.numberOfOperators).toBe(0)

    // Exact patch the ROI card sends on typing "3"
    updateProject(p.id, { operatorsPerShift: 3, numberOfOperators: undefined } as Parameters<typeof updateProject>[1])
    const proj = getProject(p.id)!
    expect(proj.operatorsPerShift).toBe(3)

    // Exact derivation step4's costs memo runs (|| so pinned 0 falls through)
    const displaced = proj.numberOfOperators || ((proj.operatorsPerShift ?? 0) * (proj.shiftsPerDay ?? 1))
    expect(displaced).toBe(3)
  })

  it('even WITHOUT typing, a pinned 0 no longer masks Step 1 operators', () => {
    const p = createProject({ projectName: 'Pinned', numberOfOperators: 0, operatorsPerShift: 2, shiftsPerDay: 2 })
    const proj = getProject(p.id)!
    const displaced = proj.numberOfOperators || ((proj.operatorsPerShift ?? 0) * (proj.shiftsPerDay ?? 1))
    expect(displaced).toBe(4)
  })
})
