import type { Vehicle } from './vehicleLibrary'

// Module-level promise cache. The vehicle library is static JSON served by
// /api/vehicles — refetching on every Step 2 mount was the main visible
// "lag" the user reported when navigating between steps. One fetch per
// session is enough; on error we null out so the next caller can retry.
let cachedPromise: Promise<Vehicle[]> | null = null

export function fetchVehiclesCached(): Promise<Vehicle[]> {
  if (cachedPromise) return cachedPromise
  cachedPromise = fetch('/api/vehicles')
    .then(r => r.json())
    .then(v => (Array.isArray(v) ? (v as Vehicle[]) : []))
    .catch(err => {
      cachedPromise = null
      throw err
    })
  return cachedPromise
}

/** Warm the cache without awaiting — fire-and-forget on app mount. */
export function prefetchVehicles(): void {
  void fetchVehiclesCached().catch(() => {})
}
