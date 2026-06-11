import { describe, it, expect } from 'vitest'
import { TRANSFER_METHODS, TYPICAL_UNIT_TYPES, CERTIFICATIONS } from '../constants/enums'
import cb18 from '../../content/vehicles/cb18.json'
import ml2 from '../../content/vehicles/ml2.json'
import m10 from '../../content/vehicles/m10.json'
import ebase7 from '../../content/vehicles/ebase7.json'
import tb50a from '../../content/vehicles/8tb50a.json'
import hbc40a from '../../content/vehicles/8hbc40a.json'

const VEHICLES = [cb18, ml2, m10, ebase7, tb50a, hbc40a]

// The Step 2 gates do exact (case-insensitive) string matching between Step 1
// answers and vehicle JSON values. If these vocabularies drift, the matrix
// silently turns RED for every vehicle — so they are asserted here.
describe('Step 1 enums ↔ vehicle JSON vocabulary', () => {
  it('every vehicle transfer method is offered by the Step 1 dropdown', () => {
    for (const v of VEHICLES) {
      for (const tm of v.transferMethods) {
        expect(TRANSFER_METHODS as readonly string[], `${v.id}: ${tm.method}`).toContain(tm.method)
      }
    }
  })

  it('every Step 1 transfer method is supported by at least one vehicle', () => {
    const offered = new Set(VEHICLES.flatMap(v => v.transferMethods.map(tm => tm.method)))
    for (const m of TRANSFER_METHODS) {
      expect(offered.has(m), `'${m}' matches no vehicle — guaranteed all-RED option`).toBe(true)
    }
  })

  it('every vehicle payload type is offered by the Step 1 dropdown', () => {
    for (const v of VEHICLES) {
      for (const p of v.payloadTypes) {
        expect(TYPICAL_UNIT_TYPES as readonly string[], `${v.id}: ${p}`).toContain(p)
      }
    }
  })

  it('every vehicle certification uses a canonical Step 1 token', () => {
    for (const v of VEHICLES) {
      for (const c of v.specs.certifications) {
        expect(CERTIFICATIONS as readonly string[], `${v.id}: ${c}`).toContain(c)
      }
    }
  })
})
