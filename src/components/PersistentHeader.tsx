'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/src/design-system/components/Icon'
import type { UnitSystem } from '@/src/lib/utils/units'
import { updateProject, downloadProject, importProjectFromJson } from '@/src/lib/storage'

interface HeaderData {
  id: string
  projectName: string
  customerName: string
  facilityLocation?: string | null
  versionNumber: string
  bastianRep?: string | null
  step1Complete: boolean
  step2Complete: boolean
}

interface PersistentHeaderProps {
  project: HeaderData
  currentStep: 1 | 2
  unitSystem: UnitSystem
  onUnitToggle: () => void
}

const STEPS = [
  { id: 1, label: 'Requirements', desc: 'Load, transfer, environment' },
  { id: 2, label: 'Vehicles', desc: 'Compatibility & qualification' },
  { id: 3, label: 'Flows', desc: 'Material flow modeling', future: true },
  { id: 4, label: 'Energy', desc: 'Battery & charging sizing', future: true },
  { id: 5, label: 'KPIs & Export', desc: 'ROI, proposal output', future: true },
]

export default function PersistentHeader({ project, currentStep, unitSystem, onUnitToggle }: PersistentHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<keyof HeaderData | null>(null)
  const [editValues, setEditValues] = useState({
    projectName: project.projectName,
    customerName: project.customerName,
    facilityLocation: project.facilityLocation || '',
    bastianRep: project.bastianRep || '',
  })
  const [versionNumber, setVersionNumber] = useState(project.versionNumber)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const saveHeader = useCallback((patch: Partial<typeof editValues>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(() => {
      try {
        const updated = updateProject(project.id, patch)
        if (updated) {
          setVersionNumber(updated.versionNumber)
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch {
        setSaveStatus('idle')
      }
    }, 800)
  }, [project.id])

  const handleExport = () => downloadProject(project.id)

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = importProjectFromJson(String(reader.result))
        window.location.href = `/projects/${imported.id}/step1`
      } catch (err) {
        alert(`Could not import project: ${err instanceof Error ? err.message : 'Invalid file'}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const commitEdit = (field: keyof typeof editValues) => {
    setEditing(null)
    saveHeader({ [field]: editValues[field] })
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const stepClass = (id: number) => {
    if (id === currentStep) return 'current'
    // Steps 1 and 2 are always accessible once a project exists
    if (id <= 2 && id !== currentStep) return id < currentStep ? 'complete' : ''
    if (id < currentStep) return 'complete'
    return 'upcoming'
  }

  const navigateTo = (stepId: number) => {
    if (stepId === 1) router.push(`/projects/${project.id}/step1`)
    if (stepId === 2) router.push(`/projects/${project.id}/step2`)
  }

  return (
    <header className="hero-bar">
      {/* Top row: brand | project meta | actions */}
      <div className="hero-top">
        <div className="hero-brand">
          <img
            className="logo"
            src={theme === 'dark' ? '/assets/TAL-Logo-White.png' : '/assets/TAL-Logo-Black.png'}
            alt="TAL"
          />
          <div className="divider" />
          <div className="app-name">
            <div className="product">Fleet Calculator</div>
            <div className="version">
              {editing === 'projectName' ? (
                <input
                  ref={inputRef}
                  className="project-title-edit"
                  value={editValues.projectName}
                  onChange={e => setEditValues(v => ({ ...v, projectName: e.target.value }))}
                  onBlur={() => commitEdit('projectName')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit('projectName')
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <span
                  className="project-title mono"
                  onClick={() => setEditing('projectName')}
                  title="Click to edit project name"
                >
                  {editValues.projectName || 'Untitled Project'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="project-meta">
          <div className="pname">{editValues.projectName || 'Untitled Project'}</div>
          <div className="pmeta">
            {editValues.customerName || '—'} · {editValues.facilityLocation || '—'}
            {editValues.bastianRep ? ` · ${editValues.bastianRep}` : ''}
          </div>
        </div>

        <div className="hero-actions">
          <span
            className={`save-status${saveStatus === 'saving' ? ' saving' : saveStatus === 'saved' ? ' saved' : ''}`}
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : versionNumber}
          </span>
          <button className="tbtn" onClick={handleExport} title="Download project as JSON">
            Export
          </button>
          <label className="tbtn" title="Import a project JSON file" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept="application/json,.json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button className="tbtn" onClick={onUnitToggle}>
            {unitSystem === 'imperial' ? 'Imperial' : 'Metric'}
          </button>
          <button className="tbtn" onClick={toggleTheme} title="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </div>

      {/* Middle row: KPIs */}
      <div className="hero-bottom">
        <div className="hero-kpi">
          <div className="label">Customer</div>
          <div className="value">{editValues.customerName || '—'}</div>
          <div className="sub">{editValues.facilityLocation || 'No location set'}</div>
        </div>
        <div className="hero-kpi">
          <div className="label">Bastian Rep</div>
          <div className="value">{editValues.bastianRep || '—'}</div>
          <div className="sub">TAL / Bastian representative</div>
        </div>
        <div className="hero-kpi">
          <div className="label">Version</div>
          <div className="value">{versionNumber}</div>
          <div className="sub">Auto-increments on save</div>
        </div>
        <div className="hero-kpi">
          <div className="label">Progress</div>
          <div className="value">
            {currentStep}<span style={{ fontSize: 14, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 500 }}>/ 5</span>
          </div>
          <div className="sub">Step {currentStep} of 5 · {project.step1Complete ? 'Requirements complete' : 'In progress'}</div>
        </div>
      </div>

      {/* Bottom row: step navigation */}
      <nav className="hero-nav">
        <div className="step-dots">
          {STEPS.map(s => (
            <button
              key={s.id}
              className={`step-dot ${stepClass(s.id)}`}
              onClick={() => !s.future && s.id <= 2 && navigateTo(s.id)}
              disabled={s.future || s.id > 2}
            >
              <div className="bar" />
              <div className="label">
                <span className="num">0{s.id}</span>
                <span className="name">{s.label}</span>
                <span className="desc">{s.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </nav>
    </header>
  )
}
