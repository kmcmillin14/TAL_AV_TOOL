import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Nine distinct type styles in one section body, four of them within 1.5px of
 *  each other — an accumulation, not a scale. The Step 4 block now declares
 *  four steps as tokens and every rule in the block uses one of them. */
const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
// Slice the WHOLE Step 4 block. `.q-headline` and `.q-status` sit above the
// ledger comment, so slicing from there would let 7 literal font-sizes survive
// a passing test — caught in self-review, 2026-10-09.
const BLOCK = CSS.slice(
  CSS.indexOf('/* ── Step 4 · ROM Configuration'),
  CSS.indexOf('/* Price drivers (section 02) */'),
)

describe('Step 4 type scale', () => {
  it('declares exactly four steps', () => {
    for (const t of ['--q-type-hero', '--q-type-figure', '--q-type-body', '--q-type-label']) {
      expect(BLOCK, t).toContain(t)
    }
  })

  it('every font-size in the block comes from a token', () => {
    // NB: /font-size:\s*(?!var\()/ does NOT work — \s* backtracks to zero and
    // the lookahead then passes on " var(". Capture the value and test it.
    const literals = [...BLOCK.matchAll(/font-size:\s*([^;]+);/g)]
      .map(m => m[1].trim())
      .filter(v => !v.startsWith('var('))
    expect(literals).toEqual([])
  })

  it('the tokens are declared before the first rule that uses them', () => {
    expect(BLOCK.indexOf('--q-type-hero')).toBeLessThan(BLOCK.indexOf('.q-headline-amount'))
  })
})
