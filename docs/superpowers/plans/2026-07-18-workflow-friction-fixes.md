# Workflow Friction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six approved workflow features from `docs/superpowers/specs/2026-07-18-workflow-friction-fixes-design.md`: flow paste-import, save-drop warnings, undo-delete toast, Cmd+Z + keyboard reorder, qualification-aware vehicle select, and a loadable sample project.

**Architecture:** No calc changes. New pure parser in `src/lib/flowImport.ts`; storage gains a `subscribeSaveDrops` event; everything else is component-level work that flows through the existing `onPatch`/`updateProject` paths. Step 3 additions import only shared `src/calc`/`src/lib` modules (ARCHITECTURE §4 — never Step 2 internals).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, React Hook Form 7 + Zod 4, Vitest. All persistence via `src/lib/storage.ts`. Toyota Type fonts only; any new CSS uses existing tokens in `app/globals.css`.

**Binding conventions (every task):** work from repo root `/Users/kylemcmillin/Desktop/TAL AV Eng Tool/tal-fleet-calculator` on branch `main`; commit per task, push only in the final task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Docs land first (Task 1) — the pre-commit hook checks CHANGELOG for architecture-adjacent changes. HARD RULE: nothing may auto-select a vehicle (F5 is ordering/labeling only).

---

### Task 1: Docs first — SPECIFICATION.md + CHANGELOG.md

**Files:**
- Modify: `docs/SPECIFICATION.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1:** In SPECIFICATION.md, make these additions (anchor each to the named section; keep surrounding text):
  - **Step 0 section:** add a bullet: `**Load sample project** — a tertiary action under the Import card creates a NEW project from the bundled Michelin sample (src/content/samples/michelin-project.json, same {schemaVersion, project} envelope as JSON import) via the normal Zod/storage path and opens its Step 1. Never touches the current project.`
  - **Step 1 section:** add: `**Save-drop warnings** — when the keystroke autosave's salvage parse drops an out-of-range field (e.g. shiftsPerDay 4 > max 3), storage emits a save-drop event and the form shows "Not saved — <zod message>" inline under that field (via the form's existing error slot); the warning clears when the field next changes.`
  - **Step 3 — Material Flows section:** add bullets: `**Import flows** — an inline paste panel (no modal) next to “+ Add flow”: paste spreadsheet rows (TSV/CSV, header auto-detect: origin/from · destination/to · distance [(m) converts to ft] · moves/thru/rate · lift/height; headerless input assumes origin, destination, distance, thru[, lift] order) → preview + skipped-row reasons → “Add N flows”. Parser is pure (src/lib/flowImport.ts).` · `**Undo delete** — deleting a flow shows a 5 s “Flow deleted — Undo” toast (aria-live polite) that restores it at its original index.` · `**Keyboard reorder** — the drag handle is a focusable button; ArrowUp/ArrowDown moves the flow (crossing a boundary adopts the neighbor’s group).` · `**Vehicle select ordering** — options sort GREEN · YELLOW · INCOMPLETE · RED from the shared qualification calc, RED suffixed “— not qualified”; all options remain selectable (engineer always assigns — ordering only).`
  - **Header/chrome section (where the Undo button is described):** add: `Cmd/Ctrl+Z triggers app Undo when focus is NOT in a text input/textarea/select/contentEditable (native text undo wins inside fields).`
- [ ] **Step 2:** Add a CHANGELOG entry at top:

```markdown
## 2026-07-18 — Workflow friction fixes (6): flow import, save-drop warnings, undo toast, keyboard, select ordering, sample project

- Step 3: inline paste-import panel for flows (pure parser `src/lib/flowImport.ts`, TSV/CSV,
  header auto-detect, meters→feet); undo-delete toast; ArrowUp/Down reorder on the focusable
  drag handle; vehicle select sorted by qualification (GREEN first, RED labeled — never auto-selects).
- Step 1: `subscribeSaveDrops` storage event surfaces salvage-parse drops as inline field
  warnings (silent-drop fix).
- Header: Cmd/Ctrl+Z app undo (guarded — native text undo wins inside fields).
- Step 0: "Load sample project" creates a new project from
  `src/content/samples/michelin-project.json` (Michelin Greenville scenario incl. flow +
  CB18 assignment) through the normal import path.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: spec + changelog for workflow friction fixes (docs-first)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: F1 parser — `src/lib/flowImport.ts` (TDD)

**Files:**
- Create: `src/lib/flowImport.ts`
- Test: `src/lib/__tests__/flowImport.test.ts`

- [ ] **Step 1: Write the failing tests** — create `src/lib/__tests__/flowImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFlowImport } from '../flowImport'

describe('parseFlowImport', () => {
  it('parses TSV with a header row (synonyms, any order)', () => {
    const text = 'From\tTo\tDist (ft)\tMoves/hr\tLift height\nDock A\tStorage 1\t300\t55\t18\nDock B\tStorage 2\t450\t20\t0'
    const r = parseFlowImport(text)
    expect(r.headerDetected).toBe(true)
    expect(r.rows).toEqual([
      { origin: 'Dock A', destination: 'Storage 1', distanceFt: 300, thruPerHr: 55, liftHeightFt: 18 },
      { origin: 'Dock B', destination: 'Storage 2', distanceFt: 450, thruPerHr: 20, liftHeightFt: 0 },
    ])
    expect(r.skipped).toEqual([])
  })

  it('headerless CSV assumes origin, destination, distance, thru[, lift] order', () => {
    const r = parseFlowImport('Dock A,Rack 1,300,55\nDock B,Rack 2,120,10,4')
    expect(r.headerDetected).toBe(false)
    expect(r.rows[0]).toEqual({ origin: 'Dock A', destination: 'Rack 1', distanceFt: 300, thruPerHr: 55, liftHeightFt: 0 })
    expect(r.rows[1].liftHeightFt).toBe(4)
  })

  it('converts meters to feet when the distance header says (m)', () => {
    const r = parseFlowImport('origin\tdest\tdistance (m)\trate\nA\tB\t100\t10')
    expect(r.metersConverted).toBe(true)
    expect(r.rows[0].distanceFt).toBeCloseTo(328.1, 1)
  })

  it('skips bad rows with a line number and reason, keeps good ones', () => {
    const r = parseFlowImport('A,B,300,55\n,,100,5\nC,D,abc,5')
    expect(r.rows).toHaveLength(1)
    expect(r.skipped).toEqual([
      { line: 2, reason: 'no origin or destination' },
      { line: 3, reason: 'distance is not a number' },
    ])
  })

  it('handles thousands separators and quoted CSV cells', () => {
    const r = parseFlowImport('"Dock, North",Rack 1,"1,200",55')
    expect(r.rows[0]).toEqual({ origin: 'Dock, North', destination: 'Rack 1', distanceFt: 1200, thruPerHr: 55, liftHeightFt: 0 })
  })

  it('blank numeric cells default to 0; blank/whitespace input yields nothing', () => {
    expect(parseFlowImport('A,B,,').rows[0]).toEqual({ origin: 'A', destination: 'B', distanceFt: 0, thruPerHr: 0, liftHeightFt: 0 })
    expect(parseFlowImport('  \n \n').rows).toEqual([])
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/__tests__/flowImport.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** — create `src/lib/flowImport.ts`:

```ts
// Pure spreadsheet-paste parser for Step 3 flow import. No React, no storage.
// Input: raw clipboard/CSV text. Output: typed rows + per-line skip reasons —
// never guesses on unparseable data (spec 2026-07-18-workflow-friction-fixes).

export interface ParsedFlowRow {
  origin: string
  destination: string
  distanceFt: number
  thruPerHr: number
  liftHeightFt: number
}

export interface FlowImportResult {
  rows: ParsedFlowRow[]
  skipped: { line: number; reason: string }[]
  headerDetected: boolean
  metersConverted: boolean
}

type Col = 'origin' | 'destination' | 'distance' | 'thru' | 'lift'

const SYNONYMS: Record<Col, RegExp> = {
  origin: /^(origin|from|start)/i,
  destination: /^(dest|to$|to\b|end)/i,
  distance: /(distance|dist\b|length)/i,
  thru: /(moves|thru|throughput|rate|trips|cycles)/i,
  lift: /(lift|height)/i,
}
const DEFAULT_ORDER: Col[] = ['origin', 'destination', 'distance', 'thru', 'lift']
const M_TO_FT = 3.28084

/** Split one line on the delimiter, honoring double-quoted cells ("a, b"). */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === delim && !inQuotes) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function toNum(cell: string): number | null {
  if (cell === '') return 0
  const n = Number(cell.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseFlowImport(text: string): FlowImportResult {
  const allLines = text.split(/\r?\n/)
  const delim = text.includes('\t') ? '\t' : ','

  // Header detect on the first non-empty line: ≥2 synonym hits → header row.
  let colMap: Partial<Record<Col, number>> = {}
  let headerDetected = false
  let metersConverted = false
  let headerLineIdx = -1
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim() === '') continue
    const cells = splitLine(allLines[i], delim)
    const found: Partial<Record<Col, number>> = {}
    for (const [col, re] of Object.entries(SYNONYMS) as [Col, RegExp][]) {
      const idx = cells.findIndex(c => re.test(c))
      if (idx !== -1 && found[col] === undefined) found[col] = idx
    }
    if (Object.keys(found).length >= 2) {
      headerDetected = true
      colMap = found
      headerLineIdx = i
      const distCell = found.distance !== undefined ? cells[found.distance] : ''
      metersConverted = /\(m\)|meter/i.test(distCell)
    }
    break // only the first non-empty line is a header candidate
  }
  if (!headerDetected) DEFAULT_ORDER.forEach((c, i) => { colMap[c] = i })

  const rows: ParsedFlowRow[] = []
  const skipped: { line: number; reason: string }[] = []
  for (let i = 0; i < allLines.length; i++) {
    if (i === headerLineIdx || allLines[i].trim() === '') continue
    const lineNo = i + 1
    const cells = splitLine(allLines[i], delim)
    const cell = (c: Col) => (colMap[c] !== undefined ? (cells[colMap[c]!] ?? '') : '')
    const origin = cell('origin')
    const destination = cell('destination')
    if (!origin && !destination) { skipped.push({ line: lineNo, reason: 'no origin or destination' }); continue }
    const dist = toNum(cell('distance'))
    if (dist === null) { skipped.push({ line: lineNo, reason: 'distance is not a number' }); continue }
    const thru = toNum(cell('thru'))
    if (thru === null) { skipped.push({ line: lineNo, reason: 'throughput is not a number' }); continue }
    const lift = toNum(cell('lift'))
    if (lift === null) { skipped.push({ line: lineNo, reason: 'lift height is not a number' }); continue }
    rows.push({
      origin, destination,
      distanceFt: metersConverted ? Math.round(dist * M_TO_FT * 10) / 10 : dist,
      thruPerHr: thru,
      liftHeightFt: metersConverted ? Math.round(lift * M_TO_FT * 10) / 10 : lift,
    })
  }
  return { rows, skipped, headerDetected, metersConverted }
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/__tests__/flowImport.test.ts` — Expected: 6 passed. If the quoted-CSV or `to` synonym test fails, fix the regex/split (do not weaken the test).
- [ ] **Step 5: Commit**

```bash
git add src/lib/flowImport.ts src/lib/__tests__/flowImport.test.ts
git commit -m "feat(step3): pure spreadsheet-paste parser for flow import

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: F1 UI — FlowImportPanel + FlowsTable wiring

**Files:**
- Create: `src/components/step3/FlowImportPanel.tsx`
- Modify: `src/components/step3/FlowsTable.tsx` (actions row ~285-299, empty state ~292-299)
- Modify: `app/globals.css` (new `.flow-import-*` styles near the `.flows-table-head` rules)

- [ ] **Step 1: Create the panel component:**

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { parseFlowImport, type ParsedFlowRow } from '@/src/lib/flowImport'

interface Props {
  onAdd: (rows: ParsedFlowRow[]) => void
}

const PLACEHOLDER =
  'Paste rows from Excel/Sheets — columns: Origin, Destination, Distance (ft), Moves/hr, Lift height (optional).\nA header row is detected automatically.'

/** Inline paste-import panel (no modal — app convention is inline editing).
 *  Pure parsing lives in src/lib/flowImport.ts; this only previews + confirms. */
export default function FlowImportPanel({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseFlowImport(text) : null), [text])

  const close = () => { setOpen(false); setText('') }
  const readFile = async (f: File | undefined) => {
    if (!f) return
    setText(await f.text())
  }

  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Icon name="upload" size={13} /> Import flows
      </button>
      {open && (
        <div className="flow-import-panel">
          <textarea
            className="flow-import-text mono"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={5}
            aria-label="Paste flow rows"
          />
          <div className="flow-import-foot">
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
              or choose a .csv
            </button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden
              onChange={e => readFile(e.target.files?.[0])} />
            {parsed && parsed.skipped.length > 0 && (
              <span className="flow-import-skips" title={parsed.skipped.map(s => `line ${s.line}: ${s.reason}`).join('\n')}>
                {parsed.skipped.length} row{parsed.skipped.length === 1 ? '' : 's'} skipped
              </span>
            )}
            <span className="flow-import-spacer" />
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={!parsed || parsed.rows.length === 0}
              onClick={() => { if (parsed) { onAdd(parsed.rows); close() } }}
            >
              Add {parsed?.rows.length ?? 0} flow{(parsed?.rows.length ?? 0) === 1 ? '' : 's'}
            </button>
          </div>
          {parsed && parsed.rows.length > 0 && (
            <table className="flow-import-preview mono">
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.origin || '—'}</td><td>→ {r.destination || '—'}</td>
                    <td className="num">{r.distanceFt} ft</td>
                    <td className="num">{r.thruPerHr}/hr</td>
                    <td className="num">{r.liftHeightFt > 0 ? `${r.liftHeightFt} ft lift` : ''}</td>
                  </tr>
                ))}
                {parsed.rows.length > 8 && (
                  <tr><td colSpan={5}>… +{parsed.rows.length - 8} more</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
```

Note: check `src/design-system/components/Icon` for an existing `upload` (or similar, e.g. `import`/`arrowUp`) icon name and use a real one — do not add an emoji or a new font.

- [ ] **Step 2: Wire into FlowsTable.** In the `flows-actions` div (next to the `+ Group` button) add `<FlowImportPanel onAdd={addImported} />`, with (near the other CRUD helpers):

```ts
const addImported = (rows: import('@/src/lib/flowImport').ParsedFlowRow[]) =>
  onPatch({
    flows: [
      ...flows,
      ...rows.map(r => ({
        id: genId(),
        origin: r.origin,
        destination: r.destination,
        distanceFt: r.distanceFt,
        thruPerHr: r.thruPerHr,
        routeLayout: 'medium' as const,
        liftHeightFt: r.liftHeightFt,
      })),
    ],
  })
```

Because the panel must render below the actions row, place `<FlowImportPanel>` as a sibling AFTER `.flows-table-head` if rendering inside the actions div clips it — check the DOM and pick the placement where the expanded panel spans full width. Also append to the empty-state `<p>`: `… — or paste rows from a spreadsheet with <strong>Import flows</strong> above.`

- [ ] **Step 3: CSS** — add near the `.flows-table-head` rules in `app/globals.css` (existing tokens only):

```css
.flow-import-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; background: var(--surface); }
.flow-import-text { width: 100%; resize: vertical; font-size: 12px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text-primary); }
.flow-import-foot { display: flex; align-items: center; gap: 8px; }
.flow-import-spacer { flex: 1; }
.flow-import-skips { font-size: 12px; color: var(--warn, #b45309); cursor: help; }
.flow-import-preview { font-size: 12px; color: var(--text-secondary); border-collapse: collapse; }
.flow-import-preview td { padding: 2px 10px 2px 0; }
.flow-import-preview .num { text-align: right; }
```

Check the file's real token names first (`--surface`, `--warn`, etc. — grep neighbors like `.engine-panel`); substitute the actual tokens used by sibling rules.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run src/components/step3 src/lib` green; `npm run check:arch` pass. CSS changed → note for final smoke: clean dev-server restart.
- [ ] **Step 5: Commit**

```bash
git add src/components/step3/FlowImportPanel.tsx src/components/step3/FlowsTable.tsx app/globals.css
git commit -m "feat(step3): inline paste-import panel for flows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: F2 — save-drop event + inline warnings (TDD on storage)

**Files:**
- Modify: `src/lib/storage.ts` (salvageParse ~254-266, updateProject ~290, createProject ~268)
- Modify: `src/components/step1/ApplicationForm.tsx`
- Test: `src/lib/__tests__/storage.test.ts` (append; if the suite file has a different name, find it via `ls src/lib/__tests__`)

- [ ] **Step 1: Failing test** — append to the storage test file:

```ts
import { subscribeSaveDrops, createProject as createP, updateProject as updateP, resetProjectsCache } from '../storage'

describe('subscribeSaveDrops', () => {
  it('fires with key + zod message when a field is dropped, not on clean saves', () => {
    resetProjectsCache()
    const p = createP({})
    const events: { key: string; message: string }[][] = []
    const unsub = subscribeSaveDrops(d => events.push(d))
    updateP(p.id, { shiftsPerDay: 4 } as never)     // max 3 → dropped
    updateP(p.id, { shiftsPerDay: 2 } as never)     // clean → no event
    unsub()
    expect(events).toHaveLength(1)
    expect(events[0][0].key).toBe('shiftsPerDay')
    expect(events[0][0].message.length).toBeGreaterThan(0)
  })
})
```

(Match the surrounding file's existing import style/aliases; `as never` bypasses the compile-time type so the runtime salvage path is exercised.)

- [ ] **Step 2:** Run the storage test file — Expected: FAIL (`subscribeSaveDrops` not exported).
- [ ] **Step 3: Implement in storage.ts.** Add beside the other listener sets:

```ts
/** A field the salvage parse dropped from a save (out-of-range etc.). */
export interface SaveDrop { key: string; message: string }
const dropListeners = new Set<(drops: SaveDrop[]) => void>()
/** Subscribe to salvage-parse drops — fired when a save silently discarded ≥1
 *  field, so forms can warn inline instead of losing data invisibly. */
export function subscribeSaveDrops(cb: (drops: SaveDrop[]) => void): () => void {
  dropListeners.add(cb)
  return () => { dropListeners.delete(cb) }
}
function notifyDrops(drops: SaveDrop[]): void {
  if (drops.length) for (const cb of dropListeners) cb(drops)
}
```

Change `salvageParse` to also collect drops (signature `{ valid: Record<string, unknown>; drops: SaveDrop[] }`):

```ts
function salvageParse(input: PartialProjectFormData): { valid: Record<string, unknown>; drops: SaveDrop[] } {
  const full = partialProjectSchema.safeParse(input)
  if (full.success) return { valid: full.data as Record<string, unknown>, drops: [] }
  const valid: Record<string, unknown> = {}
  const drops: SaveDrop[] = []
  const raw = input as Record<string, unknown>
  for (const key of Object.keys(input)) {
    const single = partialProjectSchema.safeParse({ [key]: raw[key] })
    if (single.success && key in (single.data as Record<string, unknown>)) {
      valid[key] = (single.data as Record<string, unknown>)[key]
    } else if (!single.success) {
      drops.push({ key, message: single.error.issues[0]?.message ?? 'Invalid value' })
    }
  }
  return { valid, drops }
}
```

Update the two callers: `createProject` → `const { valid } = salvageParse(input); const data = valid as PartialProjectFormData` (creation drops are not user-visible edits — no notify). `updateProject` → `const { valid: validated, drops } = salvageParse(input)` and, immediately after `writeAll(all)` (find the end of the function), add `notifyDrops(drops)`.

- [ ] **Step 4:** Run the storage tests — Expected: PASS (all existing storage tests must stay green; the salvageParse refactor touches every save path).
- [ ] **Step 5: ApplicationForm wiring.** In `ApplicationForm.tsx`: destructure `setError` and `clearErrors` from the existing `useForm` call. Add after the existing subscriptions:

```ts
// Surface salvage-parse drops (silently discarded out-of-range fields) inline,
// via RHF's error slot — the form already renders errors under fields.
useEffect(() => subscribeSaveDrops(drops => {
  for (const d of drops) {
    setError(d.key as Parameters<typeof setError>[0], { type: 'saveDrop', message: `Not saved — ${d.message}` })
  }
}), [setError])
```

Import `subscribeSaveDrops` from `@/src/lib/storage`. In the existing `watch` autosave subscription (find `watch(` — the callback receives `(value, { name })`), add at the top of the callback: `if (name && errors[name as keyof typeof errors]?.type === 'saveDrop') clearErrors(name as never)` (adapt the cast to the file's conventions).

- [ ] **Step 6: Error slots for the clamp-prone fields.** `errors.shiftsPerDay` and `errors.minAisleWidthFt` already render. Add the same block (copy the `shiftsPerDay` pattern at ~line 805) under the inputs for `hoursPerShift`, `breaksPerShift`, and `breakDurationMin` if not present:

```tsx
{errors.hoursPerShift && (
  <div className="help" style={{ color: 'var(--bad)' }}>{errors.hoursPerShift.message}</div>
)}
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit` clean; `npx vitest run` all green. Manual check deferred to final smoke (type 4 in shifts/day → inline "Not saved — …" appears; correcting clears it).
- [ ] **Step 8: Commit**

```bash
git add src/lib/storage.ts src/lib/__tests__ src/components/step1/ApplicationForm.tsx
git commit -m "feat(step1): surface salvage-parse drops as inline field warnings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: F3 — undo-delete toast (Step 3)

**Files:**
- Modify: `src/components/step3/FlowsTable.tsx` (the `remove` helper ~line 180; toast JSX at the end of the root div)
- Modify: `app/globals.css`

- [ ] **Step 1:** In FlowsTable add state + replace `remove`:

```ts
// Undo-delete: stash the last deleted flow for 5 s (spec F3). New deletion replaces it.
const [deleted, setDeleted] = useState<{ flow: Flow; index: number } | null>(null)
const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current) }, [])

const remove = (id: string) => {
  const index = flows.findIndex(f => f.id === id)
  if (index === -1) return
  setDeleted({ flow: flows[index], index })
  if (deleteTimer.current) clearTimeout(deleteTimer.current)
  deleteTimer.current = setTimeout(() => setDeleted(null), 5000)
  onPatch({ flows: flows.filter(f => f.id !== id) })
}
const undoDelete = () => {
  if (!deleted) return
  if (deleteTimer.current) clearTimeout(deleteTimer.current)
  const next = [...flows]
  next.splice(Math.min(deleted.index, next.length), 0, deleted.flow)
  onPatch({ flows: next })
  setDeleted(null)
}
```

- [ ] **Step 2:** Toast JSX as the LAST child of the root `.flows-table-wrap` div:

```tsx
{deleted && (
  <div className="flow-undo-toast" role="status" aria-live="polite">
    Flow deleted
    <button type="button" className="flow-undo-btn" onClick={undoDelete}>Undo</button>
  </div>
)}
```

- [ ] **Step 3: CSS** (tokens per neighbors; fixed, bottom-center, above content):

```css
.flow-undo-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 8px; background: var(--text-primary); color: var(--surface); font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.25); z-index: 200; }
.flow-undo-btn { background: none; border: 0; color: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; font-size: 13px; }
```

(Verify the z-index against the app's scale — grep `z-index` in globals.css and pick a value above the table chrome but below modals.)

- [ ] **Step 4:** `npx tsc --noEmit` + `npx vitest run src/components/step3` green. Commit:

```bash
git add src/components/step3/FlowsTable.tsx app/globals.css
git commit -m "feat(step3): undo-delete toast for flows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: F4 — Cmd+Z app undo + keyboard reorder

**Files:**
- Modify: `src/components/PersistentHeader.tsx` (new effect near the existing Escape/click-outside effect ~line 119)
- Modify: `src/components/step3/FlowsTable.tsx` (move helper + prop)
- Modify: `src/components/step3/FlowRow.tsx` (drag handle span → button, ~line 113)
- Modify: `app/globals.css` (button reset for the handle)

- [ ] **Step 1: PersistentHeader.** Find the existing Undo button's click handler (it calls `undoLastChange(project.id)` — reuse the SAME handler so save-status/UI side effects stay identical). Add:

```ts
// Cmd/Ctrl+Z → app undo, EXCEPT inside text fields where native text undo wins.
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
    if (!canUndo(project.id)) return
    e.preventDefault()
    handleUndo()   // ← the existing Undo-button handler's exact name in this file
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [project.id])
```

If the undo handler is inline on the button, extract it to a named `handleUndo` first and use it in both places. Ensure `handleUndo`'s dependencies make the effect deps list honest (add `handleUndo` wrapped in `useCallback` if the linter demands).

- [ ] **Step 2: FlowsTable move helper** (near the other CRUD helpers) + pass to rows:

```ts
// Keyboard reorder: swap within the flows array; crossing a boundary adopts the
// neighbor's group so the visual grouping follows the move.
const move = (id: string, dir: -1 | 1) => {
  const idx = flows.findIndex(f => f.id === id)
  const j = idx + dir
  if (idx === -1 || j < 0 || j >= flows.length) return
  const next = [...flows]
  const [f] = next.splice(idx, 1)
  const neighbor = next[Math.min(j, next.length - 1)]
  next.splice(j, 0, { ...f, sectionName: neighbor ? neighbor.sectionName : f.sectionName })
  onPatch({ flows: next })
}
```

In `renderFlowRow`, add `onMove={dir => move(f.id, dir)}`.

- [ ] **Step 3: FlowRow.** Add `onMove: (dir: -1 | 1) => void` to Props. Change the drag-handle `<span className="flow-drag-handle" …>` to a `<button type="button" …>` keeping ALL existing drag props, and add:

```tsx
onKeyDown={e => {
  if (e.key === 'ArrowUp') { e.preventDefault(); onMove(-1) }
  if (e.key === 'ArrowDown') { e.preventDefault(); onMove(1) }
}}
aria-label="Reorder flow — drag, or focus and use arrow keys"
```

(Replace the existing aria-label; keep `title="Drag to reorder"`.)

- [ ] **Step 4: CSS** — the handle is now a button; add alongside the existing `.flow-drag-handle` rule:

```css
button.flow-drag-handle { background: none; border: 0; padding: 0; color: inherit; font: inherit; }
button.flow-drag-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
```

- [ ] **Step 5:** `npx tsc --noEmit` clean; `npx vitest run` green (FlowRow has tests in `src/components/step3/__tests__` — if any renders the handle, update the expected element/role and report). Commit:

```bash
git add src/components/PersistentHeader.tsx src/components/step3 app/globals.css
git commit -m "feat: Cmd+Z app undo (field-guarded) + keyboard flow reorder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: F5 — qualification-aware vehicle select (TDD on the sort helper)

**Files:**
- Create: `src/lib/vehicleOrder.ts`
- Test: `src/lib/__tests__/vehicleOrder.test.ts`
- Modify: `app/projects/[id]/step3/page.tsx` (compute statusById, pass down)
- Modify: `src/components/engine/FlowsTab.tsx`, `src/components/step3/FlowsTable.tsx`, `src/components/step3/FlowRow.tsx` (prop drill `statusById`)
- Modify: `src/components/step3/VehicleSelect.tsx`

- [ ] **Step 1: Failing test** — `src/lib/__tests__/vehicleOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortByQualification, statusRank } from '../vehicleOrder'
import type { Vehicle } from '../vehicleLibrary'

const veh = (id: string) => ({ id, name: id.toUpperCase() } as unknown as Vehicle)

describe('sortByQualification', () => {
  it('orders GREEN, YELLOW, INCOMPLETE, RED; unknown status last; stable within a band', () => {
    const vehicles = [veh('a'), veh('b'), veh('c'), veh('d'), veh('e')]
    const status = new Map([
      ['a', 'RED'], ['b', 'GREEN'], ['c', 'INCOMPLETE'], ['d', 'YELLOW'],
    ] as const)
    const sorted = sortByQualification(vehicles, status as never)
    expect(sorted.map(v => v.id)).toEqual(['b', 'd', 'c', 'a', 'e'])
  })
  it('statusRank covers all four statuses', () => {
    expect(statusRank('GREEN')).toBeLessThan(statusRank('YELLOW'))
    expect(statusRank('YELLOW')).toBeLessThan(statusRank('INCOMPLETE'))
    expect(statusRank('INCOMPLETE')).toBeLessThan(statusRank('RED'))
  })
})
```

- [ ] **Step 2:** Run it — FAIL (module not found). **Step 3: Implement** `src/lib/vehicleOrder.ts`:

```ts
// Qualification-aware ordering for the Step 3 vehicle select. Pure. Uses the
// SHARED calc verdicts — never Step 2 internals (ARCHITECTURE §4). Ordering and
// labeling only: nothing here selects a vehicle (hard rule — engineer assigns).
import type { TrafficLightStatus } from '@/src/calc/types'
import type { Vehicle } from './vehicleLibrary'

const RANK: Record<TrafficLightStatus, number> = { GREEN: 0, YELLOW: 1, INCOMPLETE: 2, RED: 3 }

export function statusRank(s: TrafficLightStatus | undefined): number {
  return s === undefined ? 4 : RANK[s]
}

/** Stable sort by verdict band (GREEN → … → RED → unknown). */
export function sortByQualification(
  vehicles: Vehicle[],
  statusById: Map<string, TrafficLightStatus>,
): Vehicle[] {
  return [...vehicles].sort((a, b) => statusRank(statusById.get(a.id)) - statusRank(statusById.get(b.id)))
}
```

- [ ] **Step 4:** Test passes. **Step 5: Compute + drill.** In `app/projects/[id]/step3/page.tsx` (which already holds `project` and `vehicles`):

```ts
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import type { TrafficLightStatus } from '@/src/calc/types'

const statusById = useMemo<Map<string, TrafficLightStatus>>(() => {
  if (!project) return new Map()
  const req = appRequirementsFromProject(project)
  return new Map(vehicles.map(v => [v.id, qualifyVehicle(v, req).status]))
}, [project, vehicles])
```

Pass `statusById={statusById}` to `<FlowsTab>`; add the prop (`statusById: Map<string, TrafficLightStatus>`) to FlowsTab → FlowsTable → FlowRow and hand it to `<VehicleSelect statusById={statusById} …>`.

- [ ] **Step 6: VehicleSelect.** Replace the option list:

```tsx
import type { TrafficLightStatus } from '@/src/calc/types'
import { sortByQualification } from '@/src/lib/vehicleOrder'

interface Props {
  vehicles: Vehicle[]
  value?: string
  onChange: (vehicleId: string | undefined) => void
  statusById?: Map<string, TrafficLightStatus>
}

export default function VehicleSelect({ vehicles, value, onChange, statusById }: Props) {
  const ordered = statusById ? sortByQualification(vehicles, statusById) : vehicles
  return (
    <select className="flow-veh-select" value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
      <option value="">— pick vehicle —</option>
      {ordered.map(v => {
        const s = statusById?.get(v.id)
        return (
          <option key={v.id} value={v.id}>
            {v.name}{s === 'RED' ? ' — not qualified' : s === 'YELLOW' ? ' — review' : ''}
          </option>
        )
      })}
    </select>
  )
}
```

(No auto-selection anywhere; `value` handling unchanged. `<option>` can't render colored dots cross-browser — the text suffix IS the status signal; the row's existing VehicleDot stays as-is.)

- [ ] **Step 7:** `npx tsc --noEmit` clean; `npx vitest run` green (update any FlowRow/VehicleSelect test fixtures for the new optional prop). `npm run check:arch` pass (verifies no cross-step import). Commit:

```bash
git add src/lib/vehicleOrder.ts src/lib/__tests__/vehicleOrder.test.ts "app/projects/[id]/step3/page.tsx" src/components/engine/FlowsTab.tsx src/components/step3
git commit -m "feat(step3): vehicle select ordered by qualification (GREEN first — never auto-selects)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: F6 — sample project + Step 0 loader (TDD on the sample data)

**Files:**
- Create: `src/content/samples/michelin-project.json`
- Test: `src/lib/__tests__/sampleProject.test.ts`
- Modify: `app/projects/[id]/step0/page.tsx` (tertiary action under the Import card, ~lines 118-135 of the JSX)

- [ ] **Step 1: Author the sample.** Read `samples/michelin-questionnaire.json` — its `project` object holds questionnaire-shaped project fields with the REAL schema key names. Create `src/content/samples/michelin-project.json` as the same `{ "schemaVersion": <same value>, "project": { … } }` envelope, starting from a COPY of the questionnaire's `project` and adding/overriding (verify every key against `src/lib/validations/schemas.ts` — do not invent keys):
  - `"projectName": "Sample — Michelin Greenville DC"`, keep/ensure `customerName`, `facilityLocation`
  - Schedule: `"shiftsPerDay": 3, "hoursPerShift": 8, "breaksPerShift": 2, "breakDurationMin": 20` and the operating-days pattern key with the Mon–Sat value (copy the exact key/value format the questionnaire sample or schema uses)
  - Load: `"typicalUnitType"` standard pallet, `"maxLoadWeightLbs": 2200`, `"loadLengthIn": 48, "loadWidthIn": 40, "loadHeightIn": 65`
  - Transfer: `"transferType": "forklift"`, `"transferHeightFt": 18`, `"minAisleWidthFt": 11`, ambient/indoor environment keys as the schema names them
  - `"flows": [{ "id": "f_sample1", "origin": "Inbound Trailer", "destination": "Reserve Rack", "distanceFt": 300, "thruPerHr": 55, "routeLayout": "medium", "liftHeightFt": 18, "vehicleId": "cb18" }]`
- [ ] **Step 2: Failing test** — `src/lib/__tests__/sampleProject.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sample from '@/src/content/samples/michelin-project.json'
import { partialProjectSchema } from '../validations/schemas'

describe('michelin sample project', () => {
  it('parses cleanly — every field survives the schema (no silent drops)', () => {
    const r = partialProjectSchema.safeParse(sample.project)
    expect(r.success).toBe(true)
    if (r.success) {
      // No key was stripped: everything we authored is meaningful.
      for (const key of Object.keys(sample.project)) expect(r.data).toHaveProperty(key)
    }
  })
  it('carries one assigned flow that produces demand', () => {
    const f = (sample.project as { flows: Array<Record<string, unknown>> }).flows[0]
    expect(f.vehicleId).toBe('cb18')
    expect(f.distanceFt).toBe(300)
    expect(f.thruPerHr).toBe(55)
  })
})
```

(If the tsconfig JSON-import setting complains, add `resolveJsonModule` is already on for the questionnaire sample — verify by the existing imports; adapt the import to match how other code imports JSON.) Run → FAIL (file missing). Author the JSON (Step 1) → PASS. **If the schema-parse test fails on any key, fix the KEY in the JSON (consult schemas.ts), never weaken the test** — this test is what guarantees the sample doesn't silently lose fields on load.

- [ ] **Step 3: Step 0 loader.** In `step0/page.tsx`, under the Import entry-card (after the `</button>` of card 02), add:

```tsx
<button
  type="button"
  className="entry-sample-link"
  onClick={() => {
    const { importProjectFromJson } = require('@/src/lib/storage') // static import at top instead — see note
    const p = importProjectFromJson(JSON.stringify(sampleProject))
    router.push(`/projects/${p.id}/step1`)
  }}
>
  …or load the sample project (Michelin Greenville DC)
</button>
```

Real form: `import sampleProject from '@/src/content/samples/michelin-project.json'` and `importProjectFromJson` is ALREADY imported in this file — use them directly (no `require`). Wrap in try/catch mirroring the file-import error handling (`setImportError('Could not load the sample project.')` on throw). CSS: add near the entry-card styles:

```css
.entry-sample-link { grid-column: 1 / -1; justify-self: center; background: none; border: 0; padding: 6px; font-size: 13px; color: var(--text-tertiary); text-decoration: underline; cursor: pointer; }
.entry-sample-link:hover { color: var(--text-secondary); }
```

(Adjust `grid-column` to the entry-grid's actual structure — it should sit centered below the cards.)

- [ ] **Step 4:** `npx tsc --noEmit` clean; `npx vitest run` green; `npm run check:arch` pass (sample JSON is project data, not vehicle data — the arch script checks `src/content/vehicles/`; confirm it doesn't flag `src/content/samples/`, and report if it does rather than moving the file silently).
- [ ] **Step 5: Commit**

```bash
git add src/content/samples/michelin-project.json src/lib/__tests__/sampleProject.test.ts "app/projects/[id]/step0/page.tsx" app/globals.css
git commit -m "feat(step0): load-sample-project (Michelin Greenville, flow + CB18 assigned)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Gates, smoke, push

- [ ] **Step 1:** Full gates: `npx tsc --noEmit && npm run check:arch && npx vitest run` — all green (expect ~335+ tests).
- [ ] **Step 2:** CSS changed in Tasks 3/5/6/8 → clean dev restart (`rm -rf .next && npm run dev`), then smoke per feature: paste 3 TSV rows into Import flows → preview → added · type 4 in shifts/day → inline "Not saved" → correct → clears · delete a flow → Undo restores at position · Cmd+Z outside a field undoes, inside a field edits text · vehicle select shows CB18-first ordering on the Michelin sample · Step 0 sample link opens a populated project through Step 4.
- [ ] **Step 3:** `git push origin main` (pre-push hook re-runs the gates).
