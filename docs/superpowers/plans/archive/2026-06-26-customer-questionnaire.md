# Customer Questionnaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone customer-facing `/questionnaire` route that captures the full Step 1 technical inputs plus opportunity/sales context and exports a TAL-branded PDF (with embedded JSON) that the main app imports unchanged via Step 00.

**Architecture:** A self-contained public route under `app/questionnaire/` whose form components import ONLY the shared Zod schema + enums (no `storage.ts`, no step internals). On submit it assembles a partial project, wraps it in the existing `{ schemaVersion, exportedAt, project }` envelope, and produces a TAL-branded PDF via a dedicated `pdfQuestionnaire.ts` (mirroring the embed-JSON pattern in `pdfExport.ts`). Step 00's existing `importProjectFromJson` / `parseProjectPdf` ingest it with zero import-side changes because every new field is added to `projectSchema` as optional. Split-readiness is guaranteed by keeping the only shared dependencies the schema + enums, enforced by a parity test.

**Tech Stack:** Next.js 16 App Router (pages in `app/`), React 19, TypeScript strict, React Hook Form + Zod 4, `pdf-lib` (dynamic import), Vitest.

---

## File Structure

- `src/lib/validations/schemas.ts` — **modify**: add `SCHEMA_VERSION` + new optional sales/opportunity fields to `projectSchema`.
- `src/lib/storage.ts` — **modify**: import `SCHEMA_VERSION` from `schemas.ts` instead of declaring it (single source; lets the questionnaire reach it without importing storage).
- `src/lib/constants/enums.ts` — **modify**: add `SPECIALTY_APPLICATIONS` + `PROJECT_DRIVERS`.
- `src/lib/questionnaire/questionnaireExport.ts` — **create**: pure `buildQuestionnaireEnvelope(project)` returning the wrapped envelope; `questionnaireJsonBlob`.
- `src/lib/questionnaire/pdfQuestionnaire.ts` — **create**: TAL-branded PDF (logo top-right every page, contact blocks, sectioned summary, embedded JSON) + `downloadQuestionnairePdf`.
- `src/components/questionnaire/QuestionnaireForm.tsx` — **create**: the RHF form (all sections inline, mirroring `ApplicationForm`'s single-file pattern), draft autosave to its own localStorage key, submit → PDF + JSON.
- `app/questionnaire/page.tsx` — **create**: public route shell (TAL brand, intro, renders the form).
- `src/lib/__tests__/questionnaireExport.test.ts` — **create**: round-trip + envelope tests.
- `src/lib/__tests__/questionnaireParity.test.ts` — **create**: every form field key ∈ `projectSchema.shape`; chip enums are the source.
- `src/lib/__tests__/schemaSalesFields.test.ts` — **create**: each new field parses (valid + cleared).
- `src/lib/pdfExport.ts` — **modify**: print the new opportunity/sales fields so imported questionnaire data is visible in the app PDF.
- `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` — **modify**: docs-first.

---

## Task 1: Schema fields, enums, and SCHEMA_VERSION single-source

**Files:**
- Modify: `src/lib/validations/schemas.ts`
- Modify: `src/lib/storage.ts:7`
- Modify: `src/lib/constants/enums.ts`
- Test: `src/lib/__tests__/schemaSalesFields.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/schemaSalesFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { partialProjectSchema } from '@/src/lib/validations/schemas'
import { SCHEMA_VERSION } from '@/src/lib/validations/schemas'
import { SPECIALTY_APPLICATIONS, PROJECT_DRIVERS } from '@/src/lib/constants/enums'

describe('sales / opportunity schema fields', () => {
  it('parses a fully-populated sales block', () => {
    const r = partialProjectSchema.safeParse({
      vehicleInMind: 'CB18',
      isRfq: true, rfqNumber: 'RFQ-42', rfqDueDate: '2026-08-01',
      cadAvailable: true, cadNotes: 'DWG attached',
      projectStage: 'budgeting', budgetStatus: 'budgetary', budgetRange: '$1-2M',
      decisionDate: '2026-09-01', targetGoLiveDate: '2027-01-01',
      projectDrivers: ['Labor cost', 'Safety'], currentProcess: 'Manual forklifts',
      volumeGrowthNote: '10%/yr', seasonalityNote: 'Q4 peak',
      facilitySizeSqFt: 250000, dockDoors: 12, networkReady: true, itContact: 'jane@co',
      existingAutomation: 'None', siteWalkthroughAvailable: true,
      specialtyApplications: ['Trailer loading', 'High reach / racking'],
      customerContactName: 'Bob', customerContactRole: 'Ops', customerContactEmail: 'b@co', customerContactPhone: '555',
      talRepName: 'Sam', talRepEmail: 's@tal', talRepPhone: '556',
    })
    expect(r.success).toBe(true)
  })

  it('treats every sales field as optional (empty object is valid)', () => {
    expect(partialProjectSchema.safeParse({}).success).toBe(true)
  })

  it('rejects an invalid enum value', () => {
    expect(partialProjectSchema.safeParse({ projectStage: 'nope' }).success).toBe(false)
  })

  it('exposes SCHEMA_VERSION and the chip enums', () => {
    expect(typeof SCHEMA_VERSION).toBe('number')
    expect(SPECIALTY_APPLICATIONS).toContain('Trailer loading')
    expect(PROJECT_DRIVERS).toContain('Labor cost')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/schemaSalesFields.test.ts`
Expected: FAIL — `SCHEMA_VERSION` not exported from schemas, `SPECIALTY_APPLICATIONS`/`PROJECT_DRIVERS` undefined, sales fields rejected as unknown is NOT the failure (Zod strips unknowns by default, so the enum-reject and export assertions fail).

- [ ] **Step 3: Add enums**

In `src/lib/constants/enums.ts`, after the `CERTIFICATIONS` block add:

```ts
/** Customer-questionnaire specialty applications of interest. */
export const SPECIALTY_APPLICATIONS = [
  'Trailer loading',
  'Trailer unloading',
  'High reach / racking',
  'Floor-to-floor',
  'Long-haul transport',
  'Conveyor interface',
  'Outdoor / yard',
  'Other',
] as const

/** Why the customer is automating — drives the questionnaire's driver chips. */
export const PROJECT_DRIVERS = [
  'Labor availability',
  'Labor cost',
  'Safety',
  'Throughput / capacity',
  'Quality / consistency',
  'Ergonomics',
  '24/7 operation',
  'Other',
] as const
```

- [ ] **Step 4: Move SCHEMA_VERSION to schemas.ts (single source)**

In `src/lib/validations/schemas.ts`, add near the top (after the `import { z }` line):

```ts
/** Bumped when the persisted project shape changes incompatibly. Lives here (not
 *  storage.ts) so the standalone questionnaire can read it without importing storage. */
export const SCHEMA_VERSION = 1
```

In `src/lib/storage.ts`, change line 1 + line 7. Replace:

```ts
import { partialProjectSchema, type PartialProjectFormData } from './validations/schemas'
```
with:
```ts
import { partialProjectSchema, SCHEMA_VERSION, type PartialProjectFormData } from './validations/schemas'
```
and delete the old `export const SCHEMA_VERSION = 1` line, replacing it with a re-export so existing importers (`pdfExport.ts` imports it from `./storage`) keep working:
```ts
export { SCHEMA_VERSION }
```

- [ ] **Step 5: Add the sales/opportunity fields to projectSchema**

In `src/lib/validations/schemas.ts`, inside `projectSchema`, immediately before the `// Section 13` comment, add:

```ts
  // ---- Customer questionnaire: opportunity / sales context (informational only) ----
  vehicleInMind: z.string().optional(),
  isRfq: z.boolean().optional(),
  rfqNumber: z.string().optional(),
  rfqDueDate: z.string().optional(),
  cadAvailable: z.boolean().optional(),
  cadNotes: z.string().optional(),
  projectStage: z.enum(['exploring', 'budgeting', 'approved', 'committed']).optional(),
  budgetStatus: z.enum(['budgetary', 'firm', 'allocated']).optional(),
  budgetRange: z.string().optional(),
  decisionDate: z.string().optional(),
  targetGoLiveDate: z.string().optional(),
  projectDrivers: z.array(z.string()).default([]),
  currentProcess: z.string().optional(),
  volumeGrowthNote: z.string().optional(),
  seasonalityNote: z.string().optional(),
  facilitySizeSqFt: z.number().min(0).optional().nullable(),
  dockDoors: z.number().int().min(0).optional().nullable(),
  networkReady: z.boolean().optional(),
  itContact: z.string().optional(),
  existingAutomation: z.string().optional(),
  siteWalkthroughAvailable: z.boolean().optional(),
  specialtyApplications: z.array(z.string()).default([]),
  customerContactName: z.string().optional(),
  customerContactRole: z.string().optional(),
  customerContactEmail: z.string().optional(),
  customerContactPhone: z.string().optional(),
  talRepName: z.string().optional(),
  talRepEmail: z.string().optional(),
  talRepPhone: z.string().optional(),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/schemaSalesFields.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck + arch gate**

Run: `npx tsc --noEmit && npm run check:arch`
Expected: clean (no calc/ purity or boundary violations).

- [ ] **Step 8: Commit** (schema change touches the data model → pre-commit hook needs a CHANGELOG entry; add it now)

In `docs/CHANGELOG.md`, add under the top/unreleased section:
```markdown
- Customer questionnaire: added optional opportunity/sales fields to projectSchema
  (vehicleInMind, RFQ, CAD, stage/budget, drivers, growth, site readiness, specialty
  applications, customer + TAL contact). SCHEMA_VERSION moved to schemas.ts. New enums
  SPECIALTY_APPLICATIONS / PROJECT_DRIVERS.
```
Then:
```bash
git add src/lib/validations/schemas.ts src/lib/storage.ts src/lib/constants/enums.ts \
        src/lib/__tests__/schemaSalesFields.test.ts docs/CHANGELOG.md
git commit -m "feat(schema): customer-questionnaire sales fields + SCHEMA_VERSION single-source"
```

---

## Task 2: Envelope builder + round-trip test

**Files:**
- Create: `src/lib/questionnaire/questionnaireExport.ts`
- Test: `src/lib/__tests__/questionnaireExport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/questionnaireExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildQuestionnaireEnvelope } from '@/src/lib/questionnaire/questionnaireExport'
import { importProjectFromJson } from '@/src/lib/storage'
import { SCHEMA_VERSION } from '@/src/lib/validations/schemas'

describe('buildQuestionnaireEnvelope', () => {
  const answers = {
    projectName: 'Acme DC', customerName: 'Acme',
    vehicleInMind: 'CB18', isRfq: true, rfqNumber: 'RFQ-7',
    projectDrivers: ['Labor cost'], specialtyApplications: ['Trailer loading'],
    talRepName: 'Sam', maxLoadWeightLbs: 2400, transferType: 'forklift' as const,
  }

  it('wraps answers in the { schemaVersion, exportedAt, project } envelope', () => {
    const env = buildQuestionnaireEnvelope(answers)
    expect(env.schemaVersion).toBe(SCHEMA_VERSION)
    expect(typeof env.exportedAt).toBe('string')
    expect(env.project.vehicleInMind).toBe('CB18')
  })

  it('round-trips through Step 00 import with all sales fields intact', () => {
    const env = buildQuestionnaireEnvelope(answers)
    const imported = importProjectFromJson(JSON.stringify(env))
    expect(imported.customerName).toBe('Acme')
    expect(imported.vehicleInMind).toBe('CB18')
    expect(imported.isRfq).toBe(true)
    expect(imported.rfqNumber).toBe('RFQ-7')
    expect(imported.projectDrivers).toEqual(['Labor cost'])
    expect(imported.specialtyApplications).toEqual(['Trailer loading'])
    expect(imported.talRepName).toBe('Sam')
    expect(imported.maxLoadWeightLbs).toBe(2400)
    expect(imported.transferType).toBe('forklift')
    expect(imported.id).toBeTruthy()        // got a fresh id on import
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/questionnaireExport.test.ts`
Expected: FAIL — `buildQuestionnaireEnvelope` not found.

- [ ] **Step 3: Implement the envelope builder**

Create `src/lib/questionnaire/questionnaireExport.ts`:

```ts
// Standalone questionnaire export. Imports ONLY the shared schema (split-ready):
// no storage, no step internals. Produces the same wrapped envelope Step 00 imports.
import { SCHEMA_VERSION, type PartialProjectFormData } from '@/src/lib/validations/schemas'

export interface QuestionnaireEnvelope {
  schemaVersion: number
  exportedAt: string
  project: PartialProjectFormData
}

/** Wrap questionnaire answers in the envelope `importProjectFromJson` understands. */
export function buildQuestionnaireEnvelope(answers: PartialProjectFormData): QuestionnaireEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: answers,
  }
}

/** Plain-JSON download fallback (the same envelope, pretty-printed). */
export function questionnaireJsonBlob(answers: PartialProjectFormData): Blob {
  return new Blob([JSON.stringify(buildQuestionnaireEnvelope(answers), null, 2)], {
    type: 'application/json',
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/questionnaireExport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/questionnaire/questionnaireExport.ts src/lib/__tests__/questionnaireExport.test.ts
git commit -m "feat(questionnaire): envelope builder + Step-00 round-trip test"
```

---

## Task 3: TAL-branded PDF with embedded JSON

**Files:**
- Create: `src/lib/questionnaire/pdfQuestionnaire.ts`

This mirrors the helpers in `src/lib/pdfExport.ts` (wrapText, row, section, logo, `pdfDoc.attach`) but: (a) draws the **TAL logo in the top-right of every page**, (b) adds **customer + TAL rep + dealer** contact blocks, (c) prints the sales/opportunity + Step-1 sections, and (d) does NOT qualify vehicles (no app-internal deps). There is no unit test for pixel output; correctness is verified by `npm run build` + a manual download check in Task 6. Keep the function under ~200 lines by reusing the row/section closures.

- [ ] **Step 1: Implement the PDF module**

Create `src/lib/questionnaire/pdfQuestionnaire.ts`:

```ts
// Standalone TAL-branded questionnaire PDF. Imports ONLY the shared schema + the
// envelope builder (split-ready: no storage, no calc, no step internals).
import { type PartialProjectFormData } from '@/src/lib/validations/schemas'
import { buildQuestionnaireEnvelope } from './questionnaireExport'

const TAL_RED_RGB = [235 / 255, 10 / 255, 30 / 255] as const

function fmt(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export async function exportQuestionnairePdf(p: PartialProjectFormData): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  pdfDoc.setTitle(p.projectName || 'TAL Customer Questionnaire')
  pdfDoc.setAuthor('TAL Fleet Calculator')
  pdfDoc.setSubject('AGV/AMR Customer Questionnaire')

  const TAL_RED = rgb(...TAL_RED_RGB)
  const TEXT = rgb(0.1, 0.1, 0.12)
  const MUTED = rgb(0.45, 0.45, 0.5)
  const RULE = rgb(0.85, 0.85, 0.88)
  const W = 612, H = 792, MX = 56

  type PDFFont = Awaited<ReturnType<typeof pdfDoc.embedFont>>
  const wrap = (text: string, useFont: PDFFont, size: number, maxW: number): string[] => {
    if (!text) return ['']
    const out: string[] = []
    for (const para of text.split(/\n+/)) {
      const words = para.split(/\s+/).filter(Boolean)
      if (!words.length) { out.push(''); continue }
      let cur = ''
      for (const word of words) {
        const cand = cur ? `${cur} ${word}` : word
        if (useFont.widthOfTextAtSize(cand, size) > maxW && cur) { out.push(cur); cur = word }
        else cur = cand
      }
      if (cur) out.push(cur)
    }
    return out
  }

  let logoImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
  try {
    const res = await fetch('/assets/TAL-Logo-Black.png')
    if (res.ok) logoImg = await pdfDoc.embedPng(new Uint8Array(await res.arrayBuffer()))
  } catch { /* logo optional */ }

  // Every page: TAL logo top-right + footer contact line.
  const decorate = (page: Awaited<ReturnType<typeof pdfDoc.addPage>>) => {
    if (logoImg) {
      const d = logoImg.scaleToFit(110, 40)
      page.drawImage(logoImg, { x: W - MX - d.width, y: H - 50, width: d.width, height: d.height })
    } else {
      page.drawText('TAL', { x: W - MX - 40, y: H - 44, size: 20, font: bold, color: TAL_RED })
    }
    const footer = fmt([p.talRepName, p.talRepEmail, p.talRepPhone].filter(Boolean).join('  ·  ') || 'Toyota Advanced Logistics')
    page.drawText(footer, { x: MX, y: 36, size: 8, font, color: MUTED })
  }

  let page = pdfDoc.addPage([W, H])
  decorate(page)
  let y = 0
  const lineH = 16, bottom = 64
  const VALUE_X = MX + 200, VALUE_W = W - VALUE_X - MX

  const newPage = (title: string) => {
    page = pdfDoc.addPage([W, H]); decorate(page)
    page.drawText(title, { x: MX, y: H - 70, size: 10, font: bold, color: TAL_RED })
    page.drawLine({ start: { x: MX, y: H - 80 }, end: { x: W - MX, y: H - 80 }, thickness: 0.5, color: RULE })
    y = H - 110
  }
  const ensure = (need: number) => { if (y - need < bottom) newPage('CUSTOMER QUESTIONNAIRE (cont.)') }
  const sec = (title: string) => {
    ensure(lineH + 14); y -= 10
    page.drawText(title, { x: MX, y, size: 10, font: bold, color: TEXT }); y -= lineH + 4
  }
  const row = (label: string, value: unknown) => {
    const lines = wrap(fmt(value), font, 10, VALUE_W)
    const rowH = Math.max(lineH, lines.length * (lineH - 2)); ensure(rowH)
    page.drawText(label, { x: MX, y, size: 9, font, color: MUTED })
    let ly = y
    for (const l of lines) { page.drawText(l, { x: VALUE_X, y: ly, size: 10, font, color: TEXT }); ly -= lineH - 2 }
    y -= rowH
  }

  // ── Cover header ──
  page.drawText('CUSTOMER QUESTIONNAIRE', { x: MX, y: H - 110, size: 10, font: bold, color: TAL_RED })
  page.drawLine({ start: { x: MX, y: H - 120 }, end: { x: W - MX, y: H - 120 }, thickness: 0.5, color: RULE })
  page.drawText(p.projectName || 'Untitled Opportunity', { x: MX, y: H - 156, size: 24, font: bold, color: TEXT })
  page.drawText(p.customerName || 'Customer —', { x: MX, y: H - 178, size: 13, font, color: MUTED })
  y = H - 220

  sec('Contacts')
  row('Customer contact', [p.customerContactName, p.customerContactRole].filter(Boolean).join(' — '))
  row('Customer email / phone', [p.customerContactEmail, p.customerContactPhone].filter(Boolean).join('  ·  '))
  row('TAL representative', p.talRepName)
  row('TAL email / phone', [p.talRepEmail, p.talRepPhone].filter(Boolean).join('  ·  '))
  row('Dealer', [p.oemDealer, p.dealershipName, p.dealerRep].filter(Boolean).join(' — '))

  sec('Opportunity')
  row('Vehicle in mind', p.vehicleInMind)
  row('RFQ', p.isRfq ? `Yes${p.rfqNumber ? ` (${p.rfqNumber})` : ''}` : 'No')
  row('RFQ due date', p.rfqDueDate)
  row('CAD / drawings available', p.cadAvailable ? `Yes${p.cadNotes ? ` — ${p.cadNotes}` : ''}` : 'No')
  row('Project stage', p.projectStage)
  row('Budget status', p.budgetStatus)
  row('Budget range', p.budgetRange)
  row('Decision date', p.decisionDate)
  row('Target go-live', p.targetGoLiveDate)

  sec('Why & how today')
  row('Drivers', p.projectDrivers)
  row('Current process', p.currentProcess)
  row('Volume growth', p.volumeGrowthNote)
  row('Seasonality', p.seasonalityNote)
  row('Existing automation', p.existingAutomation)

  sec('Specialty applications of interest')
  row('Applications', p.specialtyApplications)

  sec('What you move')
  row('Unit / load type', p.typicalUnitType ?? (p.loads?.[0]?.unitType))
  row('Max load weight', p.maxLoadWeightLbs ? `${p.maxLoadWeightLbs.toLocaleString()} lbs` : null)

  sec('How it is transferred')
  row('Transfer type', p.transferType)
  row('Transfer height', p.transferHeightFt != null ? `${p.transferHeightFt} ft` : null)

  sec('Environment & site')
  row('Facility size', p.facilitySizeSqFt ? `${p.facilitySizeSqFt.toLocaleString()} sq ft` : null)
  row('Dock doors', p.dockDoors)
  row('Network ready', p.networkReady)
  row('IT contact', p.itContact)
  row('Site walkthrough available', p.siteWalkthroughAvailable)
  row('Min temperature', p.tempMinF != null ? `${p.tempMinF}°F` : null)
  row('Max temperature', p.tempMaxF != null ? `${p.tempMaxF}°F` : null)

  sec('Schedule')
  row('Shifts / day', p.shiftsPerDay)
  row('Hours / shift', p.hoursPerShift)
  row('Operating days', p.operatingDaysPattern)

  sec('Throughput')
  row('Required throughput', p.requiredThroughputPerHour ? `${p.requiredThroughputPerHour} moves/hr` : null)
  row('Average distance', p.avgDistanceFt ? `${p.avgDistanceFt} ft` : null)

  sec('Notes')
  row('Notes', p.projectNotes)

  // ── Embed JSON envelope ──
  const env = buildQuestionnaireEnvelope(p)
  const bytes = new TextEncoder().encode(JSON.stringify(env, null, 2))
  await pdfDoc.attach(bytes, 'project.json', {
    mimeType: 'application/json',
    description: 'TAL Fleet Calculator project data',
    creationDate: new Date(), modificationDate: new Date(),
  })

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes.slice()], { type: 'application/pdf' })
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function fileBase(p: PartialProjectFormData): string {
  return (p.projectName || p.customerName || 'questionnaire').replace(/[^a-z0-9-_]+/gi, '_')
}

export async function downloadQuestionnairePdf(p: PartialProjectFormData): Promise<void> {
  triggerDownload(await exportQuestionnairePdf(p), `${fileBase(p)}_questionnaire.pdf`)
}
```

- [ ] **Step 2: Typecheck + arch gate**

Run: `npx tsc --noEmit && npm run check:arch`
Expected: clean. (The `attach` options and `embedPng` types match the patterns already in `pdfExport.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/questionnaire/pdfQuestionnaire.ts
git commit -m "feat(questionnaire): TAL-branded PDF export with embedded JSON"
```

---

## Task 4: Questionnaire form + public route

**Files:**
- Create: `src/components/questionnaire/QuestionnaireForm.tsx`
- Create: `app/questionnaire/page.tsx`

The form mirrors `ApplicationForm`'s single-file, RHF pattern but writes to a self-contained answers object and reuses existing `.fld` / `FormSection` styling. It must NOT import `storage.ts`. Draft autosave goes to its own key `tal:questionnaire-draft`.

**Scope note:** v1 captures the loads (single load), transfer, environment, certs/interlocks/WMS, schedule, throughput, and the full sales/opportunity set — every field round-trips via the schema. **Per-flow rows (the `flows` array) and multi-load entry are intentionally deferred**: they are the engineer's job in Step 3, and the questionnaire seeds the project-level inputs the matrix/sizing need. This keeps the customer form short; the engineer fills flows after import. Note this deferral in the SPECIFICATION update (Task 6).

- [ ] **Step 1: Implement the form**

Create `src/components/questionnaire/QuestionnaireForm.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useForm, Controller, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import FormSection from '@/src/components/step1/FormSection'
import { projectSchema, type ProjectFormData } from '@/src/lib/validations/schemas'
import {
  TYPICAL_UNIT_TYPES, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS,
  SPECIALTY_APPLICATIONS, PROJECT_DRIVERS,
} from '@/src/lib/constants/enums'
import { downloadQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
import { questionnaireJsonBlob } from '@/src/lib/questionnaire/questionnaireExport'

const DRAFT_KEY = 'tal:questionnaire-draft'

// Local display list — mirrors the INTERLOCKS const in ApplicationForm (not yet
// exported from enums.ts; kept local to avoid touching Step 1 in this feature).
const INTERLOCKS = ['High-Speed Doors', 'Elevators', 'Conveyors', 'PLC Systems', 'Other']

/** Toggle a string in a string[] field (chip behavior). */
function toggle(list: string[] | undefined, value: string): string[] {
  const cur = list ?? []
  return cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
}

// RHF `register` value coercion. Empty selects emit "" and empty number inputs
// emit NaN — both FAIL Zod enum/number validation in the resolver and would
// silently block submit. Map empties to `undefined` so optional fields stay valid.
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)
const emptyToNum = (v: unknown) => {
  if (v === '' || v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

export default function QuestionnaireForm() {
  const [submitted, setSubmitted] = useState(false)
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null)
  const { register, handleSubmit, control, reset, getValues, watch } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { projectDrivers: [], specialtyApplications: [], certifications: [], interlocks: [] },
  })

  // Restore draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) reset(JSON.parse(raw))
    } catch { /* ignore corrupt draft */ }
  }, [reset])

  // Autosave draft (debounced via watch subscription).
  useEffect(() => {
    const sub = watch((values) => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)) } catch { /* quota */ }
    })
    return () => sub.unsubscribe()
  }, [watch])

  const onSubmit: SubmitHandler<ProjectFormData> = useCallback(async (values) => {
    setInvalidMsg(null)
    await downloadQuestionnairePdf(values)
    setSubmitted(true)
  }, [])

  // handleSubmit suppresses onSubmit when the schema rejects a value (e.g. hours/shift
  // outside 4–12). Surface a message + the offending fields so submit never fails silently.
  const onInvalid = useCallback((errors: Record<string, unknown>) => {
    setSubmitted(false)
    setInvalidMsg(`Please fix: ${Object.keys(errors).join(', ')}`)
  }, [])

  const downloadJson = useCallback(() => {
    const blob = questionnaireJsonBlob(getValues())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'questionnaire.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getValues])

  return (
    <form className="q-form" onSubmit={handleSubmit(onSubmit, onInvalid)}>
      <FormSection title="You & your company">
        <div className="fld"><label>Customer / company</label><input {...register('customerName')} /></div>
        <div className="fld"><label>Facility location</label><input {...register('facilityLocation')} /></div>
        <div className="fld"><label>Your name</label><input {...register('customerContactName')} /></div>
        <div className="fld"><label>Your role</label><input {...register('customerContactRole')} /></div>
        <div className="fld"><label>Email</label><input {...register('customerContactEmail')} /></div>
        <div className="fld"><label>Phone</label><input {...register('customerContactPhone')} /></div>
        <div className="fld"><label>TAL representative</label><input {...register('talRepName')} /></div>
        <div className="fld"><label>TAL email</label><input {...register('talRepEmail')} /></div>
        <div className="fld"><label>TAL phone</label><input {...register('talRepPhone')} /></div>
        <div className="fld"><label>Dealer / OEM</label><input {...register('oemDealer')} /></div>
        <div className="fld"><label>Dealership name</label><input {...register('dealershipName')} /></div>
        <div className="fld"><label>Dealer rep</label><input {...register('dealerRep')} /></div>
      </FormSection>

      <FormSection title="The opportunity">
        <div className="fld"><label>Project / opportunity name</label><input {...register('projectName')} /></div>
        <div className="fld"><label>Vehicle in mind</label><input {...register('vehicleInMind')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('isRfq')} /> This is an RFQ</label></div>
        <div className="fld"><label>RFQ number</label><input {...register('rfqNumber')} /></div>
        <div className="fld"><label>RFQ due date</label><input type="date" {...register('rfqDueDate')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('cadAvailable')} /> CAD / drawings available</label></div>
        <div className="fld"><label>CAD notes</label><input {...register('cadNotes')} /></div>
        <div className="fld"><label>Project stage</label>
          <select {...register('projectStage', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            <option value="exploring">Exploring</option>
            <option value="budgeting">Budgeting</option>
            <option value="approved">Approved</option>
            <option value="committed">Committed</option>
          </select>
        </div>
        <div className="fld"><label>Budget status</label>
          <select {...register('budgetStatus', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            <option value="budgetary">Budgetary</option>
            <option value="firm">Firm</option>
            <option value="allocated">Allocated</option>
          </select>
        </div>
        <div className="fld"><label>Budget range</label><input {...register('budgetRange')} /></div>
        <div className="fld"><label>Decision date</label><input type="date" {...register('decisionDate')} /></div>
        <div className="fld"><label>Target go-live</label><input type="date" {...register('targetGoLiveDate')} /></div>
      </FormSection>

      <FormSection title="Why & how today">
        <Controller control={control} name="projectDrivers" render={({ field }) => (
          <div className="fld">
            <label>Drivers</label>
            <div className="q-chips">
              {PROJECT_DRIVERS.map(d => (
                <button type="button" key={d}
                  className={`q-chip${(field.value ?? []).includes(d) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, d))}>{d}</button>
              ))}
            </div>
          </div>
        )} />
        <div className="fld"><label>How is this done today?</label><textarea {...register('currentProcess')} /></div>
        <div className="fld"><label>Volume growth</label><input {...register('volumeGrowthNote')} /></div>
        <div className="fld"><label>Seasonality</label><input {...register('seasonalityNote')} /></div>
        <div className="fld"><label>Existing automation (brand/fleet)</label><input {...register('existingAutomation')} /></div>
      </FormSection>

      <FormSection title="Specialty applications of interest">
        <Controller control={control} name="specialtyApplications" render={({ field }) => (
          <div className="fld">
            <div className="q-chips">
              {SPECIALTY_APPLICATIONS.map(a => (
                <button type="button" key={a}
                  className={`q-chip${(field.value ?? []).includes(a) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, a))}>{a}</button>
              ))}
            </div>
          </div>
        )} />
      </FormSection>

      <FormSection title="What you move">
        <div className="fld"><label>Unit / load type</label>
          <select {...register('typicalUnitType')}>
            <option value="">—</option>
            {TYPICAL_UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="fld"><label>Max load weight (lbs)</label><input type="number" {...register('maxLoadWeightLbs', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Length (in)</label><input type="number" {...register('loadLengthIn', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Width (in)</label><input type="number" {...register('loadWidthIn', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Height (in)</label><input type="number" {...register('loadHeightIn', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection title="How it is transferred">
        <div className="fld"><label>Transfer type</label>
          <select {...register('transferType', { setValueAs: emptyToUndef })}>
            <option value="">—</option>
            {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="fld"><label>Transfer height (ft)</label><input type="number" {...register('transferHeightFt', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection title="Environment & site">
        <div className="fld"><label>Facility size (sq ft)</label><input type="number" {...register('facilitySizeSqFt', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Dock doors</label><input type="number" {...register('dockDoors', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label><input type="checkbox" {...register('networkReady')} /> Network / WiFi ready</label></div>
        <div className="fld"><label>IT contact</label><input {...register('itContact')} /></div>
        <div className="fld"><label><input type="checkbox" {...register('siteWalkthroughAvailable')} /> Site walkthrough available</label></div>
        <div className="fld"><label>Min aisle width (ft)</label><input type="number" {...register('minAisleWidthFt', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Min temperature (°F)</label><input type="number" {...register('tempMinF', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Max temperature (°F)</label><input type="number" {...register('tempMaxF', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection title="Certifications & controls">
        <Controller control={control} name="certifications" render={({ field }) => (
          <div className="fld"><label>Certifications</label>
            <div className="q-chips">
              {CERTIFICATIONS.map(c => (
                <button type="button" key={c}
                  className={`q-chip${(field.value ?? []).includes(c) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, c))}>{c}</button>
              ))}
            </div>
          </div>
        )} />
        <Controller control={control} name="interlocks" render={({ field }) => (
          <div className="fld"><label>Equipment interlocks</label>
            <div className="q-chips">
              {INTERLOCKS.map(i => (
                <button type="button" key={i}
                  className={`q-chip${(field.value ?? []).includes(i) ? ' is-on' : ''}`}
                  onClick={() => field.onChange(toggle(field.value, i))}>{i}</button>
              ))}
            </div>
          </div>
        )} />
        <div className="fld"><label><input type="checkbox" {...register('wmsRequired')} /> WMS integration required</label></div>
        <div className="fld"><label>WMS vendor</label><input {...register('wmsVendor')} /></div>
      </FormSection>

      <FormSection title="Schedule">
        <div className="fld"><label>Shifts / day</label><input type="number" {...register('shiftsPerDay', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Hours / shift</label><input type="number" {...register('hoursPerShift', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Operating days</label><input {...register('operatingDaysPattern')} /></div>
        <div className="fld"><label>Breaks / shift</label><input type="number" {...register('breaksPerShift', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Break duration (min)</label><input type="number" {...register('breakDurationMin', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection title="Throughput">
        <div className="fld"><label>Required throughput (moves/hr)</label><input type="number" {...register('requiredThroughputPerHour', { setValueAs: emptyToNum })} /></div>
        <div className="fld"><label>Average distance (ft)</label><input type="number" {...register('avgDistanceFt', { setValueAs: emptyToNum })} /></div>
      </FormSection>

      <FormSection title="Anything else">
        <div className="fld"><label>Notes</label><textarea {...register('projectNotes')} /></div>
      </FormSection>

      <div className="q-actions">
        <button type="submit" className="q-submit">Download questionnaire (PDF)</button>
        <button type="button" className="q-alt" onClick={downloadJson}>Download JSON</button>
        {submitted && <span className="q-done">Downloaded — send the PDF to your TAL engineer.</span>}
        {invalidMsg && <span className="q-invalid">{invalidMsg}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Implement the route shell**

Create `app/questionnaire/page.tsx`:

```tsx
import QuestionnaireForm from '@/src/components/questionnaire/QuestionnaireForm'

export const metadata = { title: 'TAL — Customer Questionnaire' }

export default function QuestionnairePage() {
  return (
    <main className="q-page">
      <header className="q-hero">
        <h1>Customer Questionnaire</h1>
        <p>Tell us about your application. When you’re done, download the PDF and send it to
          your TAL engineer — it carries everything needed to size your fleet. Nothing is required;
          fill in what you know.</p>
      </header>
      <QuestionnaireForm />
    </main>
  )
}
```

- [ ] **Step 3: Add minimal styles**

In `app/globals.css`, append (Toyota Type inherited from existing `.fld` styles):

```css
/* ── Customer questionnaire (standalone /questionnaire) ── */
.q-page { max-width: 880px; margin: 0 auto; padding: 40px 24px 96px; }
.q-hero h1 { font-family: var(--tal-font-family); font-size: 28px; margin: 0 0 8px; }
.q-hero p { color: var(--tal-muted, #5a5a60); max-width: 60ch; }
.q-form { margin-top: 24px; display: flex; flex-direction: column; gap: 20px; }
.q-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.q-chip { padding: 6px 12px; border: 1px solid var(--tal-border, #d4d4d8); border-radius: 999px;
  background: transparent; font-family: var(--tal-font-numeric); font-size: 13px; cursor: pointer; }
.q-chip.is-on { background: var(--tal-red, #eb0a1e); color: #fff; border-color: var(--tal-red, #eb0a1e); }
.q-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.q-submit { padding: 12px 20px; background: var(--tal-red, #eb0a1e); color: #fff; border: none;
  border-radius: 8px; font-family: var(--tal-font-family); font-size: 15px; cursor: pointer; }
.q-alt { padding: 12px 16px; background: transparent; border: 1px solid var(--tal-border, #d4d4d8);
  border-radius: 8px; font-family: var(--tal-font-family); cursor: pointer; }
.q-done { color: var(--tal-green, #1f9d4d); font-size: 13px; }
.q-invalid { color: var(--tal-red, #eb0a1e); font-size: 13px; }
```

- [ ] **Step 4: Typecheck + arch gate + build**

Run: `npx tsc --noEmit && npm run check:arch && npm run build`
Expected: clean; `/questionnaire` appears in the build route list.

- [ ] **Step 5: Restart dev clean (CSS changed) + manual check**

Run: `pkill -f "next dev" 2>/dev/null; rm -rf .next; npm run dev`
Then open `http://localhost:3000/questionnaire`: fill a few fields incl. driver + specialty chips, click **Download questionnaire (PDF)** — a PDF downloads with the **TAL logo top-right** and the sections. Then go to Step 00 → **Import Customer Questionnaire**, drop that PDF, and confirm it opens Step 1 with the data populated.

- [ ] **Step 6: Commit**

```bash
git add app/questionnaire/page.tsx src/components/questionnaire/QuestionnaireForm.tsx app/globals.css
git commit -m "feat(questionnaire): standalone /questionnaire route + form UI"
```

---

## Task 5: Parity test (split-ready guard)

**Files:**
- Test: `src/lib/__tests__/questionnaireParity.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/__tests__/questionnaireParity.test.ts`. This statically reads the form source and asserts every `register('x')` / `name="x"` key is a real `projectSchema` key — so the form can never reference a field the schema doesn't define (the drift guard).

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectSchema } from '@/src/lib/validations/schemas'

const SRC = readFileSync(
  resolve(__dirname, '../../components/questionnaire/QuestionnaireForm.tsx'),
  'utf8',
)

describe('questionnaire ↔ schema parity', () => {
  const schemaKeys = new Set(Object.keys(projectSchema.shape))

  it('every register()/name= field is a real projectSchema key', () => {
    const keys = new Set<string>()
    for (const m of SRC.matchAll(/register\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) keys.add(m[1])
    for (const m of SRC.matchAll(/name=["']([a-zA-Z0-9_]+)["']/g)) keys.add(m[1])
    expect(keys.size).toBeGreaterThan(10)
    const orphans = [...keys].filter(k => !schemaKeys.has(k))
    expect(orphans).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/questionnaireParity.test.ts`
Expected: PASS (form keys all exist in the schema). If it FAILS, the listed orphan keys are typos/missing schema fields — fix the schema or the field name, don't loosen the test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/questionnaireParity.test.ts
git commit -m "test(questionnaire): schema-parity drift guard"
```

---

## Task 6: Surface sales fields in the app PDF + docs

**Files:**
- Modify: `src/lib/pdfExport.ts:282-285` (the "Section 8 — Dealer & Contact" block)
- Modify: `docs/SPECIFICATION.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Print the imported sales fields in the app PDF**

In `src/lib/pdfExport.ts`, replace the `sec('Section 8 — Dealer & Contact')` block (lines ~282-285) with:

```ts
    sec('Section 8 — Opportunity & Contact')
    row('Vehicle in mind', project.vehicleInMind)
    row('RFQ', project.isRfq ? `Yes${project.rfqNumber ? ` (${project.rfqNumber})` : ''}` : null)
    row('CAD available', project.cadAvailable ? 'Yes' : null)
    row('Project stage', project.projectStage)
    row('Budget', joinList([project.budgetStatus, project.budgetRange]))
    row('Drivers', (project.projectDrivers ?? []).join(', ') || null)
    row('Specialty applications', (project.specialtyApplications ?? []).join(', ') || null)
    row('Target go-live', project.targetGoLiveDate)
    row('Customer contact', joinList([project.customerContactName, project.customerContactEmail]))
    row('TAL representative', joinList([project.talRepName, project.talRepEmail]))
    row('OEM dealer', project.oemDealer)
    row('Dealership name', project.dealershipName)
    row('Dealer representative', project.dealerRep)
```

- [ ] **Step 2: Verify the existing PDF export test still passes**

Run: `npx vitest run src/lib/__tests__/pdfExport.test.ts`
Expected: PASS (the test asserts a Blob is produced; new rows don't break it). If it asserts on specific section text, update that assertion to the new "Opportunity & Contact" heading.

- [ ] **Step 3: Update SPECIFICATION.md**

In `docs/SPECIFICATION.md`, add a "Customer Questionnaire" subsection documenting: the standalone `/questionnaire` route; that it shares only schema + enums; the new optional sales/opportunity fields; PDF-with-embedded-JSON output imported via Step 00; and that the sales fields are informational (not used by gates/calc).

- [ ] **Step 4: Append CHANGELOG.md**

```markdown
- Customer questionnaire: standalone /questionnaire route capturing all Step 1 inputs +
  opportunity/sales context; exports a TAL-branded PDF (logo top-right, contact blocks) with
  embedded JSON importable via Step 00. App PDF now prints the imported opportunity fields.
```

- [ ] **Step 5: Full gate + commit**

Run: `npx tsc --noEmit && npm run check:arch && npx vitest run && npm run build`
Expected: all green; build lists `/questionnaire`.

```bash
git add src/lib/pdfExport.ts docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "feat(questionnaire): print imported sales fields in app PDF + docs"
```

---

## Final verification (after all tasks)

- `npx vitest run` — all green (incl. new schema/export/parity tests; existing rom/gates/trafficLight unaffected).
- `npx tsc --noEmit`, `npm run check:arch`, `npm run build` clean.
- Manual end-to-end: `/questionnaire` → fill → PDF (TAL logo top-right, contact + opportunity + specialty sections) → Step 00 "Import Customer Questionnaire" → Step 1 populated.
- Confirm `src/components/questionnaire/*`, `src/lib/questionnaire/*`, `app/questionnaire/*` import NO `storage.ts` (split-ready): `grep -rn "lib/storage" src/components/questionnaire src/lib/questionnaire app/questionnaire` returns nothing.
- `/simplify` then `/review` the diff; restart dev clean (CSS changed); commit + push to `origin main`.
