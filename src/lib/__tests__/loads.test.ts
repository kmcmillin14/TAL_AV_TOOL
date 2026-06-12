import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createProject, getProject, updateProject, resetProjectsCache } from '../storage'
import { effectiveLoads, appRequirementsFromProject } from '../appRequirements'
import { cleanFormData } from '../../components/step1/ApplicationForm'
import type { ProjectFormData } from '../validations/schemas'

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

describe('loads round-trip (matrix-only model)', () => {
  it('persists loads through create + update + read and maps them for the calc engine', () => {
    const p = createProject({ projectName: 'Loads test' })
    updateProject(p.id, {
      loads: [
        { id: 'l1', unitType: 'Standard Pallet', lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 2000 },
        { id: 'l2', unitType: 'Tote', lengthIn: 24, widthIn: 16, heightIn: 14, weightLbs: 50 },
      ],
    })
    const read = getProject(p.id)!
    expect(read.loads).toHaveLength(2)
    const specs = effectiveLoads(read)
    expect(specs.map(l => l.loadId)).toEqual(['l1', 'l2'])
    expect(appRequirementsFromProject(read).loads).toHaveLength(2)
  })

  it('legacy project without loads → empty LoadSpec list (calc falls back to singular fields)', () => {
    const p = createProject({ projectName: 'Legacy', typicalUnitType: 'Cart', maxLoadWeightLbs: 800 })
    const read = getProject(p.id)!
    expect(effectiveLoads(read)).toEqual([])
    // the singular fields still reach the engine
    expect(appRequirementsFromProject(read).typicalUnitType).toBe('Cart')
  })
})

describe('cleanFormData — nested row cleaning', () => {
  it('maps a mid-edit NaN inside flows and loads rows to undefined (Zod default fills it)', () => {
    const cleaned = cleanFormData({
      flows: [{ id: 'f1', origin: 'A', destination: 'B', distanceFt: NaN, thruPerHr: 30, routeLayout: 'medium', liftHeightFt: 0 }],
      loads: [{ id: 'l1', unitType: 'Tote', lengthIn: NaN }],
    } as Partial<ProjectFormData>)
    expect(cleaned.flows![0].distanceFt).toBeUndefined()
    expect(cleaned.flows![0].thruPerHr).toBe(30)
    expect(cleaned.loads![0].lengthIn).toBeUndefined()
    expect(cleaned.loads![0].unitType).toBe('Tote')
  })
})
