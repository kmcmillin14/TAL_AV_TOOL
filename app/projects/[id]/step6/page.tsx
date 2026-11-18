'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { headerFromProject } from '@/src/lib/projectHeader'
import Icon from '@/src/design-system/components/Icon'
import { useFleetData } from '@/src/lib/useFleetData'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import ExportPanel from '@/src/components/rom/ExportPanel'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const { project, loading, error } = useFleetData(id)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  if (loading) return <div className="app-shell"><div className="step2-loading">Loading export…</div></div>
  if (error || !project) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{error ?? 'This project does not exist in your browser. Try importing the project file or creating a new project.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <PersistentHeader project={headerFromProject(project)} currentStep={6} unitSystem={unitSystem} onUnitToggle={toggleUnitSystem} />
      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 06 / 06</span>
          <h1 className="eh-title">Export</h1>
        </div>

        <ExportPanel project={project} />

        <div className="step-nav">
          <Link href={`/projects/${id}/step5`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
