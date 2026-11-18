import { describe, expect, it } from 'vitest'
import { fleetCheck, fleetCheckSummary } from '../verification'

const run = (fleet: number, verdict: 'meets' | 'short' | 'gridlock' | 'tight' | 'warming', key = 'k') => ({ lastRun: { key, types: { cb18: { fleet, verdict } } } })

describe('fleet size verification state', () => {
  it('is Estimated with no run, and when the inputs changed since', () => {
    expect(fleetCheck('cb18', 6, undefined, 'k')).toMatchObject({ state: 'estimated', n: 6, stale: false })
    expect(fleetCheck('cb18', 6, run(6, 'meets', 'old'), 'k')).toMatchObject({ state: 'estimated', stale: true })
  })
  it('is Verified when the run met at or below the static count', () => {
    expect(fleetCheck('cb18', 6, run(6, 'meets'), 'k')).toMatchObject({ state: 'verified', n: 6 })
    expect(fleetCheck('cb18', 6, run(5, 'meets'), 'k')).toMatchObject({ state: 'verified', n: 6 })
  })
  it('suggests a higher count that met, and is Verified once it is applied', () => {
    expect(fleetCheck('cb18', 6, run(7, 'meets'), 'k')).toMatchObject({ state: 'suggested', n: 7 })
    const applied = { ...run(7, 'meets'), appliedFleet: { cb18: { fleet: 7, key: 'k' } } }
    expect(fleetCheck('cb18', 6, applied, 'k')).toMatchObject({ state: 'verified', n: 7, applied: true })
    expect(fleetCheck('cb18', 6, applied, 'new')).toMatchObject({ state: 'estimated', n: 7, applied: true, stale: true })
  })
  it('ignores an applied count the static calc has caught up with (raise-only)', () => {
    expect(fleetCheck('cb18', 8, { appliedFleet: { cb18: { fleet: 7, key: 'k' } } }, 'k')).toMatchObject({ state: 'estimated', applied: false })
  })
  it('is Not verified when the run fell short or gridlocked', () => {
    expect(fleetCheck('cb18', 6, run(6, 'short'), 'k')).toMatchObject({ state: 'notVerified', n: 6, verdict: 'short' })
    expect(fleetCheck('cb18', 6, run(6, 'gridlock'), 'k')).toMatchObject({ state: 'notVerified', verdict: 'gridlock' })
  })
  it('headline takes the worst type', () => {
    const c = (state: 'estimated' | 'verified' | 'suggested' | 'notVerified') => ({ vehicleId: 'x', staticN: 1, n: 1, applied: false, stale: false, state })
    expect(fleetCheckSummary([])).toBe('estimated')
    expect(fleetCheckSummary([c('verified'), c('verified')])).toBe('verified')
    expect(fleetCheckSummary([c('verified'), c('estimated')])).toBe('estimated')
    expect(fleetCheckSummary([c('suggested'), c('estimated')])).toBe('suggested')
    expect(fleetCheckSummary([c('suggested'), c('notVerified')])).toBe('notVerified')
  })
})
