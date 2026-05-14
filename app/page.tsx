'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { findOrCreateEntryProject } from '@/src/lib/storage'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const project = findOrCreateEntryProject()
    router.replace(`/projects/${project.id}/step0`)
  }, [router])

  return (
    <div className="app-shell">
      <div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Loading…</div>
    </div>
  )
}
