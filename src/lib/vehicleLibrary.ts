import fs from 'fs'
import path from 'path'

const VEHICLES_DIR = path.join(process.cwd(), 'src/content/vehicles')

export interface TransferMethod {
  method: string
  loadTimeSec: number
  unloadTimeSec: number
}

export interface Vehicle {
  id: string
  name: string
  display: {
    manufacturer: string
    partnership: 'TAL Integrated' | 'TAL 3rd Party' | 'OEM' | '3rd Party'
    tHive: boolean
    fleetSoftware: string
    heroImage: string
    typicalLoad: string
    category: string
  }
  transferMethods: TransferMethod[]
  calc: {
    maxWeightLbs: number
    widthFt: number
    maxLiftHeightFt: number
    speedLoadedFps: number
    batteryKwh: number
    energyKwhPerFt: number
    priceRange: {
      minUsd: number
      maxUsd: number
    }
  }
  specs: {
    tempMinF: number
    tempMaxF: number
    outdoorCapable: boolean
    freezerCapable: boolean
    maxRampGrade: number
    certifications: string[]
  }
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
