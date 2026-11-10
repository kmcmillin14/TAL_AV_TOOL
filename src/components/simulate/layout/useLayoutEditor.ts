'use client'

// Layout editor state (spec v2 §5). The stored project is the only source: each edit writes the
// layout and the flows together through storage.ts, and the page re-reads them. This hook only
// keeps the undo/redo history (whole snapshots — layouts are small) for the session.

import { useCallback, useRef, useState } from 'react'
import { emptyLayout, measureFlows } from '@/src/calc/sim/layoutEdit'
import { updateProject, type StoredProject } from '@/src/lib/storage'

export type ProjectFlow = NonNullable<StoredProject['flows']>[number]
/** The stored layout: the calc shape plus the drawing's details (its image stays in memory). */
export type EditorLayout = NonNullable<StoredProject['simLayout']>
export interface LayoutDoc { layout: EditorLayout; flows: ProjectFlow[] }

const HISTORY = 100
const MERGE_MS = 1500

export function useLayoutEditor(project: StoredProject) {
  const doc: LayoutDoc = { layout: project.simLayout ?? emptyLayout(), flows: project.flows ?? [] }
  const docRef = useRef(doc)
  docRef.current = doc
  // History lives in refs (read and written outside render); `bump` re-renders for the buttons.
  const past = useRef<LayoutDoc[]>([])
  const future = useRef<LayoutDoc[]>([])
  const [, bump] = useState(0)

  /** Write a snapshot. Linked flows are re-measured on the layout (distance and lift height) —
   *  only when the layout changed or a flow was linked; a moves/h edit needs no measuring. */
  const save = useCallback((next: LayoutDoc) => {
    const prev = docRef.current
    const flows = next.layout === prev.layout && next.flows.length === prev.flows.length
      && next.flows.every((f, i) => f.fromPointId === prev.flows[i].fromPointId && f.toPointId === prev.flows[i].toPointId)
      ? next.flows : measureFlows(next.layout, next.flows)
    updateProject(project.id, { simLayout: next.layout, flows })
    bump(n => n + 1)
  }, [project.id])

  const lastMerge = useRef<{ key: string; at: number } | null>(null)
  /** Apply an edit as one undo step. Edits with the same `merge` key within a moment (typing in
   *  one field) share a step, so undo reverts the whole word, not one letter. */
  const commit = useCallback((next: LayoutDoc, merge?: string) => {
    const now = Date.now(), last = lastMerge.current
    const joins = merge && last?.key === merge && now - last.at < MERGE_MS
    if (!joins) {
      past.current = [...past.current.slice(-(HISTORY - 1)), docRef.current]
      future.current = []
    }
    lastMerge.current = merge ? { key: merge, at: now } : null
    save(next)
  }, [save])

  const undo = useCallback(() => {
    const prev = past.current.at(-1)
    if (!prev) return
    lastMerge.current = null
    past.current = past.current.slice(0, -1)
    future.current = [docRef.current, ...future.current]
    save(prev)
  }, [save])

  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return
    lastMerge.current = null
    future.current = future.current.slice(1)
    past.current = [...past.current, docRef.current]
    save(next)
  }, [save])

  /** The latest stored layout and flows — for edits that finish after an await (a drawing loading). */
  const latest = useCallback(() => docRef.current, [])
  return { doc, latest, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}
