import { describe, expect, it } from 'vitest'
import { toCsv } from '../csv'

describe('toCsv', () => {
  it('joins rows and quotes only what needs it', () => {
    expect(toCsv([['Flow', 'Moves/h'], ['Line 1 → Wrapper', 24], ['A, B', 'say "hi"'], [null, undefined]]))
      .toBe('Flow,Moves/h\r\nLine 1 → Wrapper,24\r\n"A, B","say ""hi"""\r\n,')
  })
})
