'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { getProject, importProjectFromJson, updateProject, subscribeProjects, type StoredProject } from '@/src/lib/storage'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import sampleProject from '@/src/content/samples/toyota-project.json'

export default function Step0Page() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const fileRef = useRef<HTMLInputElement>(null)

  const [project, setProject] = useState<StoredProject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const [importError, setImportError] = useState<string | null>(null)
  // Import progress: idle → loading (parsing) → success (loaded ✓, brief pause, then navigate).
  const [importState, setImportState] = useState<'idle' | 'loading' | 'success'>('idle')
  const [importedName, setImportedName] = useState<string>('')
  // Project header fields, fillable here and (live) in the bar above.
  const [meta, setMeta] = useState({
    versionNumber: '',
    opportunityType: 'opp' as 'opp' | 'lead',
    opportunityNumber: '',
    customerName: '',
    projectName: '',
    bastianRep: '',
  })
  // Field the user is actively editing here — never overwrite it from an
  // external (header) update mid-keystroke. Ref so the subscription closure
  // always sees the current value without re-subscribing.
  const focusedRef = useRef<keyof typeof meta | null>(null)

  const syncMetaFrom = (p: StoredProject) =>
    setMeta(m => ({
      versionNumber:     focusedRef.current === 'versionNumber'     ? m.versionNumber     : (p.versionNumber ?? ''),
      opportunityType:   focusedRef.current === 'opportunityType'   ? m.opportunityType   : (p.opportunityType ?? 'opp'),
      opportunityNumber: focusedRef.current === 'opportunityNumber' ? m.opportunityNumber : (p.opportunityNumber ?? ''),
      customerName:      focusedRef.current === 'customerName'      ? m.customerName      : (p.customerName ?? ''),
      projectName:       focusedRef.current === 'projectName'       ? m.projectName       : (p.projectName ?? ''),
      bastianRep:        focusedRef.current === 'bastianRep'        ? m.bastianRep        : (p.bastianRep ?? ''),
    }))

  useEffect(() => {
    const p = getProject(id)
    setProject(p)
    if (p) syncMetaFrom(p)
    setLoaded(true)
  }, [id])

  // Mirror live: any change to this project (from the header bar, undo, or
  // another tab) re-reads it so the panel + the header prop stay in sync.
  useEffect(() => {
    return subscribeProjects(() => {
      const p = getProject(id)
      if (!p) return
      setProject(p)
      syncMetaFrom(p)
    })
  }, [id])

  // Save a single field live (so the header mirrors it as you type).
  // versionNumber is project metadata; the rest are form fields.
  const saveMeta = (field: keyof typeof meta, value: string) => {
    switch (field) {
      case 'versionNumber':     updateProject(id, {}, { versionNumber: value }); break
      case 'opportunityType':   updateProject(id, { opportunityType: value as 'opp' | 'lead' }); break
      case 'opportunityNumber': updateProject(id, { opportunityNumber: value }); break
      case 'customerName':      updateProject(id, { customerName: value }); break
      case 'projectName':       updateProject(id, { projectName: value }); break
      case 'bastianRep':        updateProject(id, { bastianRep: value }); break
    }
  }

  const onMetaChange = (field: keyof typeof meta, value: string) => {
    setMeta(m => ({ ...m, [field]: value }) as typeof m)
    saveMeta(field, value)
  }

  // Shared props for the inline text inputs in the Project Details panel — keeps
  // the value/change/focus/blur/Enter behavior single-sourced across all fields.
  const fieldProps = (field: keyof typeof meta) => ({
    value: meta[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onMetaChange(field, e.target.value),
    onFocus: () => { focusedRef.current = field },
    onBlur: () => { focusedRef.current = null },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    },
  })

  const openPicker = () => {
    setImportError(null)
    fileRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)

    // Reject oversized uploads before parsing — a huge PDF/JSON would freeze the tab.
    const MAX_IMPORT_BYTES = 25 * 1024 * 1024
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError('File is too large to import (max 25 MB).')
      e.target.value = ''
      return
    }
    setImportState('loading')

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    try {
      let imported: StoredProject
      if (isPdf) {
        const { parseProjectPdf } = await import('@/src/lib/pdfImport')
        imported = await parseProjectPdf(file)
      } else {
        const text = await file.text()
        imported = importProjectFromJson(text)
      }
      // Show the "loaded ✓" confirmation briefly before opening the project.
      setImportedName(file.name)
      setImportState('success')
      setTimeout(() => router.push(`/projects/${imported.id}/step1`), 1000)
    } catch (err) {
      setImportState('idle')
      setImportError(err instanceof Error ? err.message : 'Could not parse file.')
    }
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
          projectName: project.projectName ?? '',
          customerName: project.customerName ?? '',
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          opportunityNumber: project.opportunityNumber,
          opportunityType: project.opportunityType,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={0}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace step0-fill">
        <div className="entry-wrap">
          <div className="page-header">
            <div className="page-title">
              <span className="step-num">Step 00 / 04</span>
              <h1>Project Setup</h1>
              <div className="desc">
                Add the project details, then choose how to begin. These fields are also
                editable inline in the bar above.
              </div>
            </div>
          </div>

          <div className="setup-details">
            <div className="setup-details-head">Project details</div>
            <div className="setup-meta">
              <div className="setup-meta-item">
                <label htmlFor="sm-rev">Rev</label>
                <input
                  id="sm-rev"
                  type="text"
                  placeholder="v1.0"
                  {...fieldProps('versionNumber')}
                />
              </div>

              <div className="setup-meta-item setup-meta-opp">
                <select
                  className="setup-opp-prefix"
                  value={meta.opportunityType}
                  onChange={e => onMetaChange('opportunityType', e.target.value)}
                  aria-label="Opportunity prefix"
                >
                  <option value="opp">OPP</option>
                  <option value="lead">LEAD</option>
                </select>
                <input
                  id="sm-opp"
                  type="text"
                  placeholder="XXXXXXX"
                  {...fieldProps('opportunityNumber')}
                />
              </div>

              <div className="setup-meta-item">
                <label htmlFor="sm-cust">Customer</label>
                <input
                  id="sm-cust"
                  type="text"
                  placeholder="Customer name"
                  {...fieldProps('customerName')}
                />
              </div>

              <div className="setup-meta-item">
                <label htmlFor="sm-proj">Project</label>
                <input
                  id="sm-proj"
                  type="text"
                  placeholder="Project name"
                  {...fieldProps('projectName')}
                />
              </div>

              <div className="setup-meta-item">
                <label htmlFor="sm-eng">TAL Engineer</label>
                <input
                  id="sm-eng"
                  type="text"
                  placeholder="Engineer name"
                  {...fieldProps('bastianRep')}
                />
              </div>
            </div>
          </div>

          <div className="entry-grid">
            <button
              type="button"
              className="entry-card is-featured"
              onClick={() => router.push(`/projects/${project.id}/step1`)}
            >
              <span className="entry-card-index" aria-hidden>01</span>
              <span className="entry-card-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6" /><path d="M9 16h6" />
                </svg>
              </span>
              <h3>Start New</h3>
              <p>Fill the application questionnaire manually, from scratch.</p>
              <span className="entry-card-cta">
                Start from scratch
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
              </span>
            </button>

            <button type="button" className="entry-card" onClick={() => openPicker()}>
              <span className="entry-card-index" aria-hidden>02</span>
              <span className="entry-card-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <h3>Import a File</h3>
              <p>Open a customer questionnaire or a prior revision — .pdf or .json.</p>
              <span className="entry-card-cta">
                Import &amp; continue
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
              </span>
            </button>

            <button
              type="button"
              className="entry-sample-link"
              onClick={() => {
                try {
                  const imported = importProjectFromJson(JSON.stringify(sampleProject))
                  sessionStorage.setItem('tal:guideState', JSON.stringify({ guideId: 'sample-rfq', step: 0 }))
                  router.push(`/projects/${imported.id}/step1`)
                } catch {
                  setImportError('Could not load the sample project.')
                }
              }}
            >
              <Icon name="eye" size={14} />
              Load the sample project — Toyota Motor Mfg (guided)
            </button>
          </div>

          {importState === 'loading' && (
            <div className="decision-note" style={{ marginTop: 18 }}>
              <Icon name="download" size={16} />
              <div>Importing…</div>
            </div>
          )}

          {importState === 'success' && (
            <div className="decision-note" style={{ marginTop: 18, borderColor: 'var(--good)', color: 'var(--good)', background: 'var(--good-soft)' }}>
              <Icon name="check" size={16} />
              <div><strong>Loaded</strong> — {importedName} imported. Opening Step 1…</div>
            </div>
          )}

          {importError && (
            <div className="decision-note" style={{ marginTop: 18, borderColor: 'var(--bad)', color: 'var(--bad)', background: 'var(--bad-soft)' }}>
              <Icon name="warn" size={16} />
              <div>Could not import — {importError}</div>
            </div>
          )}

          <div className="decision-note" style={{ marginTop: 18 }}>
            <Icon name="info" size={16} />
            <div>
              <strong>Tip:</strong> Step 2 (Vehicle Evaluation) is <strong>optional</strong> if you already know
              which vehicles to use — you can skip to Step 3 (Fleet Engine) from the ribbon above.
            </div>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.json,application/pdf,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
