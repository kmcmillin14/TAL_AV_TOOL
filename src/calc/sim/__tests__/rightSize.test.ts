import { describe, expect, it } from 'vitest'
import { nextRightSize, RIGHT_SIZE_MAX_UP, type Tried } from '../rightSize'
import type { Verdict } from '../types'

/** Walks the search against a world where counts from `need` up pass, returning the answer and the counts run. */
function search(n: number, need: number, estimate?: number, cannotPass?: (k: number) => boolean) {
  const verdict = (k: number): Verdict => (k >= need ? 'meets' : 'short')
  const tried: Tried = { [n]: verdict(n) }
  const ran: number[] = []
  for (let i = 0; i < 50; i++) {
    const step = nextRightSize(n, tried, estimate, cannotPass)
    if ('done' in step) return { done: step.done, ran }
    ran.push(step.next); tried[step.next] = verdict(step.next)
  }
  throw new Error('no answer')
}

describe('right fleet size: the smallest count that passes all three checks', () => {
  it('steps down from a count that passes until one fails', () => {
    expect(search(6, 4)).toEqual({ done: 4, ran: [5, 4, 3] })
    expect(search(6, 6)).toEqual({ done: 6, ran: [5] })
  })
  it('does not run a count that certainly fails', () => {
    expect(search(6, 6, undefined, k => k < 6)).toEqual({ done: 6, ran: [] })
  })
  it('stops at one vehicle', () => {
    expect(search(2, 1)).toEqual({ done: 1, ran: [1] })
  })
  it('steps up from a count that fails, starting at the estimate, then confirms the one under', () => {
    expect(search(6, 8)).toEqual({ done: 8, ran: [7, 8] })
    expect(search(6, 8, 9)).toEqual({ done: 8, ran: [9, 8, 7] })
    expect(search(6, 8, 7)).toEqual({ done: 8, ran: [7, 8] })
  })
  it('gives up when nothing passes within reach, and on gridlock', () => {
    expect(search(6, 99).done).toBeNull()
    expect(search(6, 99).ran.at(-1)).toBe(6 + RIGHT_SIZE_MAX_UP)
    expect(nextRightSize(6, { 6: 'gridlock' })).toEqual({ done: null })
  })
})
