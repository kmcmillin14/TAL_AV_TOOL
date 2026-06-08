'use client'

import { useCallback, useEffect, useState } from 'react'
import type { UnitSystem } from './utils/units'

const UNIT_KEY = 'tal:unitSystem'
const THEME_KEY = 'tal:theme'

export type Theme = 'dark' | 'light'

/** Unit system persisted across pages/sessions. Hydrates from localStorage on
 *  mount (an effect, not lazy init, so server and first client render agree and
 *  React doesn't flag a hydration mismatch). Returns [value, toggle]. */
export function useUnitSystem(): readonly [UnitSystem, () => void] {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  useEffect(() => {
    const saved = localStorage.getItem(UNIT_KEY)
    if (saved === 'metric' || saved === 'imperial') setUnitSystem(saved)
  }, [])

  const toggle = useCallback(() => {
    setUnitSystem(prev => {
      const next: UnitSystem = prev === 'imperial' ? 'metric' : 'imperial'
      try { localStorage.setItem(UNIT_KEY, next) } catch { /* quota / private mode */ }
      return next
    })
  }, [])

  return [unitSystem, toggle] as const
}

/** Theme persisted across pages/sessions, kept in sync with the documentElement
 *  `data-theme` attribute that globals.css keys off. Hydrates from localStorage,
 *  falling back to whatever attribute the document already carries. */
export function useTheme(): readonly [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    const fromDom = document.documentElement.getAttribute('data-theme')
    const initial: Theme =
      saved === 'light' || saved === 'dark' ? saved :
      fromDom === 'light' || fromDom === 'dark' ? fromDom :
      'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      try { localStorage.setItem(THEME_KEY, next) } catch { /* quota */ }
      return next
    })
  }, [])

  return [theme, toggle] as const
}
