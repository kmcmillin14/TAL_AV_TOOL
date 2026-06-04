// Deterministic section-name → color. Mirrors vehicleColor's hashing and
// palette discipline. TAL red is reserved for accent semantics elsewhere
// and is excluded from the assignable set. Color-blind-safe choices.

const ASSIGNABLE = [
  '#5fa8e0',  // info blue
  '#5eea90',  // good green
  '#f5b341',  // warn amber
  '#a78bfa',  // violet
  '#22d3ee',  // cyan
  '#f0875e',  // coral
] as const

/** The curated, color-blind-safe palette a user can pick a group color from.
 *  Same set the hash assigns by default; TAL red stays reserved for accent. */
export const GROUP_PALETTE: readonly string[] = ASSIGNABLE

export function sectionColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return ASSIGNABLE[Math.abs(hash) % ASSIGNABLE.length]
}
