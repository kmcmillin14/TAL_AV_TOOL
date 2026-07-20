import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importProjectFromJson, resetProjectsCache } from '../storage'

// Guards the team-exercise sample: it must always import cleanly through Step 00
// so onboarding never hits a broken example.
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
    },
  }
  resetProjectsCache()
})
afterAll(() => { slot.window = originalWindow })

const SAMPLE = readFileSync(resolve(__dirname, '../../content/samples/michelin-questionnaire.json'), 'utf8')

describe('Michelin exercise sample', () => {
  it('imports cleanly via importProjectFromJson with key fields intact', () => {
    const p = importProjectFromJson(SAMPLE)
    expect(p.id).toBeTruthy()
    expect(p.customerName).toBe('Michelin North America')
    expect(p.transferType).toBe('forklift')
    expect(p.flows).toHaveLength(1)
    expect(p.flows?.[0]?.origin).toBe('Inbound Trailer')
    expect(p.flows?.[0]?.destination).toBe('Reserve Rack')
    expect(p.vehiclesOfInterest).toEqual(['cb18'])
    expect(p.shiftsPerDay).toBe(3)
    expect(p.specialtyApplications).toContain('Trailer unloading')
  })
})
