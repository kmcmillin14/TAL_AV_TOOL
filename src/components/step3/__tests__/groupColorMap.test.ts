import { describe, it, expect } from 'vitest'
import { groupColorMap, GROUP_PALETTE } from '../sectionColor'

describe('groupColorMap — distinct colours by position', () => {
  it('gives adjacent groups different colours (name-hash could collide)', () => {
    const map = groupColorMap(['Group 1', 'Group 2', 'Group 3'])
    expect(map['Group 1']).not.toBe(map['Group 2'])
    expect(map['Group 2']).not.toBe(map['Group 3'])
    expect(map['Group 1']).not.toBe(map['Group 3'])
  })

  it('assigns from the shared palette in order', () => {
    const map = groupColorMap(['a', 'b', 'c'])
    expect(map['a']).toBe(GROUP_PALETTE[0])
    expect(map['b']).toBe(GROUP_PALETTE[1])
    expect(map['c']).toBe(GROUP_PALETTE[2])
  })

  it('an explicit override always wins', () => {
    const map = groupColorMap(['a', 'b'], { b: '#123456' })
    expect(map['a']).toBe(GROUP_PALETTE[0])
    expect(map['b']).toBe('#123456')
  })

  it('wraps the palette past its length (no crash, still deterministic)', () => {
    const many = Array.from({ length: GROUP_PALETTE.length + 2 }, (_, i) => `g${i}`)
    const map = groupColorMap(many)
    expect(map[`g${GROUP_PALETTE.length}`]).toBe(GROUP_PALETTE[0])
    expect(Object.keys(map)).toHaveLength(many.length)
  })
})
