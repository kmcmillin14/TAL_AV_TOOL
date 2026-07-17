import { describe, it, expect } from 'vitest'
import { palletLoadPatch } from '../../components/step1/ApplicationForm'

// Regression guard for the metric-mode corruption bug: pallet auto-fill must write
// the dimensions as RAW imperial inches. A conversion here (the old setValue path
// re-parsed 48 as mm → 48/25.4 = 1.8897…) is exactly what this locks out.

type Load = { id: string; unitType: string; palletSubtype?: string; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }

const row = (over: Partial<Load> = {}): Load => ({ id: 'l1', unitType: 'Standard Pallet', ...over })

describe('palletLoadPatch — imperial-first pallet dimensions', () => {
  it('writes GMA dims as exact inches (never a metric-converted float)', () => {
    const out = palletLoadPatch([row()], 0, 'GMA (48×40)')!
    expect(out[0].lengthIn).toBe(48)
    expect(out[0].widthIn).toBe(40)
    expect(out[0].heightIn).toBe(5.7)
    // Explicitly reject the corruption signature (48 / 25.4).
    expect(out[0].lengthIn).not.toBeCloseTo(48 / 25.4, 3)
  })

  it('matches Euro and CHEP standards', () => {
    expect(palletLoadPatch([row()], 0, 'Euro (47.2×31.5)')![0]).toMatchObject({ lengthIn: 47.2, widthIn: 31.5, heightIn: 5.7 })
    expect(palletLoadPatch([row()], 0, 'CHEP (45.9×45.9)')![0]).toMatchObject({ lengthIn: 45.9, widthIn: 45.9, heightIn: 5.9 })
  })

  it('preserves the row’s other fields and patches only the picked index', () => {
    const loads = [row({ id: 'a', palletSubtype: 'GMA (48×40)' }), row({ id: 'b', lengthIn: 99 })]
    const out = palletLoadPatch(loads, 0, 'GMA (48×40)')!
    expect(out[0]).toMatchObject({ id: 'a', unitType: 'Standard Pallet', palletSubtype: 'GMA (48×40)', lengthIn: 48 })
    expect(out[1]).toBe(loads[1])   // untouched row kept by reference
  })

  it('returns null for Custom (no standard dims) and for a missing row', () => {
    expect(palletLoadPatch([row()], 0, 'Custom')).toBeNull()
    expect(palletLoadPatch([row()], 3, 'GMA (48×40)')).toBeNull()
  })

  it('does not mutate the input array', () => {
    const loads = [row()]
    const out = palletLoadPatch(loads, 0, 'GMA (48×40)')!
    expect(out).not.toBe(loads)
    expect(loads[0].lengthIn).toBeUndefined()   // original untouched
  })
})
