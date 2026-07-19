/**
 * Transfer-type ↔ vehicle coherence tests.
 *
 * (a) Satisfiability: every Step 1 transfer type (TRANSFER_TYPE_SPEC key) is
 *     reachable by at least one library vehicle so the engineer never gets an
 *     all-RED matrix for a valid requirement.
 *
 * (b) Coherence: every vehicle whose transferMethods include "Pin" or
 *     "Powered Conveyor Cart" must also carry towsCarts === true.
 *     This is the exact drift that made ML2 unreachable as a tugger:
 *     ML2 had "Pin" in its transferMethods but no towsCarts flag, so the
 *     tow_cart gate (which reads ONLY towsCarts) silently returned RED.
 *
 * (c) Completeness: every vehicle with towsCarts === true must declare a
 *     non-empty cartPayloads array so the payload gate can match unit types
 *     against the towed carts.
 *
 * Import style mirrors enumAlignment.test.ts (direct JSON imports, no async
 * loadVehicleLibrary, so the test is pure and fast).
 */

import { describe, it, expect } from 'vitest'
import { TRANSFER_TYPE_SPEC } from '../gates'
import { qualifyVehicle } from '../trafficLight'
import type { ApplicationRequirements } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import cb18 from '../../content/vehicles/cb18.json'
import ml2 from '../../content/vehicles/ml2.json'
import m10 from '../../content/vehicles/m10.json'
import ebase7 from '../../content/vehicles/ebase7.json'
import tb50a from '../../content/vehicles/8tb50a.json'
import hbc40a from '../../content/vehicles/8hbc40a.json'

// Lightweight local type so we can access optional tow fields without casting everywhere.
interface VehicleShape {
  id: string
  transferMethods: { method: string }[]
  towsCarts?: boolean
  cartPayloads?: string[]
}

const VEHICLES: VehicleShape[] = [cb18, ml2, m10, ebase7, tb50a, hbc40a]

// Methods that imply tow-cart capability (the pin mechanism connects a tugger
// to a cart; "Powered Conveyor Cart" likewise acts on a towed cart).
const TOW_IMPLYING_METHODS = ['Pin', 'Powered Conveyor Cart']

describe('transfer-type ↔ vehicle library coherence', () => {
  // ── (a) Satisfiability ─────────────────────────────────────────────────────
  describe('(a) every TRANSFER_TYPE_SPEC key is satisfiable by ≥1 library vehicle', () => {
    for (const [transferType, spec] of Object.entries(TRANSFER_TYPE_SPEC)) {
      it(`'${transferType}' (${spec.label}) is reachable`, () => {
        let satisfiable: boolean

        if (spec.tow) {
          // tow_cart → at least one vehicle must have towsCarts === true
          satisfiable = VEHICLES.some(v => v.towsCarts === true)
        } else {
          // method-based → at least one vehicle must include the required method
          const requiredMethod = spec.method!
          satisfiable = VEHICLES.some(v =>
            v.transferMethods.some(
              tm => tm.method.toLowerCase() === requiredMethod.toLowerCase(),
            ),
          )
        }

        expect(
          satisfiable,
          `No vehicle satisfies transferType '${transferType}' — this option will always produce all-RED results`,
        ).toBe(true)
      })
    }
  })

  // ── (b) Coherence: Pin / Powered Conveyor Cart ↔ towsCarts ────────────────
  describe('(b) every vehicle with a tow-implying method has towsCarts === true', () => {
    for (const v of VEHICLES) {
      const towImplyingMethods = v.transferMethods
        .map(tm => tm.method)
        .filter(m => TOW_IMPLYING_METHODS.includes(m))

      if (towImplyingMethods.length === 0) continue

      it(`${v.id} has towImplying methods [${towImplyingMethods.join(', ')}] → towsCarts must be true`, () => {
        expect(
          v.towsCarts,
          [
            `${v.id} has transfer method(s) [${towImplyingMethods.join(', ')}] but towsCarts is not true.`,
            `This is the ML2/E7 drift: the tow_cart gate reads ONLY vehicle.towsCarts,`,
            `never the method list — so the vehicle is silently unreachable as a tugger.`,
          ].join(' '),
        ).toBe(true)
      })
    }
  })

  // ── (d) Functional: the three pin-tuggers actually PASS the tow gates ─────
  // Owner-confirmed 2026-07-19: ML2, M10, and E7 can all pin-tow carts. This
  // exercises the real gate path (not just data shape): a tow_cart requirement
  // moving Totes must pass both the transfer and payload gates on all three.
  describe('(d) ml2 / m10 / ebase7 qualify for a tow-cart tote application', () => {
    const towApp = {
      typicalUnitType: 'Tote',
      transferType: 'tow_cart',
      transferMethod: '',
      deliveryPattern: '',
      minAisleWidthFt: 0,
      maxLoadWeightLbs: 0,
    } as unknown as ApplicationRequirements

    for (const v of [ml2, m10, ebase7]) {
      it(`${v.id} passes transfer_method and payload_type via pin-tow`, () => {
        const r = qualifyVehicle(v as unknown as Vehicle, towApp)
        const all = [...r.hardGates, ...r.softPreferences]
        const transfer = all.find(g => g.gateId === 'transfer_method')
        const payload = all.find(g => g.gateId === 'payload_type')
        expect(transfer?.passed, `${v.id} transfer gate: ${transfer?.reason}`).toBe(true)
        expect(payload?.passed, `${v.id} payload gate: ${payload?.reason}`).toBe(true)
      })
    }
  })

  // ── (c) Completeness: towsCarts → non-empty cartPayloads ──────────────────
  describe('(c) every vehicle with towsCarts === true has a non-empty cartPayloads array', () => {
    for (const v of VEHICLES) {
      if (!v.towsCarts) continue

      it(`${v.id} (towsCarts) must declare cartPayloads`, () => {
        expect(
          Array.isArray(v.cartPayloads) && v.cartPayloads.length > 0,
          `${v.id} has towsCarts=true but cartPayloads is empty or missing — payload gate cannot match unit types via the cart`,
        ).toBe(true)
      })
    }
  })
})
