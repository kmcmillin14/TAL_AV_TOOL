import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATES } from '../gates'

/** The Active Requirements strip shortens each gate's name so nine live gates
 *  fit one line — the full names are written for the compatibility matrix,
 *  where there is room, and ran to 1,870px in a 1,536px row.
 *
 *  The map is keyed by gate id with a fallback to the full name, so a gate
 *  added later degrades rather than disappearing. This asserts no gate is
 *  currently relying on that fallback. */
const SRC = readFileSync(join(process.cwd(), 'app/projects/[id]/step2/page.tsx'), 'utf8')
const MAP = SRC.slice(SRC.indexOf('const REQ_SHORT'), SRC.indexOf('}', SRC.indexOf('const REQ_SHORT')))

describe('Active Requirements short names', () => {
  it('every gate in the registry has one', () => {
    for (const g of GATES) expect(MAP, g.id).toContain(`${g.id}:`)
  })

  it('each is genuinely shorter than the gate name it replaces', () => {
    for (const g of GATES) {
      const m = MAP.match(new RegExp(`${g.id}:\\s*'([^']+)'`))
      expect(m, g.id).not.toBeNull()
      expect(m![1].length, `${g.id} "${m![1]}" vs "${g.name}"`).toBeLessThanOrEqual(g.name.length)
    }
  })

  it('the strip can never wrap to a second line', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const rule = css.slice(css.indexOf('.req-summary {'), css.indexOf('.req-summary-label'))
    expect(rule).toContain('flex-wrap: nowrap')
    expect(rule).toContain('overflow-x: auto')
  })
})
