// Deterministic vehicle-id → palette color. Red is reserved for hard-fail
// semantics elsewhere in the app, so it's not in the assignable set.
const ASSIGNABLE = [
  '#5fa8e0',  // info blue
  '#5eea90',  // good green
  '#f5b341',  // warn amber
  '#a78bfa',  // violet
  '#22d3ee',  // cyan
  '#f0875e',  // coral
] as const

export function vehicleColor(vehicleId: string): string {
  let hash = 0
  for (let i = 0; i < vehicleId.length; i++) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) | 0
  }
  return ASSIGNABLE[Math.abs(hash) % ASSIGNABLE.length]
}
