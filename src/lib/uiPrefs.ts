'use client'

import { useCallback, useEffect, useState } from 'react'
import type { UnitSystem } from './utils/units'

const UNIT_KEY = 'tal:unitSystem'
const THEME_KEY = 'tal:theme'
const RAIL_KEY = 'tal:dashboardRailCollapsed'

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
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    const fromDom = document.documentElement.getAttribute('data-theme')
    const initial: Theme =
      saved === 'light' || saved === 'dark' ? saved :
      fromDom === 'light' || fromDom === 'dark' ? fromDom :
      'light'
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


/** Dashboard drivers rail collapsed? Two working modes for one page:
 *  expanded is the engineer's workbench, collapsed is presentation mode for a
 *  screen share — and collapsing hands ~284px back to the charts, which at
 *  1280px is the difference between a ~217px and a ~288px chart.
 *
 *  Hydrates in an effect, not lazy init, so server and first client render
 *  agree (same pattern as useUnitSystem/useTheme above). */
export function useDashboardRail(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { if (localStorage.getItem(RAIL_KEY) === '1') setCollapsed(true) } catch { /* private mode */ }
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(RAIL_KEY, next ? '1' : '0') } catch { /* quota */ }
      return next
    })
  }, [])

  return [collapsed, toggle] as const
}
