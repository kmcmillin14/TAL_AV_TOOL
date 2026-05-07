'use client'

import { useState } from 'react'
import Link from 'next/link'
import ApplicationForm from '@/src/components/step1/ApplicationForm'
import Icon from '@/src/design-system/components/Icon'
import type { UnitSystem } from '@/src/lib/utils/units'

const STEPS = [
  { id: 1, label: 'Application' },
  { id: 2, label: 'Vehicles' },
  { id: 3, label: 'Flows' },
  { id: 4, label: 'Energy' },
  { id: 5, label: 'KPIs' },
]

export default function NewProjectPage() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <div className="app-shell">
      <header className="hero-bar">
        {/* Top row */}
        <div className="hero-top">
          <div className="hero-brand">
            <Link href="/">
              <img className="logo" src={theme === 'dark' ? '/assets/TAL-Logo-White.png' : '/assets/TAL-Logo-Black.png'} alt="TAL" />
            </Link>
            <div className="divider" />
            <div className="app-name">
              <div className="product">Fleet Calculator</div>
              <div className="version mono">New Project</div>
            </div>
          </div>

          <div className="project-meta">
            <div className="pname">New Project</div>
            <div className="pmeta">Fill in details below · saves automatically</div>
          </div>

          <div className="hero-actions">
            <button className="tbtn" onClick={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}>
              {unitSystem === 'imperial' ? 'Imperial' : 'Metric'}
            </button>
            <button className="tbtn" onClick={toggleTheme} title="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </div>

        {/* KPI row — empty placeholders for new project */}
        <div className="hero-bottom">
          <div className="hero-kpi">
            <div className="label">Customer</div>
            <div className="value">—</div>
            <div className="sub">Set in project header</div>
          </div>
          <div className="hero-kpi">
            <div className="label">Bastian Rep</div>
            <div className="value">—</div>
            <div className="sub">TAL / Bastian representative</div>
          </div>
          <div className="hero-kpi">
            <div className="label">Version</div>
            <div className="value">v1.0</div>
            <div className="sub">Auto-increments on save</div>
          </div>
          <div className="hero-kpi">
            <div className="label">Progress</div>
            <div className="value">1<span style={{ fontSize: 14, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 500 }}>/ 5</span></div>
            <div className="sub">Application requirements</div>
          </div>
        </div>

        {/* Step nav */}
        <nav className="hero-nav">
          <div className="step-dots">
            {STEPS.map(s => (
              <div key={s.id} className={`step-dot ${s.id === 1 ? 'current' : 'upcoming'}`}>
                <div className="bar" />
                <div className="label">
                  <span className="num">0{s.id}</span>
                  <span className="name">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </nav>
      </header>

      <div className="workspace">
        <ApplicationForm unitSystem={unitSystem} />
      </div>
    </div>
  )
}
