import { loadVehicleLibrary } from '@/src/lib/vehicleLibrary'

export async function GET() {
  try {
    const vehicles = await loadVehicleLibrary()
    return Response.json(vehicles)
  } catch (err) {
    console.error('GET /api/vehicles error:', err)
    return Response.json({ error: 'Failed to load vehicles' }, { status: 500 })
  }
}
