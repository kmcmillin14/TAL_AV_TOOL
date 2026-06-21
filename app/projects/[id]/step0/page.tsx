'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { getProject, importProjectFromJson, updateProject, type StoredProject } from '@/src/lib/storage'
import { useUnitSystem } from '@/src/lib/uiPrefs'

export default function Step0Page() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const fileRef = useRef<HTMLInputElement>(null)

  const [project, setProject] = useState<StoredProject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const [importError, setImportError] = useState<string | null>(null)
  // Which source the picker is opened for — drives the accepted file types.
  // 'questionnaire' = customer-supplied questionnaire (.json only);
  // 'revision' = a prior export of this app (.pdf or .json).
  const [importMode, setImportMode] = useState<'questionnaire' | 'revision'>('revision')
  // Project header fields, fillable here and (live) in the bar above.
  const [meta, setMeta] = useState({
    versionNumber: '',
    opportunityType: 'opp' as 'opp' | 'lead',
    opportunityNumber: '',
    customerName: '',
    projectName: '',
  })

  useEffect(() => {
    const p = getProject(id)
    setProject(p)
    if (p) {
      setMeta({
        versionNumber: p.versionNumber ?? '',
        opportunityType: p.opportunityType ?? 'opp',
        opportunityNumber: p.opportunityNumber ?? '',
        customerName: p.customerName ?? '',
        projectName: p.projectName ?? '',
      })
    }
    setLoaded(true)
  }, [id])

  // Persist a single header field. versionNumber is project metadata; the rest
  // are form fields. Mirrors PersistentHeader's save split.
  const commitMeta = (field: keyof typeof meta) => {
    const value = meta[field]
    if (field === 'versionNumber') {
      updateProject(id, {}, { versionNumber: value })
    } else {
      updateProject(id, { [field]: value })
    }
  }

  const openPicker = (mode: 'questionnaire' | 'revision') => {
    setImportMode(mode)
    setImportError(null)
    // Defer the click so the input's `accept` reflects the new mode first.
    requestAnimationFrame(() => fileRef.current?.click())
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)

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
      router.push(`/projects/${imported.id}/step1`)
    } catch (err) {
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
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={0}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
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
                  value={meta.versionNumber}
                  onChange={e => setMeta(m => ({ ...m, versionNumber: e.target.value }))}
                  onBlur={() => commitMeta('versionNumber')}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>

              <span className="setup-meta-sep" aria-hidden />

              <div className="setup-meta-item setup-meta-opp">
                <select
                  className="setup-opp-prefix"
                  value={meta.opportunityType}
                  onChange={e => {
                    const t = e.target.value as 'opp' | 'lead'
                    setMeta(m => ({ ...m, opportunityType: t }))
                    updateProject(id, { opportunityType: t })
                  }}
                  aria-label="Opportunity prefix"
                >
                  <option value="opp">OPP</option>
                  <option value="lead">LEAD</option>
                </select>
                <input
                  id="sm-opp"
                  type="text"
                  placeholder="XXXXXXX"
                  value={meta.opportunityNumber}
                  onChange={e => setMeta(m => ({ ...m, opportunityNumber: e.target.value }))}
                  onBlur={() => commitMeta('opportunityNumber')}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>

              <span className="setup-meta-sep" aria-hidden />

              <div className="setup-meta-item setup-meta-grow">
                <label htmlFor="sm-cust">Customer</label>
                <input
                  id="sm-cust"
                  type="text"
                  placeholder="Customer name"
                  value={meta.customerName}
                  onChange={e => setMeta(m => ({ ...m, customerName: e.target.value }))}
                  onBlur={() => commitMeta('customerName')}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>

              <span className="setup-meta-sep" aria-hidden />

              <div className="setup-meta-item setup-meta-grow">
                <label htmlFor="sm-proj">Project</label>
                <input
                  id="sm-proj"
                  type="text"
                  placeholder="Project name"
                  value={meta.projectName}
                  onChange={e => setMeta(m => ({ ...m, projectName: e.target.value }))}
                  onBlur={() => commitMeta('projectName')}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
            </div>
          </div>

          <div className="entry-modes">
            <button
              type="button"
              className="entry-mode is-featured"
              onClick={() => router.push(`/projects/${project.id}/step1`)}
            >
              <span className="entry-index" aria-hidden>01</span>
              <span className="entry-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6" /><path d="M9 16h6" />
                </svg>
              </span>
              <span className="entry-body">
                <h3>Start New</h3>
                <p>Fill the application questionnaire manually, from scratch.</p>
              </span>
              <span className="entry-aside">
                <span className="entry-badge">Start from scratch</span>
                <span className="entry-chevron" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </span>
              </span>
            </button>

            <button type="button" className="entry-mode" onClick={() => openPicker('questionnaire')}>
              <span className="entry-index" aria-hidden>02</span>
              <span className="entry-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 13h6" /><path d="M9 17h6" /><path d="M9 9h1" />
                </svg>
              </span>
              <span className="entry-body">
                <h3>Import Customer Questionnaire</h3>
                <p>Upload a completed customer questionnaire (.json) to auto-fill Step 01.</p>
              </span>
              <span className="entry-aside">
                <span className="entry-badge">From a customer</span>
                <span className="entry-chevron" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </span>
              </span>
            </button>

            <button type="button" className="entry-mode" onClick={() => openPicker('revision')}>
              <span className="entry-index" aria-hidden>03</span>
              <span className="entry-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <span className="entry-body">
                <h3>Import Previous Revision</h3>
                <p>Upload a prior proposal (.pdf) or data file (.json) from this app to make a new revision.</p>
              </span>
              <span className="entry-aside">
                <span className="entry-badge">Continue / re-spec</span>
                <span className="entry-chevron" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </span>
              </span>
            </button>
          </div>

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
          accept={
            importMode === 'questionnaire'
              ? '.json,application/json'
              : '.pdf,.json,application/pdf,application/json'
          }
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
