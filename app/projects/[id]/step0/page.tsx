'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import Icon from '@/src/design-system/components/Icon'
import { getProject, importProjectFromJson, type StoredProject } from '@/src/lib/storage'
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

  useEffect(() => {
    setProject(getProject(id))
    setLoaded(true)
  }, [id])

  const handleImportClick = () => fileRef.current?.click()

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
          shiftsPerDay: project.shiftsPerDay,
          hoursPerShift: project.hoursPerShift,
          operatingDaysPattern: project.operatingDaysPattern,
        }}
        currentStep={0}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 00 / 04</span>
            <h1>Project Setup</h1>
            <div className="desc">
              Choose how to provide application details. Project header info is editable in the bar above.
            </div>
          </div>
        </div>

        <div className="decision-pair">
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
              <p>Upload a previously exported proposal (.pdf) or data file (.json) to restore a project.</p>
            </div>
            <div className="dc-badge">Recommended for returning projects</div>
          </button>

          <div className="decision-or" aria-hidden>
            <span className="decision-or-chip">OR</span>
          </div>

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
            <div className="dc-badge">Start from scratch</div>
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
            which vehicles to use — you can skip to Step 3 (Fleet Engine) from the ribbon above.
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
