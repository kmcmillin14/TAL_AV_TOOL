import { describe, expect, it } from 'vitest'
import { suggestedChargers } from '../../fleet'
import { fleetCheck, fleetCheckLabel, fleetCheckSummary } from '../verification'

const run = (fleet: number, verdict: 'meets' | 'short' | 'gridlock' | 'tight' | 'warming', key = 'k', smallest?: boolean) => ({ lastRun: { key, types: { cb18: { fleet, verdict, ...(smallest != null ? { smallest } : {}) } } } })

describe('fleet size verification state', () => {
  it('is Estimated with no run, and when the inputs changed since', () => {
    expect(fleetCheck('cb18', 6, undefined, 'k')).toMatchObject({ state: 'estimated', n: 6, stale: false })
    expect(fleetCheck('cb18', 6, run(6, 'meets', 'old'), 'k')).toMatchObject({ state: 'estimated', stale: true })
  })
  it('is Verified when the run met at or below the static count', () => {
    expect(fleetCheck('cb18', 6, run(6, 'meets'), 'k')).toMatchObject({ state: 'verified', n: 6 })
    expect(fleetCheck('cb18', 6, run(5, 'meets'), 'k')).toMatchObject({ state: 'verified', n: 6 })
  })
  it('suggests a higher count that met — confirmed only when one fewer was run and fails — and is Verified once applied', () => {
    expect(fleetCheck('cb18', 6, run(7, 'meets'), 'k')).toMatchObject({ state: 'suggested', n: 7, confirmed: false })
    expect(fleetCheck('cb18', 6, run(7, 'meets', 'k', true), 'k')).toMatchObject({ state: 'suggested', n: 7, confirmed: true })
    const applied = { ...run(7, 'meets'), appliedFleet: { cb18: { fleet: 7, key: 'k' } } }
    expect(fleetCheck('cb18', 6, applied, 'k')).toMatchObject({ state: 'verified', n: 7, applied: true })
    expect(fleetCheck('cb18', 6, applied, 'new')).toMatchObject({ state: 'estimated', n: 7, applied: true, stale: true })
  })
  it('ignores an applied count the static calc has caught up with (raise-only)', () => {
    expect(fleetCheck('cb18', 8, { appliedFleet: { cb18: { fleet: 7, key: 'k' } } }, 'k')).toMatchObject({ state: 'estimated', applied: false, dormant: 7 })
  })
  it('is Not verified when the run fell short or gridlocked', () => {
    expect(fleetCheck('cb18', 6, run(6, 'short'), 'k')).toMatchObject({ state: 'notVerified', n: 6, verdict: 'short' })
    expect(fleetCheck('cb18', 6, run(6, 'gridlock'), 'k')).toMatchObject({ state: 'notVerified', verdict: 'gridlock' })
  })
  it('a run at another count says only what it can', () => {
    // Met with fewer: the static count is verified, and the detail names the count run.
    expect(fleetCheck('cb18', 6, run(5, 'meets'), 'k')).toMatchObject({ state: 'verified', n: 6, ranAt: 5 })
    // Failed with fewer: says nothing of the static count.
    expect(fleetCheck('cb18', 6, run(4, 'short'), 'k')).toMatchObject({ state: 'estimated', ranAt: 4, verdict: 'short' })
    // Failed with more: the static count cannot do it either.
    expect(fleetCheck('cb18', 6, run(8, 'gridlock'), 'k')).toMatchObject({ state: 'notVerified', n: 8 })
    // Too short to judge.
    expect(fleetCheck('cb18', 6, run(6, 'warming'), 'k')).toMatchObject({ state: 'estimated', verdict: 'warming' })
  })
  it('headline takes the worst type', () => {
    const c = (state: 'estimated' | 'verified' | 'suggested' | 'notVerified') => ({ vehicleId: 'x', staticN: 1, n: 1, applied: false, stale: false, state })
    expect(fleetCheckSummary([])).toBe('estimated')
    expect(fleetCheckSummary([c('verified'), c('verified')])).toBe('verified')
    expect(fleetCheckSummary([c('verified'), c('estimated')])).toBe('estimated')
    expect(fleetCheckSummary([c('suggested'), c('estimated')])).toBe('suggested')
    expect(fleetCheckSummary([c('suggested'), c('notVerified')])).toBe('notVerified')
  })
  it('suggests the chargers the static model has busy at once, at least one', () => {
    const g = (fleetSold: number, availability?: number) => ({ fleetSold, charging: { availability } }) as never
    expect(suggestedChargers({ groups: [] })).toBe(1)
    expect(suggestedChargers({ groups: [g(6, 1)] })).toBe(1)
    expect(suggestedChargers({ groups: [g(6, 0.7)] })).toBe(2)          // 1.8 on charge
    expect(suggestedChargers({ groups: [g(6, 0.7), g(4, 0.5)] })).toBe(4) // 1.8 + 2
  })
  it('labels one type by its own state, several by the worst', () => {
    expect(fleetCheckLabel([{ state: 'suggested', n: 7 }])).toBe('Suggested 7')
    expect(fleetCheckLabel([{ state: 'suggested', n: 7 }, { state: 'verified', n: 3 }])).toBe('Suggested')
    expect(fleetCheckLabel([{ state: 'verified', n: 6 }])).toBe('Verified')
  })
})
