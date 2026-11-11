'use client'

// Layout editor state (spec v2 §5). The stored project is the only source: each edit writes the
// layout and the flows together through storage.ts, and the page re-reads them. This hook keeps the
// session's undo/redo history: each step holds the layout before/after and only the flow fields it
// changed (src/lib/editHistory.ts), so undo never reverts a Sizing edit made meanwhile.

import { useCallback, useRef, useState } from 'react'
import { emptyLayout, measureFlows } from '@/src/calc/sim/layoutEdit'
import { applyRows, diffRows, joinSteps, type EditStep } from '@/src/lib/editHistory'
import { updateProject, type StoredProject } from '@/src/lib/storage'

export type ProjectFlow = NonNullable<StoredProject['flows']>[number]
/** The stored layout: the calc shape plus the drawing's details (its image stays in memory). */
export type EditorLayout = NonNullable<StoredProject['simLayout']>
export interface LayoutDoc { layout: EditorLayout; flows: ProjectFlow[] }
type Step = EditStep<EditorLayout, ProjectFlow>

const HISTORY = 100
const MERGE_MS = 1500

/** `radiusFor` gives a vehicle's turning radius, ft: linked flows are measured on the layout that
 *  vehicle drives, corners rounded (spec §5.5). */
export function useLayoutEditor(project: StoredProject, radiusFor: (vehicleId?: string) => number) {
  const doc: LayoutDoc = { layout: project.simLayout ?? emptyLayout(), flows: project.flows ?? [] }
  const docRef = useRef(doc)
  docRef.current = doc
  // History lives in refs (read and written outside render); `bump` re-renders for the buttons.
  const past = useRef<Step[]>([])
  const future = useRef<Step[]>([])
  const lastMerge = useRef<{ key: string; at: number } | null>(null)
  const [, bump] = useState(0)

  /** Write a document. Linked flows are re-measured on the layout (distance and lift height) —
   *  only when the layout, a link or a flow's vehicle changed; a moves/h edit needs no measuring. */
  const save = useCallback((next: LayoutDoc) => {
    const prev = docRef.current
    const sameLinks = next.layout === prev.layout && next.flows.length === prev.flows.length
      && next.flows.every((f, i) => {
        const o = prev.flows[i]
        return f.fromPointId === o.fromPointId && f.toPointId === o.toPointId && f.vehicleId === o.vehicleId
      })
    updateProject(project.id, { simLayout: next.layout, flows: sameLinks ? next.flows : measureFlows(next.layout, next.flows, radiusFor) })
    bump(n => n + 1)
  }, [project.id, radiusFor])

  /** Apply an edit as one undo step. Edits with the same `merge` key within a moment (typing in
   *  one field) share a step, so undo reverts the whole word, not one letter. */
  const commit = useCallback((next: LayoutDoc, merge?: string) => {
    const now = Date.now(), last = lastMerge.current
    const cur = docRef.current
    const step: Step = { before: cur.layout, after: next.layout, flows: diffRows(cur.flows, next.flows) }
    const prior = past.current.at(-1)
    past.current = merge && prior && last?.key === merge && now - last.at < MERGE_MS
      ? [...past.current.slice(0, -1), joinSteps(prior, step)]
      : [...past.current.slice(-(HISTORY - 1)), step]
    future.current = []
    lastMerge.current = merge ? { key: merge, at: now } : null
    save(next)
  }, [save])

  const undo = useCallback(() => {
    const step = past.current.at(-1)
    if (!step) return
    lastMerge.current = null
    past.current = past.current.slice(0, -1)
    future.current = [step, ...future.current]
    save({ layout: step.before, flows: applyRows(docRef.current.flows, step.flows, 'before') })
  }, [save])

  const redo = useCallback(() => {
    const step = future.current[0]
    if (!step) return
    lastMerge.current = null
    future.current = future.current.slice(1)
    past.current = [...past.current, step]
    save({ layout: step.after, flows: applyRows(docRef.current.flows, step.flows, 'after') })
  }, [save])

  /** The latest stored layout and flows — for edits that finish after an await (a drawing loading). */
  const latest = useCallback(() => docRef.current, [])
  return { doc, latest, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}
