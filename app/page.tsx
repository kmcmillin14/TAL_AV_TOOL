'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { createProject, listProjects, importProjectFromJson, type StoredProject } from '@/src/lib/storage'

export default function HomePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<StoredProject[]>([])
  const [mounted, setMounted] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    setProjects(listProjects())
    setMounted(true)
  }, [])

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
        setImportError(err instanceof Error ? err.message : 'Could not parse file. Expecting JSON exported from this tool.')
      }
    }
    reader.onerror = () => setImportError('Could not read the selected file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="app-shell">
      <div className="landing-top">
        <img className="logo" src="/assets/TAL-Logo-White.png" alt="TAL" />
        <span className="divider" />
        <div className="app-name">
          <span className="product">Fleet Calculator</span>
          <span className="product-sub">Enterprise AGV / AMR Sizing Tool</span>
        </div>
      </div>

      <div className="decision-screen">
        <div className="decision-container">
          <div className="decision-header">
            <span className="step-progress">Step 01 / 06</span>
            <h1>Application Input</h1>
            <p className="decision-subtitle">Choose how you&apos;d like to provide project information</p>
          </div>

          <div className="decision-options-vertical">
            <button className="decision-card-v" onClick={handleImportClick} type="button">
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
              onClick={() => {
                const created = createProject({})
                router.push(`/projects/${created.id}/step1`)
              }}
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

          <div className="decision-note">
            <Icon name="info" size={16} />
            <div>
              <strong>Note:</strong> Step 2 (Vehicle Evaluation) is <strong>optional</strong> if you already know which vehicles to use.
              You can skip directly to Step 3 (Material Flows) to define your operation.
            </div>
          </div>

          {importError && (
            <div className="decision-note" style={{ marginTop: 16, borderColor: 'var(--bad)', color: 'var(--bad)', background: 'var(--bad-soft)' }}>
              <Icon name="warn" size={16} />
              <div>Could not import — {importError}</div>
            </div>
          )}

          {mounted && projects.length > 0 && (
            <div className="decision-recent">
              <div className="decision-recent-label">Recent in this browser</div>
              <ul>
                {projects.slice(0, 5).map(p => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}/step${p.step1Complete ? '2' : '1'}`}>
                      <span className="dr-name">{p.projectName || 'Untitled Project'}</span>
                      <span className="dr-meta">
                        {p.customerName || '—'}
                        {p.facilityLocation ? ` · ${p.facilityLocation}` : ''}
                      </span>
                      <span className="dr-version">{p.versionNumber}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
