'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import ApplicationForm from '@/src/components/step1/ApplicationForm'
import { getProject, type StoredProject } from '@/src/lib/storage'
import { useUnitSystem } from '@/src/lib/uiPrefs'

export default function Step1Page() {
  const params = useParams()
  const id = params.id as string
  const [project, setProject] = useState<StoredProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  useEffect(() => {
    setProject(getProject(id))
    setLoading(false)
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
          projectName: project.projectName ?? '',
          customerName: project.customerName ?? '',
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
        }}
        currentStep={1}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
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
