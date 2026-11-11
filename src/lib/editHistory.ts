// One undo step of the Simulate layout editor: the layout before/after, and only the flow fields
// the step changed. Undo puts back just those fields, so a Sizing edit made meanwhile (another tab,
// merged by storage.ts) to a field this step did not touch survives the undo. PURE.

type Row = { id: string }

export interface FlowPatch<F extends Row> { id: string; before: F | null; after: F | null }
export interface EditStep<L, F extends Row> { before: L; after: L; flows: FlowPatch<F>[] }

/** The flows a step added, removed or changed (by id). */
export function diffRows<F extends Row>(prev: F[], next: F[]): FlowPatch<F>[] {
  const a = new Map(prev.map(f => [f.id, f])), b = new Map(next.map(f => [f.id, f]))
  const ids = [...new Set([...a.keys(), ...b.keys()])]
  return ids.filter(id => a.get(id) !== b.get(id)).map(id => ({ id, before: a.get(id) ?? null, after: b.get(id) ?? null }))
}

/** Two steps as one (typing in a field): the first step's before, the second step's after. */
export function joinSteps<L, F extends Row>(first: EditStep<L, F>, second: EditStep<L, F>): EditStep<L, F> {
  const flows = new Map(first.flows.map(p => [p.id, p]))
  for (const p of second.flows) flows.set(p.id, { id: p.id, before: flows.get(p.id)?.before ?? p.before, after: p.after })
  return { before: first.before, after: second.after, flows: [...flows.values()] }
}

/** Apply a step's flow changes towards `to` ('before' = undo, 'after' = redo) on the current rows:
 *  a row the step added or removed is removed or restored; on a changed row only the fields that
 *  differ between the step's two sides are set. */
export function applyRows<F extends Row>(current: F[], patches: FlowPatch<F>[], to: 'before' | 'after'): F[] {
  const from = to === 'before' ? 'after' : 'before'
  let rows = [...current]
  for (const p of patches) {
    const target = p[to], other = p[from]
    const i = rows.findIndex(r => r.id === p.id)
    if (!target) { if (i >= 0) rows = rows.filter(r => r.id !== p.id); continue }
    if (i < 0) { rows.push(target); continue }
    const changed = other ? (Object.keys({ ...target, ...other }) as (keyof F)[]).filter(k => target[k] !== other[k]) : (Object.keys(target) as (keyof F)[])
    const row = { ...rows[i] }
    for (const k of changed) row[k] = target[k]
    rows[i] = row
  }
  return rows
}
