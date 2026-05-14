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

type StepId = 0 | 1 | 2 | 3 | 4 | 5 | 6

interface PersistentHeaderProps {
  project: HeaderData
  currentStep: StepId
  unitSystem: UnitSystem
  onUnitToggle: () => void
  showKpis?: boolean
  totals?: HeaderTotals
}

type EditField = 'projectName' | 'customerName' | 'facilityLocation' | 'bastianRep' | 'versionNumber' | 'createdAt'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const STEPS: ReadonlyArray<{ id: StepId; label: string; desc: string }> = [
  { id: 0, label: 'Start',       desc: 'Import or create' },
  { id: 1, label: 'Application', desc: 'Load, transfer, environment' },
  { id: 2, label: 'Vehicles',    desc: 'Compatibility & qualification' },
  { id: 3, label: 'Flows',       desc: 'Material flow modeling' },
  { id: 4, label: 'Charging',    desc: 'Battery & charging sizing' },
  { id: 5, label: 'KPIs',        desc: 'Throughput, utilization, ROI' },
  { id: 6, label: 'ROM',         desc: 'Rough order of magnitude' },
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

function toDateInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function toDisplayDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
    versionNumber: project.versionNumber,
    createdAt: project.createdAt || new Date().toISOString(),
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    reader.onerror = () => alert('Could not read the selected file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  const originalValue = (field: EditField): string => {
    switch (field) {
      case 'projectName':      return project.projectName
      case 'customerName':     return project.customerName
      case 'facilityLocation': return project.facilityLocation ?? ''
      case 'bastianRep':       return project.bastianRep ?? ''
      case 'versionNumber':    return project.versionNumber
      case 'createdAt':        return project.createdAt ?? ''
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

  const renderCell = (field: EditField, label: string, displayValue: string, opts?: { type?: 'text' | 'date' }) => {
    const isEditing = editing === field
    const inputType = opts?.type ?? 'text'
    return (
      <button
        type="button"
        className="hero-meta-cell"
        onClick={() => !isEditing && setEditing(field)}
      >
        <span className="hero-meta-label">{label}</span>
        {isEditing ? (
          <input
            ref={inputRef}
            type={inputType}
            className="hero-meta-input"
            value={inputType === 'date' ? toDateInput(editValues.createdAt) : (editValues[field] || '')}
            onChange={e => {
              const v = e.target.value
              if (field === 'createdAt') {
                const iso = v ? new Date(v + 'T00:00:00').toISOString() : ''
                setEditValues(s => ({ ...s, createdAt: iso }))
              } else {
                setEditValues(s => ({ ...s, [field]: v }))
              }
            }}
            onBlur={() => commitEdit(field)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit(field)
              if (e.key === 'Escape') setEditing(null)
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="hero-meta-value">{displayValue || '—'}</span>
        )}
      </button>
    )
  }

  const statusText =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? 'Saved ✓' :
    saveStatus === 'error'  ? 'Save failed' :
    editValues.versionNumber

  return (
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
            <div className="product-sub mono">Enterprise AGV / AMR Sizing</div>
          </div>
        </div>

        <div className="hero-meta-grid">
          {renderCell('projectName',      'Project',      editValues.projectName)}
          {renderCell('customerName',     'Customer',     editValues.customerName)}
          {renderCell('facilityLocation', 'Location',     editValues.facilityLocation)}
          {renderCell('versionNumber',    'Revision',     editValues.versionNumber)}
          {renderCell('createdAt',        'Date',         toDisplayDate(editValues.createdAt), { type: 'date' })}
          {renderCell('bastianRep',       'TAL Engineer', editValues.bastianRep)}
        </div>

        <div className="hero-actions">
          <span className={`save-status ${saveStatus}`}>{statusText}</span>
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
  )
}
