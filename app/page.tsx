export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { db } from '@/src/lib/db'

async function getProjects() {
  try {
    return await db.project.findMany({
      select: {
        id: true,
        projectName: true,
        customerName: true,
        facilityLocation: true,
        versionNumber: true,
        bastianRep: true,
        step1Complete: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })
  } catch {
    return [] as { id: string; projectName: string; customerName: string; facilityLocation: string | null; versionNumber: string; bastianRep: string | null; step1Complete: boolean; updatedAt: Date }[]
  }
}

export default async function HomePage() {
  const projects = await getProjects()

  return (
    <div className="app-shell">
      {/* Minimal header */}
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

          <Link href="/projects/new" className="btn primary" style={{ display: 'inline-flex' }}>
            + New Project
          </Link>

          {projects.length > 0 && (
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

          {projects.length === 0 && (
            <div className="empty-state" style={{ marginTop: 48, textAlign: 'left', padding: 0 }}>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                No projects yet. Create your first project to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
