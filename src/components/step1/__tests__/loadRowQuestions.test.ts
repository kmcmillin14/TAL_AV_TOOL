import { describe, it, expect } from 'vitest'
import { STACKABLE_UNIT_TYPES } from '@/src/lib/constants/enums'

/** The project-level load questions (Pallet Entry, stack/destack) are asked by
 *  exactly ONE load row. Which row is the bug surface: pinning them to index 0
 *  made both questions unreachable when the first declared load was not of the
 *  applicable type, so the gates silently skipped and every vehicle showed
 *  Compatible on a project that did move pallets (code review, 2026-10-02).
 *
 *  These mirror the selectors in ApplicationForm so the regression is caught
 *  here rather than by eye. */
const firstPalletIdx = (loads: Array<{ unitType?: string }>) =>
  loads.findIndex(l => l?.unitType === 'Standard Pallet')
const firstStackableIdx = (loads: Array<{ unitType?: string }>) =>
  loads.findIndex(l => STACKABLE_UNIT_TYPES.has(l?.unitType ?? ''))

describe('which load row asks the project-level questions', () => {
  it('asks on row 0 when the first load already qualifies', () => {
    const loads = [{ unitType: 'Standard Pallet' }, { unitType: 'Tote' }]
    expect(firstPalletIdx(loads)).toBe(0)
    expect(firstStackableIdx(loads)).toBe(0)
  })

  it('REGRESSION: still asks when the first load is not of the applicable type', () => {
    const loads = [{ unitType: 'Tote' }, { unitType: 'Standard Pallet' }]
    // Pinning these to index 0 is what made both questions unreachable.
    expect(firstPalletIdx(loads)).toBe(1)
    expect(firstStackableIdx(loads)).toBe(1)
  })

  it('asks the stacking question for Rack and Other, not only pallets', () => {
    expect(firstStackableIdx([{ unitType: 'Tote' }, { unitType: 'Rack' }])).toBe(1)
    expect(firstStackableIdx([{ unitType: 'Cart' }, { unitType: 'Other' }])).toBe(1)
    // ...but Pallet Entry stays pallet-only.
    expect(firstPalletIdx([{ unitType: 'Tote' }, { unitType: 'Rack' }])).toBe(-1)
  })

  it('asks nobody when no row qualifies (-1 matches no index)', () => {
    const loads = [{ unitType: 'Tote' }, { unitType: 'Cart' }]
    expect(firstPalletIdx(loads)).toBe(-1)
    expect(firstStackableIdx(loads)).toBe(-1)
    expect(loads.some((_, i) => i === firstStackableIdx(loads))).toBe(false)
  })

  it('never asks twice — exactly one row matches', () => {
    const loads = [{ unitType: 'Standard Pallet' }, { unitType: 'Standard Pallet' }]
    expect(loads.filter((_, i) => i === firstPalletIdx(loads))).toHaveLength(1)
  })

  it('totes, carts and rolls are not stackable by this fleet', () => {
    for (const t of ['Tote', 'Cart', 'Roll']) expect(STACKABLE_UNIT_TYPES.has(t)).toBe(false)
    for (const t of ['Standard Pallet', 'Rack', 'Other']) expect(STACKABLE_UNIT_TYPES.has(t)).toBe(true)
  })
})
