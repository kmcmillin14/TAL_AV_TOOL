import { describe, it, expect } from 'vitest'
import { effectivePalletEntryType } from '../palletEntry'

describe('effectivePalletEntryType', () => {
  it('uses an explicit answer', () => {
    expect(effectivePalletEntryType({ palletEntryType: 'block' })).toBe('block')
    expect(effectivePalletEntryType({ palletEntryType: 'not_sure' })).toBe('not_sure')
  })

  it('falls back to the retired palletHasStringer toggle', () => {
    expect(effectivePalletEntryType({ palletHasStringer: true })).toBe('stringer')
    expect(effectivePalletEntryType({ palletHasStringer: false })).toBe('block')
  })

  it('never lets the retired toggle override an explicit answer', () => {
    expect(effectivePalletEntryType({ palletEntryType: 'block', palletHasStringer: true })).toBe('block')
  })

  it('stays undefined when unanswered, so the soft gate skips', () => {
    expect(effectivePalletEntryType({})).toBeUndefined()
  })
})
