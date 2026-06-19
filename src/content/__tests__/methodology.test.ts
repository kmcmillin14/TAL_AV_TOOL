import { describe, it, expect } from 'vitest'
import { METHODOLOGY } from '../methodology'

describe('methodology content', () => {
  it('covers the six calc stages in order', () => {
    expect(METHODOLOGY.map(t => t.id)).toEqual(['cycle', 'demand', 'charging', 'buffer', 'payback', 'opex'])
  })

  it('every topic has a numbered title, a formula, defined variables, and a why', () => {
    for (const t of METHODOLOGY) {
      expect(t.num).toMatch(/^\d\d$/)
      expect(t.title.trim().length).toBeGreaterThan(0)
      expect(t.formula).toContain('=')
      expect(t.variables.length).toBeGreaterThan(0)
      expect(t.why.trim().length).toBeGreaterThan(40)   // a real explanation, not a stub
      for (const v of t.variables) {
        expect(v.sym.trim().length).toBeGreaterThan(0)
        expect(v.name.trim().length).toBeGreaterThan(0)
        expect(v.def.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
