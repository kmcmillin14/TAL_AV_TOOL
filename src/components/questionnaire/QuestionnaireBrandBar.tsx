'use client'

import { useEffect, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { useTheme } from '@/src/lib/uiPrefs'

/** Standalone brand bar for the questionnaire — logo, title, current date, and a
 *  light/dark toggle (the page has no PersistentHeader). Client component so it
 *  can react to the theme and render today's date without hydration drift. */
export default function QuestionnaireBrandBar() {
  const [theme, toggleTheme] = useTheme()
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
  }, [])

  return (
    <header className="q-brandbar">
      <div className="q-brandbar-inner">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand logo, static asset */}
        <img className="logo" src={theme === 'dark' ? '/assets/TAL-Logo-White.png' : '/assets/TAL-Logo-Black.png'} alt="TAL" />
        <span className="q-brandbar-divider" />
        <span className="q-brandbar-title">AV Questionnaire</span>
        <span className="q-brandbar-date">{today}</span>
        <button type="button" className="tbtn-icon" onClick={toggleTheme} aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
    </header>
  )
}
