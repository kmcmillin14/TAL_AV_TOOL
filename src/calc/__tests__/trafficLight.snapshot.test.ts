import { describe, it, expect } from 'vitest'
import { loadVehicleLibrary } from '../../lib/vehicleLibrary'
import { qualifyVehicle } from '../trafficLight'
import type { ApplicationRequirements } from '../types'

// Characterization snapshot: locks qualifyVehicle output across all 6 real
// vehicles × a matrix of representative requirements. Re-baselined 2026-07-11:
// INCOMPLETE status (no hard fails, unanswered hard gates) + temp_min/temp_max
// gates retired (Temperature Environment is the single temperature qualifier).

const base: ApplicationRequirements = {
  maxLoadWeightLbs: 0,
  typicalUnitType: '',
  transferMethod: '',
  deliveryPattern: '',
  minAisleWidthFt: 0,
}

const scenarios: Record<string, ApplicationRequirements> = {
  empty: base,
  fullPallet: {
    ...base,
    maxLoadWeightLbs: 2000,
    typicalUnitType: 'Standard Pallet',
    transferMethod: 'Fork',
    deliveryPattern: 'Floor-Floor',
    minAisleWidthFt: 10,
    loadLengthIn: 48,
    loadWidthIn: 40,
    loadHeightIn: 60,
    maxRampGrade: 5,
    certifications: ['ISO 3691-4'],
  },
  tooHeavy: { ...base, maxLoadWeightLbs: 999_999 },
  liftPattern: {
    ...base,
    deliveryPattern: 'Floor-Height',
    maxLiftHeightFt: 20,
  },
  freezerOutdoor: {
    ...base,
    outdoorRequired: true,
    freezerCapable: true,
    tempMinF: -20,
    tempMaxF: 120,
  },
  certsAndTransfer: {
    ...base,
    transferMethod: 'Conveyor',
    certifications: ['ISO 3691-4', 'Nonexistent Cert'],
  },
}

describe('qualifyVehicle characterization', () => {
  it('matches snapshot for every vehicle × scenario', async () => {
    const vehicles = await loadVehicleLibrary()
    const out: Record<string, unknown> = {}
    for (const v of vehicles) {
      for (const [name, app] of Object.entries(scenarios)) {
        out[`${v.id}__${name}`] = qualifyVehicle(v, app)
      }
    }
    expect(out).toMatchSnapshot()
  })
})
