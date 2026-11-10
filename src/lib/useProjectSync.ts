'use client'

import { useEffect } from 'react'
import { getProject, subscribeProjects, type StoredProject } from './storage'

/**
 * Keep a page's copy of a project in step with storage: same-tab writes (undo, header edits),
 * other tabs (storage.ts merges their writes and notifies) and the window regaining focus.
 * `onChange` receives the stored project; a missing project is left to the page's own load.
 */
export function useProjectSync(id: string, onChange: (project: StoredProject) => void): void {
  useEffect(() => {
    const refresh = () => { const p = getProject(id); if (p) onChange(p) }
    const unsub = subscribeProjects(refresh)
    window.addEventListener('focus', refresh)
    return () => { unsub(); window.removeEventListener('focus', refresh) }
  }, [id, onChange])
}
