'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import ApplicationForm from '@/src/components/step1/ApplicationForm'
import type { UnitSystem } from '@/src/lib/utils/units'

interface ProjectData {
  id: string
  projectName: string
  customerName: string
  facilityLocation?: string | null
  versionNumber: string
  bastianRep?: string | null
  step1Complete: boolean
  step2Complete: boolean
  [key: string]: unknown
}

export default function Step1Page() {
  const params = useParams()
  const id = params.id as string
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(d => { setProject(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return (
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
          projectName: project.projectName,
          customerName: project.customerName,
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={1}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
      />
      <div className="workspace">
        <ApplicationForm
          initialData={project as Parameters<typeof ApplicationForm>[0]['initialData']}
          projectId={id}
          unitSystem={unitSystem}
        />
      </div>
    </div>
  )
}
