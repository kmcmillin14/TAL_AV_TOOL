import fs from 'fs'
import path from 'path'

const VEHICLES_DIR = path.join(process.cwd(), 'src/content/vehicles')

export interface TransferMethod {
  method: string
  loadTimeSec: number
  unloadTimeSec: number
}

export type Partnership = 'TAL Integrated' | 'TAL 3rd Party' | 'OEM' | '3rd Party'
export type NavigationType = 'natural' | 'qr' | 'magnetic' | 'lidar_slam' | 'hybrid'
export type ChargerType = 'opportunity' | 'shift_swap' | 'manual'

export interface VehicleDisplay {
  manufacturer: string
  partnership: Partnership
  tHive: boolean
  fleetSoftware: string
  heroImage: string
  typicalLoad: string
  category: string
  navigationType?: NavigationType
}

export interface VehicleCalc {
  maxWeightLbs: number
  widthFt: number
  lengthFt?: number
  heightFt?: number
  turningRadiusFt?: number
  maxLiftHeightFt: number | null
  maxLoadLengthIn?: number | null
  maxLoadWidthIn?: number | null
  maxLoadHeightIn?: number | null
  speedLoadedFps: number
  speedUnloadedFps?: number
  batteryKwh: number
  energyKwhPerFt: number
  chargeKw?: number
  chargeTimeMin?: number
  chargerType?: ChargerType
  priceRange: {
    minUsd: number
    maxUsd: number
  }
}

export interface VehicleSpecs {
  tempMinF: number
  tempMaxF: number
  outdoorCapable: boolean
  freezerCapable: boolean
  maxRampGrade: number
  certifications: string[]
}

export interface Vehicle {
  id: string
  name: string
  display: VehicleDisplay
  transferMethods: TransferMethod[]
  /** Payload categories this vehicle can carry — matched against ApplicationRequirements.typicalUnitType. */
  payloadTypes: string[]
  calc: VehicleCalc
  specs: VehicleSpecs
}

export async function loadVehicleLibrary(): Promise<Vehicle[]> {
  const files = fs.readdirSync(VEHICLES_DIR)
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const raw = fs.readFileSync(path.join(VEHICLES_DIR, f), 'utf-8')
      return JSON.parse(raw) as Vehicle
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getVehicleById(id: string): Promise<Vehicle | null> {
  const vehicles = await loadVehicleLibrary()
  return vehicles.find(v => v.id === id) || null
}
