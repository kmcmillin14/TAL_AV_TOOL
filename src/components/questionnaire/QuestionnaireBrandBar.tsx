'use client'

import { useEffect, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { useTheme } from '@/src/lib/uiPrefs'
import { useQUnit } from '@/src/lib/questionnaire/useQUnit'

/** Standalone brand bar for the questionnaire — logo, title, current date, and
 *  the action toolbar (dark · export · clear). Export/clear reach the form (a
 *  sibling component) via window events. Client component so the logo tracks the
 *  theme and the date renders without hydration drift. */
export default function QuestionnaireBrandBar() {
  const [theme, toggleTheme] = useTheme()
  const { unit, setUnit } = useQUnit()
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
  }, [])

  const fire = (name: string) => window.dispatchEvent(new Event(name))

  return (
    <header className="q-brandbar">
      <div className="q-brandbar-inner">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand logo, static asset */}
        <img className="logo" src={theme === 'dark' ? '/assets/TAL-Logo-White.png' : '/assets/TAL-Logo-Black.png'} alt="TAL" />
        <span className="q-brandbar-divider" />
        <span className="q-brandbar-title">AV Questionnaire</span>
        <span className="q-brandbar-date">{today}</span>
        <div className="q-toolbar">
          <div className="q-unit-toggle">
            <button type="button" className={`tbtn-icon q-unit-btn${unit === 'imperial' ? ' active' : ''}`} onClick={() => setUnit('imperial')} aria-pressed={unit === 'imperial'} title="Imperial units">Imp</button>
            <button type="button" className={`tbtn-icon q-unit-btn${unit === 'metric' ? ' active' : ''}`} onClick={() => setUnit('metric')} aria-pressed={unit === 'metric'} title="Metric units">Met</button>
          </div>
          <span className="q-brandbar-divider" />
          <button type="button" className="tbtn-icon" onClick={toggleTheme} aria-label="Toggle light/dark" title="Toggle light/dark">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="tbtn-icon" onClick={() => fire('tal:q-export')} aria-label="Export PDF" title="Export PDF">
            <Icon name="export" />
          </button>
          <button type="button" className="tbtn-icon" onClick={() => fire('tal:q-clear')} aria-label="Clear all answers" title="Clear all answers">
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </header>
  )
}
