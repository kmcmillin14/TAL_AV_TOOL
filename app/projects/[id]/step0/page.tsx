'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import {
  getProject,
  updateProject,
  importProjectFromJson,
  type StoredProject,
} from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'

type DraftFields = {
  projectName: string
  customerName: string
  facilityLocation: string
  versionNumber: string
  createdAt: string
  bastianRep: string
}

function toDateInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export default function Step0Page() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [project, setProject] = useState<StoredProject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<DraftFields>({
    projectName: '',
    customerName: '',
    facilityLocation: '',
    versionNumber: 'v1.0',
    createdAt: new Date().toISOString(),
    bastianRep: '',
  })
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    const p = getProject(id)
    if (p) {
      setProject(p)
      setDraft({
        projectName: p.projectName === 'Untitled Project' ? '' : (p.projectName ?? ''),
        customerName: p.customerName ?? '',
        facilityLocation: p.facilityLocation ?? '',
        versionNumber: p.versionNumber ?? 'v1.0',
        createdAt: p.createdAt ?? new Date().toISOString(),
        bastianRep: p.bastianRep ?? '',
      })
    }
    setLoaded(true)
  }, [id])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const save = useCallback((patch: Partial<DraftFields>) => {
    if (!project) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const formPatch: Record<string, unknown> = {}
      const metaPatch: { versionNumber?: string; createdAt?: string } = {}
      if (patch.projectName !== undefined)      formPatch.projectName = patch.projectName || 'Untitled Project'
      if (patch.customerName !== undefined)     formPatch.customerName = patch.customerName
      if (patch.facilityLocation !== undefined) formPatch.facilityLocation = patch.facilityLocation
      if (patch.bastianRep !== undefined)       formPatch.bastianRep = patch.bastianRep
      if (patch.versionNumber !== undefined)    metaPatch.versionNumber = patch.versionNumber
      if (patch.createdAt !== undefined)        metaPatch.createdAt = patch.createdAt
      const updated = updateProject(project.id, formPatch, Object.keys(metaPatch).length ? metaPatch : undefined)
      if (updated) setProject(updated)
    }, 400)
  }, [project])

  const update = (field: keyof DraftFields, value: string) => {
    setDraft(d => ({ ...d, [field]: value }))
    if (field === 'createdAt') {
      const iso = value ? new Date(value + 'T00:00:00').toISOString() : new Date().toISOString()
      save({ createdAt: iso })
    } else {
      save({ [field]: value })
    }
  }

  const handleImportClick = () => fileRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = importProjectFromJson(String(reader.result))
        router.push(`/projects/${imported.id}/step1`)
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Could not parse file.')
      }
    }
    reader.onerror = () => setImportError('Could not read the selected file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  if (!loaded) return (
    <div className="app-shell">
      <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading…</div>
    </div>
  )

  if (!project) return (
    <div className="app-shell">
      <div style={{ padding: 40, color: 'var(--bad)' }}>Project not found.</div>
    </div>
  )

  return (
    <div className="app-shell">
      <PersistentHeader
        project={{
          id: project.id,
          projectName: draft.projectName || 'Untitled Project',
          customerName: draft.customerName,
          facilityLocation: draft.facilityLocation,
          versionNumber: draft.versionNumber,
          bastianRep: draft.bastianRep,
          createdAt: draft.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
          shiftsPerDay: project.shiftsPerDay,
          hoursPerShift: project.hoursPerShift,
          operatingDaysPattern: project.operatingDaysPattern,
        }}
        currentStep={0}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
      />

      <div className="workspace">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 00 / 06</span>
            <h1>Project Setup</h1>
            <div className="desc">
              Identify the project. Then choose how to provide the application details.
            </div>
          </div>
        </div>

        <div className="form-stack">
          <div className="form-section">
            <h3><span className="sec-num">01.</span> Project Information</h3>
            <div className="fld-grid-4">
              <div className="fld">
                <label>Project Name</label>
                <input
                  type="text"
                  placeholder="Acme Distribution Center - West"
                  value={draft.projectName}
                  onChange={e => update('projectName', e.target.value)}
                />
              </div>
              <div className="fld">
                <label>Customer</label>
                <input
                  type="text"
                  placeholder="Acme Logistics"
                  value={draft.customerName}
                  onChange={e => update('customerName', e.target.value)}
                />
              </div>
              <div className="fld">
                <label>Location</label>
                <input
                  type="text"
                  placeholder="Phoenix, AZ"
                  value={draft.facilityLocation}
                  onChange={e => update('facilityLocation', e.target.value)}
                />
              </div>
              <div className="fld">
                <label>TAL Engineer</label>
                <input
                  type="text"
                  placeholder="M. Rodriguez"
                  value={draft.bastianRep}
                  onChange={e => update('bastianRep', e.target.value)}
                />
              </div>
              <div className="fld">
                <label>Revision</label>
                <input
                  type="text"
                  className="mono"
                  placeholder="v1.0"
                  value={draft.versionNumber}
                  onChange={e => update('versionNumber', e.target.value)}
                />
                <div className="help">Auto-increments on saves elsewhere; override here</div>
              </div>
              <div className="fld">
                <label>Date</label>
                <input
                  type="date"
                  className="mono"
                  value={toDateInput(draft.createdAt)}
                  onChange={e => update('createdAt', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="decision-options-vertical" style={{ marginTop: 28 }}>
          <button type="button" className="decision-card-v" onClick={handleImportClick}>
            <div className="dc-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="dc-content">
              <h3>Import Existing Checklist</h3>
              <p>Upload a previously saved JSON file with project details, flows, and vehicle selections.</p>
            </div>
            <div className="dc-badge">Recommended for returning projects</div>
          </button>

          <button
            type="button"
            className="decision-card-v"
            onClick={() => router.push(`/projects/${project.id}/step1`)}
          >
            <div className="dc-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6" />
                <path d="M9 16h6" />
              </svg>
            </div>
            <div className="dc-content">
              <h3>Fill Application Form</h3>
              <p>Manually enter project information, operating schedule, and environmental requirements.</p>
            </div>
            <div className="dc-badge">Continue to Step 01</div>
          </button>
        </div>

        {importError && (
          <div className="decision-note" style={{ marginTop: 16, borderColor: 'var(--bad)', color: 'var(--bad)', background: 'var(--bad-soft)' }}>
            <Icon name="warn" size={16} />
            <div>Could not import — {importError}</div>
          </div>
        )}

        <div className="decision-note" style={{ marginTop: 16 }}>
          <Icon name="info" size={16} />
          <div>
            <strong>Tip:</strong> Step 2 (Vehicle Evaluation) is <strong>optional</strong> if you already know
            which vehicles to use — you can skip to Step 3 (Flows) from the ribbon above.
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
