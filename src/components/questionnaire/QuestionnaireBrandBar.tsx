'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/src/lib/uiPrefs'

/** Standalone brand bar for the questionnaire — logo, title, current date. The
 *  light/dark toggle lives in the form's action toolbar. Client component so the
 *  logo tracks the theme and the date renders without hydration drift. */
export default function QuestionnaireBrandBar() {
  const [theme] = useTheme()
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
      </div>
    </header>
  )
}
