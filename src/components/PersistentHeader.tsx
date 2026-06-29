'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/src/design-system/components/Icon'
import type { UnitSystem } from '@/src/lib/utils/units'
import { updateProject, downloadProject, getProject, canUndo, undoLastChange, clearProject, subscribeProjects, subscribeStorageError, type StoredProject } from '@/src/lib/storage'
import { useTheme } from '@/src/lib/uiPrefs'
import HelpDrawer from './HelpDrawer'
import AppVersionLog from './AppVersionLog'
import { APP_VERSION } from '@/src/content/appVersions'
import { prefetchVehicles, fetchVehiclesCached } from '@/src/lib/vehicleCache'
import PptxSectionPicker from './rom/PptxSectionPicker'

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
}

type StepId = 0 | 1 | 2 | 3 | 4

interface PersistentHeaderProps {
  project: HeaderData
  currentStep: StepId
  unitSystem: UnitSystem
  onUnitToggle: () => void
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

export default function PersistentHeader({
  project,
  currentStep,
  unitSystem,
  onUnitToggle,
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
  const [theme, toggleTheme] = useTheme()
  const [exportOpen, setExportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [versionLogOpen, setVersionLogOpen] = useState(false)
  const [pptxProject, setPptxProject] = useState<StoredProject | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.type !== 'date') inputRef.current.select()
    }
  }, [editing])

  // Mirror external edits (e.g. the Step 00 Project Details panel writes the same
  // fields) into local state — but never clobber a field the user is editing here.
  useEffect(() => {
    setEditValues(v => ({
      ...v,
      projectName:       editing === 'projectName'       ? v.projectName       : project.projectName,
      customerName:      editing === 'customerName'      ? v.customerName      : project.customerName,
      facilityLocation:  editing === 'facilityLocation'  ? v.facilityLocation  : (project.facilityLocation || ''),
      bastianRep:        editing === 'bastianRep'        ? v.bastianRep        : (project.bastianRep || ''),
      opportunityNumber: editing === 'opportunityNumber' ? v.opportunityNumber : (project.opportunityNumber || ''),
      opportunityType:   project.opportunityType ?? v.opportunityType,
      versionNumber:     editing === 'versionNumber'     ? v.versionNumber     : project.versionNumber,
    }))
    // Intentionally keyed on the project field values, not `editing`, so blurring
    // a header field doesn't momentarily revert it before its debounced save lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.projectName, project.customerName, project.facilityLocation,
    project.bastianRep, project.opportunityNumber, project.opportunityType,
    project.versionNumber,
  ])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (idleTimer.current) clearTimeout(idleTimer.current)
  }, [])


  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

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
    setExportOpen(false)
  }

  const handleExportPptx = () => {
    setExportOpen(false)
    const current = getProject(project.id)
    if (current) setPptxProject(current)
  }

  const handleExportXlsx = async () => {
    setExportOpen(false)
    const current = getProject(project.id)
    if (!current) return
    try {
      const [{ downloadProjectXlsx }, vehicles] = await Promise.all([
        import('@/src/lib/xlsxExport'),
        fetchVehiclesCached(),
      ])
      await downloadProjectXlsx(current, vehicles)
    } catch (err) {
      alert(`Could not generate workbook: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

  // A failed disk write (quota/serialization) must not read as "Saved ✓" — surface it.
  useEffect(() => subscribeStorageError(() => setSaveStatus('error')), [])

  // Warm every step route + the vehicle library so step-dot navigation is
  // instant. router.prefetch on a non-current route triggers Next.js to
  // compile + RSC-fetch that page in the background; vehicle prefetch
  // means Step 2 lands with the grid populated instead of a "Loading" flash.
  useEffect(() => {
    for (const s of STEPS) {
      if (s.id !== currentStep) router.prefetch(`/projects/${project.id}/step${s.id}`)
    }
    prefetchVehicles()
  }, [project.id, currentStep, router])

  const handleUndo = () => {
    const restored = undoLastChange(project.id)
    // undoLastChange writes + notify()s, so any step subscribed to
    // subscribeProjects (steps 2–4) re-reads live. Step 1's form holds its own
    // RHF state, so signal it to remount with the restored values — no full reload.
    if (restored) window.dispatchEvent(new CustomEvent('tal:undo', { detail: restored.id }))
  }

  const handleClearAll = () => {
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

  const stepClass = (id: number) =>
    id === currentStep ? 'current' : id < currentStep ? 'complete' : 'upcoming'

  const navigateTo = (stepId: number) => {
    router.push(`/projects/${project.id}/step${stepId}`)
  }

  const renderInlineItem = (
    field: EditField,
    label: string | null,
    displayValue: string,
    placeholder?: string,
  ) => {
    const isEditing = editing === field
    // Editing and display are rendered as separate elements rather than an
    // <input> nested inside a <button> — interactive controls must not nest.
    if (isEditing) {
      return (
        <div className="hero-meta-item">
          {label && <span className="label">{label}</span>}
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
            size={Math.max(8, (editValues[field] || '').length + 2)}
          />
        </div>
      )
    }
    return (
      <button
        type="button"
        className="hero-meta-item"
        onClick={() => setEditing(field)}
      >
        {label && <span className="label">{label}</span>}
        <span className="value">
          {displayValue || <span className="placeholder">{placeholder || '—'}</span>}
        </span>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height brand logo, static asset */}
          <img
            className="logo"
            src={theme === 'dark' ? '/assets/TAL-Logo-White.png' : '/assets/TAL-Logo-Black.png'}
            alt="TAL"
          />
          <div className="divider" />
          <div className="app-name">
            <div className="product">Fleet Calculator</div>
            <button type="button" className="product-rev mono product-rev-btn" onClick={() => setVersionLogOpen(true)} title="App version history">{APP_VERSION}</button>
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
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setEditing('opportunityNumber')
                  }
                }}
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
          <span className="hero-meta-sep" aria-hidden />
          {renderInlineItem('bastianRep',   'TAL ENGINEER', editValues.bastianRep)}
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

          <div className="header-menu-wrap" ref={exportRef}>
            <button
              type="button"
              className="tbtn-icon tbtn-export"
              aria-label="Export"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title="Export proposal, workbook, or save file"
              onClick={() => setExportOpen(o => !o)}
            >
              <Icon name="export" size={15} />
            </button>
            {exportOpen && (
              <div className="header-menu-popover" role="menu">
                <div className="header-menu-cap">Share &amp; export</div>
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleExportPptx}>
                  <span>PowerPoint proposal</span>
                  <span className="hint">.pptx</span>
                </button>
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleExportXlsx}>
                  <span>Excel workbook</span>
                  <span className="hint">.xlsx</span>
                </button>
                <div className="header-menu-sep" aria-hidden />
                <div className="header-menu-cap">Save for later</div>
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleExportJson}>
                  <span>Save project file</span>
                  <span className="hint">.json</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="tbtn-icon"
            aria-label="Clear all data"
            title="Clear all data"
            onClick={handleClearAll}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

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
    {pptxProject && <PptxSectionPicker project={pptxProject} onClose={() => setPptxProject(null)} />}
    {versionLogOpen && <AppVersionLog onClose={() => setVersionLogOpen(false)} />}
    </>
  )
}
