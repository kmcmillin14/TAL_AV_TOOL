import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Category sections used to mount open (`useState(true)`) every time, so
 *  Step 4 showed every hardware line, every chip, and every adder at once on
 *  first load. Only Adders (the one elective, actionable row) should start
 *  open now — Hardware/Software/Professional Services start collapsed to
 *  their one-line headline (2026-11-02). Hardware is the one exception: it
 *  defaults open when this fleet's vehicles carry any Accessories, since
 *  those are ALSO something to act on and nesting them inside a
 *  closed-by-default section would hide them (caught in code review,
 *  2026-11-02). */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SRC = read('src/components/rom/RomQuotation.tsx')

describe('Category sections default closed except the elective one', () => {
  it('no longer hardcodes every section open', () => {
    expect(SRC).not.toContain('useState(true)')
  })

  it('open state is keyed on an explicit defaultOpen, falling back to the elective flag', () => {
    expect(SRC).toContain('useState(defaultOpen ?? elective === true)')
  })

  it('Hardware opens by default when this fleet has any accessory to pick', () => {
    expect(SRC).toContain('defaultOpen={availableAccessories.length > 0}')
  })

  it('Accessories reuse the Adders tag styling, not a new control', () => {
    expect(SRC).toContain('q-accessories')
    expect(SRC).toContain('onToggleAccessory')
  })
})
