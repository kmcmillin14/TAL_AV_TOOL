'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/src/design-system/components/Icon'
import type { UnitSystem } from '@/src/lib/utils/units'
import { updateProject, downloadProject, getProject, canUndo, undoLastChange, clearProject, subscribeProjects } from '@/src/lib/storage'
import HelpDrawer from './HelpDrawer'
import { downloadProjectPdf } from '@/src/lib/pdfExport'
import { prefetchVehicles } from '@/src/lib/vehicleCache'

interface HeaderData {
  id: string
  projectName: string
  customerName: string
  facilityLocation?: string | null
  versionNumber: string
  bastianRep?: string | null
  opportunityNumber?: string | null
  opportunityType?: 'opp' | 'lead'
  createdAt?: string
  step1Complete: boolean
  step2Complete: boolean
  shiftsPerDay?: number
  hoursPerShift?: number
  operatingDaysPattern?: string
}

export interface HeaderTotals {
  fleet?: number | null
  fleetBreakdown?: string
  capex?: number | null
  opex?: number | null
  utilization?: number | null
  bottleneck?: string
}

type StepId = 0 | 1 | 2 | 3 | 4

interface PersistentHeaderProps {
  project: HeaderData
  currentStep: StepId
  unitSystem: UnitSystem
  onUnitToggle: () => void
  showKpis?: boolean
  totals?: HeaderTotals
}

type EditField = 'projectName' | 'customerName' | 'facilityLocation' | 'bastianRep' | 'opportunityNumber' | 'versionNumber' | 'createdAt'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const STEPS: ReadonlyArray<{ id: StepId; label: string; desc: string }> = [
  { id: 0, label: 'Start',        desc: 'Import or create' },
  { id: 1, label: 'Application',  desc: 'Load, transfer, environment' },
  { id: 2, label: 'Vehicles',     desc: 'Compatibility & qualification' },
  { id: 3, label: 'Fleet Engine', desc: 'Flows, charging & buffer' },
  { id: 4, label: 'ROM Dashboard', desc: 'Fleet, KPIs & pricing' },
]

const META_FIELDS = new Set<EditField>(['versionNumber', 'createdAt'])

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function utilizationPill(u: number | null | undefined): { cls: string; txt: string } {
  if (u == null) return { cls: 'neutral', txt: '—' }
  if (u >= 0.7) return { cls: 'good', txt: 'Good' }
  if (u >= 0.5) return { cls: 'warn', txt: 'Acceptable' }
  return { cls: 'bad', txt: 'Low' }
}

export default function PersistentHeader({
  project,
  currentStep,
  unitSystem,
  onUnitToggle,
  showKpis = false,
  totals,
}: PersistentHeaderProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<EditField | null>(null)
  const [editValues, setEditValues] = useState({
    projectName: project.projectName,
    customerName: project.customerName,
    facilityLocation: project.facilityLocation || '',
    bastianRep: project.bastianRep || '',
    opportunityNumber: project.opportunityNumber || '',
    opportunityType: (project.opportunityType ?? 'opp') as 'opp' | 'lead',
    versionNumber: project.versionNumber,
    createdAt: project.createdAt || new Date().toISOString(),
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.type !== 'date') inputRef.current.select()
    }
  }, [editing])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const saveMeta = useCallback((patch: Partial<typeof editValues>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(() => {
      try {
        const formPatch: Record<string, unknown> = {}
        const metaPatch: { versionNumber?: string; createdAt?: string } = {}
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue
          if (META_FIELDS.has(key as EditField)) {
            (metaPatch as Record<string, unknown>)[key] = value
          } else {
            formPatch[key] = value
          }
        }
        const updated = updateProject(project.id, formPatch, Object.keys(metaPatch).length ? metaPatch : undefined)
        if (updated) {
          setEditValues(v => ({ ...v, versionNumber: updated.versionNumber, createdAt: updated.createdAt }))
          setSaveStatus('saved')
          if (idleTimer.current) clearTimeout(idleTimer.current)
          idleTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } else {
          setSaveStatus('error')
        }
      } catch {
        setSaveStatus('error')
      }
    }, 400)
  }, [project.id])

  const handleExportJson = () => {
    downloadProject(project.id)
    setMenuOpen(false)
  }

  const handleExportPdf = async () => {
    setMenuOpen(false)
    const current = getProject(project.id)
    if (!current) return
    try {
      await downloadProjectPdf(current)
    } catch (err) {
      alert(`Could not generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const [undoAvailable, setUndoAvailable] = useState(false)
  useEffect(() => {
    const refresh = () => setUndoAvailable(canUndo(project.id))
    refresh()
    // Event-driven instead of a 1 Hz poll: fire on any project mutation
    // (this header's saves/undo/clear, sibling-step saves, cross-tab changes).
    return subscribeProjects(refresh)
  }, [project.id])

  // Warm every step route + the vehicle library so step-dot navigation is
  // instant. router.prefetch on a non-current route triggers Next.js to
  // compile + RSC-fetch that page in the background; vehicle prefetch
  // means Step 2 lands with the grid populated instead of a "Loading" flash.
  useEffect(() => {
    for (let i = 0; i <= 6; i++) {
      if (i !== currentStep) router.prefetch(`/projects/${project.id}/step${i}`)
    }
    prefetchVehicles()
  }, [project.id, currentStep, router])

  const handleUndo = () => {
    const restored = undoLastChange(project.id)
    if (restored) window.location.reload()
  }

  const handleClearAll = () => {
    setMenuOpen(false)
    const ok = window.confirm(
      'Clear ALL project data? This resets every field on this project to blank. You can undo immediately after if it was a mistake.',
    )
    if (!ok) return
    const cleared = clearProject(project.id)
    if (cleared) window.location.reload()
  }

  const originalValue = (field: EditField): string => {
    switch (field) {
      case 'projectName':       return project.projectName
      case 'customerName':      return project.customerName
      case 'facilityLocation':  return project.facilityLocation ?? ''
      case 'bastianRep':        return project.bastianRep ?? ''
      case 'opportunityNumber': return project.opportunityNumber ?? ''
      case 'versionNumber':     return project.versionNumber
      case 'createdAt':         return project.createdAt ?? ''
    }
  }

  const commitEdit = (field: EditField) => {
    setEditing(null)
    if (editValues[field] === originalValue(field)) return
    saveMeta({ [field]: editValues[field] } as Partial<typeof editValues>)
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const stepClass = (id: number) =>
    id === currentStep ? 'current' : id < currentStep ? 'complete' : 'upcoming'

  const navigateTo = (stepId: number) => {
    router.push(`/projects/${project.id}/step${stepId}`)
  }

  const shifts = project.shiftsPerDay ?? 0
  const hours = project.hoursPerShift ?? 0
  const hoursPerDay = shifts * hours
  const utilPill = utilizationPill(totals?.utilization)

  const renderInlineItem = (
    field: EditField,
    label: string | null,
    displayValue: string,
    placeholder?: string,
  ) => {
    const isEditing = editing === field
    return (
      <button
        type="button"
        className="hero-meta-item"
        onClick={() => !isEditing && setEditing(field)}
      >
        {label && <span className="label">{label}</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="hero-meta-input"
            placeholder={placeholder}
            value={editValues[field] || ''}
            onChange={e => setEditValues(s => ({ ...s, [field]: e.target.value }))}
            onBlur={() => commitEdit(field)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit(field)
              if (e.key === 'Escape') setEditing(null)
            }}
            onClick={e => e.stopPropagation()}
            size={Math.max(8, (editValues[field] || '').length + 2)}
          />
        ) : (
          <span className="value">
            {displayValue || <span className="placeholder">{placeholder || '—'}</span>}
          </span>
        )}
      </button>
    )
  }

  const statusText =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? 'Saved ✓' :
    saveStatus === 'error'  ? 'Save failed' :
    ''

  return (
    <>
    <header className="hero-bar">
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
            <div className="product-rev mono">V1.0</div>
          </div>
        </div>

        <div className="hero-meta-line">
          <div className="hero-meta-half hero-meta-left">
          {renderInlineItem('versionNumber', 'REV', editValues.versionNumber, 'v1.0')}
          <span className="hero-meta-sep" aria-hidden />

          <div className="hero-meta-item opp-item">
            <select
              className="opp-prefix-select"
              value={editValues.opportunityType}
              onChange={e => {
                const t = e.target.value as 'opp' | 'lead'
                setEditValues(s => ({ ...s, opportunityType: t }))
                saveMeta({ opportunityType: t } as Partial<typeof editValues>)
              }}
              aria-label="Opportunity prefix"
            >
              <option value="opp">OPP</option>
              <option value="lead">LEAD</option>
            </select>
            {editing === 'opportunityNumber' ? (
              <input
                ref={inputRef}
                type="text"
                className="hero-meta-input"
                placeholder="XXXXXXX"
                value={editValues.opportunityNumber || ''}
                onChange={e => setEditValues(s => ({ ...s, opportunityNumber: e.target.value }))}
                onBlur={() => commitEdit('opportunityNumber')}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit('opportunityNumber')
                  if (e.key === 'Escape') setEditing(null)
                }}
                size={Math.max(8, (editValues.opportunityNumber || '').length + 2)}
              />
            ) : (
              <span
                className="value"
                onClick={() => setEditing('opportunityNumber')}
                role="button"
                tabIndex={0}
              >
                {editValues.opportunityNumber || <span className="placeholder">XXXXXXX</span>}
              </span>
            )}
          </div>
          </div>

          <span className="hero-meta-sep hero-meta-center" aria-hidden />

          <div className="hero-meta-half hero-meta-right">
          {renderInlineItem('customerName', 'CUSTOMER', editValues.customerName)}
          <span className="hero-meta-sep" aria-hidden />
          {renderInlineItem('projectName',  'PROJECT',  editValues.projectName)}
          </div>
        </div>

        <div className="hero-actions">
          <span className={`save-status ${saveStatus}`}>{statusText}</span>

          <div className="unit-pill" role="radiogroup" aria-label="Units">
            <button
              type="button"
              role="radio"
              aria-checked={unitSystem === 'imperial'}
              className={`unit-pill-btn ${unitSystem === 'imperial' ? 'active' : ''}`}
              onClick={() => { if (unitSystem !== 'imperial') onUnitToggle() }}
            >
              Imperial
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unitSystem === 'metric'}
              className={`unit-pill-btn ${unitSystem === 'metric' ? 'active' : ''}`}
              onClick={() => { if (unitSystem !== 'metric') onUnitToggle() }}
            >
              Metric
            </button>
          </div>

          <button
            type="button"
            className="tbtn-icon"
            onClick={handleUndo}
            disabled={!undoAvailable}
            aria-label="Undo last change"
            title={undoAvailable ? 'Undo last change' : 'Nothing to undo'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
          <button className="tbtn-icon" onClick={toggleTheme} aria-label="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button
            type="button"
            className="tbtn-icon"
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
            title="Help — how to use this tool"
          >
            <Icon name="help" />
          </button>

          <div className="header-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="tbtn-icon"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div className="header-menu-popover" role="menu">
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleExportPdf}>
                  <span>Export proposal</span>
                  <span className="hint">.pdf</span>
                </button>
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleExportJson}>
                  <span>Export data only</span>
                  <span className="hint">.json</span>
                </button>
                <div className="header-menu-sep" aria-hidden />
                <button
                  type="button"
                  className="header-menu-item destructive"
                  role="menuitem"
                  onClick={handleClearAll}
                >
                  <span>Clear all data</span>
                  <span className="hint">reset</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showKpis && (
        <div className="hero-bottom">
          <div className="hero-kpi">
            <div className="label">Total Fleet</div>
            <div className="value">
              {totals?.fleet ?? '—'}
              <span className="kpi-unit">vehicles</span>
            </div>
            <div className="sub">{totals?.fleetBreakdown || 'Configure flows to size fleet'}</div>
          </div>
          <div className="hero-kpi">
            <div className="label">CAPEX</div>
            <div className="value">{totals?.capex != null ? formatMoney(totals.capex) : '—'}</div>
            <div className="sub">
              {totals?.opex != null ? `${formatMoney(totals.opex)}/yr OPEX` : 'Includes 15% contingency'}
            </div>
          </div>
          <div className="hero-kpi">
            <div className="label">Utilization</div>
            <div className="value">
              {totals?.utilization != null ? `${Math.round(totals.utilization * 100)}%` : '—'}
              <span className={`pill kpi-pill ${utilPill.cls}`}>
                <span className="dot" />{utilPill.txt}
              </span>
            </div>
            <div className="sub">{totals?.bottleneck ? `Bottleneck: ${totals.bottleneck}` : 'All flows balanced'}</div>
          </div>
          <div className="hero-kpi">
            <div className="label">Schedule</div>
            <div className="value">
              {hoursPerDay > 0 ? hoursPerDay : '—'}
              <span className="kpi-unit">hr/day</span>
            </div>
            <div className="sub">
              {shifts > 0 ? `${shifts} shift${shifts === 1 ? '' : 's'}` : '— shifts'}
              {project.operatingDaysPattern ? ` · ${project.operatingDaysPattern}` : ''}
            </div>
          </div>
        </div>
      )}

      <nav className="hero-nav">
        <div className="step-dots">
          {STEPS.map(s => (
            <button
              key={s.id}
              className={`step-dot ${stepClass(s.id)}`}
              onClick={() => navigateTo(s.id)}
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
    <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} currentStep={currentStep} />
    </>
  )
}
