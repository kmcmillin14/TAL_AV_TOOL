'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listProjects, importProjectFromJson, type StoredProject } from '@/src/lib/storage'

export default function HomePage() {
  const [projects, setProjects] = useState<StoredProject[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setProjects(listProjects())
    setMounted(true)
  }, [])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = importProjectFromJson(String(reader.result))
        setProjects(listProjects())
        window.location.href = `/projects/${imported.id}/step1`
      } catch (err) {
        alert(`Could not import project: ${err instanceof Error ? err.message : 'Invalid file'}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="app-shell">
      <header className="hero-bar">
        <div className="hero-top">
          <div className="hero-brand">
            <img className="logo" src="/assets/TAL-Logo-White.png" alt="TAL" />
            <div className="divider" />
            <div className="app-name">
              <div className="product">Fleet Calculator</div>
              <div className="version mono">Enterprise AGV/AMR Sizing Tool</div>
            </div>
          </div>
        </div>
      </header>

      <div className="workspace">
        <div className="landing">
          <h1>Fleet Calculator</h1>
          <p className="tagline">
            Size AGV/AMR fleets for warehouse automation. Size vehicles, model material flows,
            and generate customer-facing proposals.
          </p>

          <div className="row" style={{ gap: 10 }}>
            <Link href="/projects/new" className="btn primary" style={{ display: 'inline-flex' }}>
              + New Project
            </Link>
            <label className="btn ghost" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              Import Project
              <input type="file" accept="application/json,.json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>

          {mounted && projects.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: '32px 0 12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Recent Projects
              </h2>
              <div className="project-list">
                {projects.map(p => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}/step${p.step1Complete ? '2' : '1'}`}
                    className="project-row"
                  >
                    <div>
                      <div className="proj-name">{p.projectName}</div>
                      <div className="proj-meta">
                        {p.customerName}
                        {p.facilityLocation ? ` · ${p.facilityLocation}` : ''}
                        {p.bastianRep ? ` · ${p.bastianRep}` : ''}
                      </div>
                    </div>
                    <div className="proj-version">{p.versionNumber}</div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {mounted && projects.length === 0 && (
            <div className="empty-state" style={{ marginTop: 48, textAlign: 'left', padding: 0 }}>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                No projects yet. Create your first project or import an existing one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
