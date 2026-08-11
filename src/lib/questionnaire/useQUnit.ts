'use client'
import { useState, useCallback, useEffect } from 'react'

export type QUnitSystem = 'imperial' | 'metric'
const Q_UNIT_KEY = 'tal:q-unit'
const Q_UNIT_EVENT = 'tal:q-unit-change'

function readStored(): QUnitSystem {
  try { return localStorage.getItem(Q_UNIT_KEY) === 'metric' ? 'metric' : 'imperial' } catch { return 'imperial' }
}

export function useQUnit() {
  const [unit, setUnitRaw] = useState<QUnitSystem>(readStored)

  // Listen for changes from other hook instances in the same window.
  useEffect(() => {
    const handler = () => setUnitRaw(readStored())
    window.addEventListener(Q_UNIT_EVENT, handler)
    return () => window.removeEventListener(Q_UNIT_EVENT, handler)
  }, [])

  const setUnit = useCallback((u: QUnitSystem) => {
    try { localStorage.setItem(Q_UNIT_KEY, u) } catch { /* quota */ }
    window.dispatchEvent(new Event(Q_UNIT_EVENT))
  }, [])

  return { unit, setUnit, isMetric: unit === 'metric' }
}

// Conversion helpers — storage is always imperial.
export const lbsToKg  = (lbs: number) => lbs * 0.453592
export const kgToLbs  = (kg: number)  => kg  / 0.453592
export const inToCm   = (i: number)   => i   * 2.54
export const cmToIn   = (cm: number)  => cm  / 2.54
export const ftToM    = (ft: number)  => ft  * 0.3048
export const mToFt    = (m: number)   => m   / 0.3048
export const sqftToM2 = (sf: number)  => sf  * 0.092903
export const m2ToSqft = (m2: number)  => m2  / 0.092903
export const fToC     = (f: number)   => (f - 32) * 5 / 9
export const cToF     = (c: number)   => c * 9 / 5 + 32
