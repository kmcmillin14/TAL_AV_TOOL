// src/calc/sim/rng.ts — seeded RNG (mulberry32), identical to the proof of concept so seeds stay comparable. PURE.

export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
