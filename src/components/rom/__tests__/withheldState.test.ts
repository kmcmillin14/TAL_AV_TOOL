import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A withheld category rendered $0 in --text-disabled (#a1a1aa, 2.3:1 on the
 *  light surface), so a refusal to price read as an amount that happened to be
 *  zero. It now says the word, and the row carries a visible mark. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SRC = read('src/components/rom/RomQuotation.tsx')
const CSS = read('app/globals.css')

describe('a withheld section says so', () => {
  it('renders the words, not just a dimmed zero', () => {
    expect(SRC).toContain('Not priced')
    expect(SRC).toContain('q-sec-withheld-tag')
  })

  it('the tag is styled on the bad token, not the disabled one', () => {
    const rule = CSS.slice(CSS.indexOf('.q-sec-withheld-tag'))
    expect(rule.slice(0, 320)).toContain('var(--bad)')
  })
})
