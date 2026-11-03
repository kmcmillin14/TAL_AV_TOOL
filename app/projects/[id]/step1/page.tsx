'use client'

import { useEffect, useRef, useState } from 'react'
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
  // Bumped only on undo to remount the form with restored values. Not bumped on
  // normal saves (that would steal focus mid-edit) — the form owns its own state.
  const [formKey, setFormKey] = useState(0)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()

  useEffect(() => {
    setProject(getProject(id))
    setLoading(false)
  }, [id])

  // Scroll to a #section-NN hash once the form has actually rendered (e.g.
  // Step 4's "jump to what's missing" links). The browser's own hash-scroll
  // fires at navigation time, before `project` has loaded and ApplicationForm
  // has mounted its sections — by then the target id doesn't exist yet, so
  // the native scroll silently does nothing and nothing re-triggers it.
  // `loading` turning false only means React has scheduled the form's render,
  // not that it's painted, so this polls a few frames rather than assuming
  // one is enough.
  useEffect(() => {
    if (loading) return
    const hash = window.location.hash.slice(1)
    if (!hash) return
    let frame = 0
    let raf = 0
    const tryScroll = () => {
      const el = document.getElementById(hash)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
      if (++frame < 20) raf = requestAnimationFrame(tryScroll)
    }
    raf = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(raf)
  }, [loading])

  // Undo and programmatic value injections (pallet auto-fill, flow duplicate) write
  // to storage in place; re-read and remount the form so uncontrolled inputs pick
  // up the corrected values through their unit-aware `defaultValue`.
  useEffect(() => {
    const reload = () => {
      const p = getProject(id)
      if (p) { setProject(p); setFormKey(k => k + 1) }
    }
    window.addEventListener('tal:undo', reload)
    window.addEventListener('tal:form-reload', reload)
    return () => {
      window.removeEventListener('tal:undo', reload)
      window.removeEventListener('tal:form-reload', reload)
    }
  }, [id])

  // Remount the form on a unit toggle. The inputs are uncontrolled
  // (defaultValue), so a changed unit alone doesn't refresh them — without a
  // remount they show the old-unit number under the new-unit label and the next
  // edit mis-parses (kg read as lbs), inflating the stored value. Re-read from
  // storage first so autosaved edits survive the remount. Skip the first run
  // (initial mount / localStorage hydration).
  const firstUnitRun = useRef(true)
  useEffect(() => {
    if (firstUnitRun.current) { firstUnitRun.current = false; return }
    const p = getProject(id)
    if (p) { setProject(p); setFormKey(k => k + 1) }
  }, [unitSystem, id])

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
          opportunityNumber: project.opportunityNumber,
          opportunityType: project.opportunityType,
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
          key={formKey}
          initialData={project as Parameters<typeof ApplicationForm>[0]['initialData']}
          projectId={id}
          unitSystem={unitSystem}
        />
      </div>
    </div>
  )
}
