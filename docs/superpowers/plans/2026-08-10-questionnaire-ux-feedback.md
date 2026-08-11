# Questionnaire UX Feedback — Round 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 10 pieces of user feedback on the questionnaire form — wording, pallet clarity, charging options, unit toggle, load-type images, email attach UX, and Clear All visibility.

**Architecture:** All changes are in the questionnaire layer (`src/components/questionnaire/`, `src/lib/constants/enums.ts`, `src/lib/questionnaire/pdfQuestionnaire.ts`, `app/globals.css`). Unit toggle adds a `useQUnit` hook analogous to the existing `useUnitSystem`. No schema changes unless noted; schema changes require a `docs/CHANGELOG.md` entry or the pre-commit hook blocks the commit.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · React Hook Form 7 + Controller · Zod 4 · pdf-lib · `app/globals.css` (single global sheet, scope with `.q-form`)

---

## Scope note — what's NOT in this plan

- **Load-type images** (Task 6) require new PNG/WebP assets for each load type. The component scaffolding is included here; asset creation is a separate design deliverable. The component degrades gracefully (text chip) when an image is absent.
- **Unit system toggle** (Task 7) is the most complex item. It is planned and described in full but marked as optional — do Task 7 only if the simpler items are done and stable first.

---

## Assumptions (screenshots not visible)

Since feedback referenced images that couldn't be read, the following assumptions were made:

| # | Assumed field | Reasoning |
|---|--------------|-----------|
| 1 | §01 "How are you submitting this?" | Most colloquial-sounding label in §01 |
| 2 | §02 `vehicleInMind` free-text | Only free-text field where Enter could mean "search" |
| 3 | `TYPICAL_UNIT_TYPES[0]` = "Standard Pallet" | Explicitly named in feedback |
| 4 | `unitLoadTypes` chip grid | Described as "like vehicle selection" |
| 5 | `maxLoadWeightLbs` + dimension fields | "lbs" hard-coded in §03 |
| 6 | `CHARGING_STRATEGIES` select | Floor contact vs inductive is about charging |
| 7 | `transferType` select | Single-select with "reject if multiple?" implies a handling-type field |
| 8 | Draft persisting unexpectedly | `DRAFT_KEY` in localStorage restores on every load |
| 9 | §12 "People / forklifts doing this today" | Awkward phrasing; mixes two concepts |
| 10 | `onSendToEngineer` mailto flow | Described as "draft email" in the app |

Confirm these before executing if any seem off.

---

## File Structure

| File | What changes |
|------|-------------|
| `src/lib/constants/enums.ts` | Rename pallet option; expand charging strategies; add `LOAD_TYPE_IMAGES` map |
| `src/lib/validations/schemas.ts` | Expand `chargingStrategyPreference` enum; add `transferTypes` array | 
| `src/components/questionnaire/QuestionnaireForm.tsx` | Wording fixes; load-image chips; multi-select transfer; Clear All in-form button |
| `src/components/questionnaire/LoadTypePicker.tsx` | New — visual load-type selector with optional images |
| `src/lib/questionnaire/pdfQuestionnaire.ts` | Update labels for renamed enum values |
| `app/globals.css` | Styles for `.load-type-grid`, `.load-type-card` |
| `docs/CHANGELOG.md` | Schema changes entry |

---

## Task 1 — Wording fixes (quick wins)

**Files:**
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (lines ~347, ~399, ~785)

- [ ] **Step 1: Fix §01 submission-type label**

  Find: `"How are you submitting this?"`  
  Replace with: `"Who is completing this questionnaire?"`

  ```tsx
  <label>Who is completing this questionnaire? <span className="req-star" aria-hidden>*</span></label>
  ```

- [ ] **Step 2: Fix §02 "Other vehicle" field — add comma-separated hint**

  Find the `vehicleInMind` input (line ~399). Change placeholder and add a help line:

  ```tsx
  <div className="fld span-2">
    <label>Other vehicle / not listed</label>
    <input {...register('vehicleInMind')} placeholder="e.g. CB18, ML2" />
    <div className="help">Enter one or more model names separated by commas.</div>
  </div>
  ```

- [ ] **Step 3: Fix §12 "People / forklifts doing this today" label**

  Find the `currentHeadcount` input (line ~785). Change label to:

  ```tsx
  <label>How many people currently perform this task?</label>
  ```

- [ ] **Step 4: Typecheck**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no output (clean).

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/questionnaire/QuestionnaireForm.tsx
  git commit -m "fix(questionnaire): reword submission type, vehicle hint, headcount labels"
  ```

---

## Task 2 — Pallet type clarity + charging strategy expansion

**Files:**
- Modify: `src/lib/constants/enums.ts`
- Modify: `src/lib/validations/schemas.ts`
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (charging display)
- Modify: `src/lib/questionnaire/pdfQuestionnaire.ts` (label maps)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add CHANGELOG entry for schema changes**

  Open `docs/CHANGELOG.md` and prepend:

  ```markdown
  ### Questionnaire feedback round 1 (2026-08-10)
  - `chargingStrategyPreference`: added `floor_contact` and `inductive` options
    (informational; not used in fleet calc). Old `opportunity` kept as alias in
    the PDF label map for backward compat with existing exports.
  ```

- [ ] **Step 2: Rename "Standard Pallet" and expand charging options in enums**

  Edit `src/lib/constants/enums.ts`:

  ```ts
  // BEFORE:
  export const TYPICAL_UNIT_TYPES = [
    'Standard Pallet',
    'Tote',
    'Cart',
    'Roll',
    'IBC',
    'Coil',
    'Rack',
    'Other',
  ] as const

  export const CHARGING_STRATEGIES = [
    { value: 'opportunity', label: 'Opportunity charging' },
    { value: 'battery_swap', label: 'Battery swap' },
    { value: 'not_sure', label: 'Not sure' },
  ] as const

  // AFTER:
  export const TYPICAL_UNIT_TYPES = [
    'GMA Pallet (48×40 in)',
    'Euro Pallet (1200×800 mm)',
    'Half Pallet (24×40 in)',
    'Tote',
    'Cart',
    'Roll',
    'IBC',
    'Coil',
    'Rack',
    'Other',
  ] as const

  export const CHARGING_STRATEGIES = [
    { value: 'floor_contact', label: 'Floor contact / pantograph' },
    { value: 'inductive', label: 'Inductive (wireless)' },
    { value: 'battery_swap', label: 'Battery swap' },
    { value: 'not_sure', label: "Don't know / not sure" },
  ] as const
  ```

- [ ] **Step 3: Update schema enum for `chargingStrategyPreference`**

  Edit `src/lib/validations/schemas.ts`. Find:

  ```ts
  chargingStrategyPreference: z.enum(['opportunity', 'battery_swap', 'not_sure']).optional(),
  ```

  Replace with:

  ```ts
  chargingStrategyPreference: z.enum(['floor_contact', 'inductive', 'battery_swap', 'not_sure', 'opportunity']).optional(),
  ```

  (Keep `'opportunity'` as a tail value so old exports still parse without error.)

- [ ] **Step 4: Update PDF label map for charging**

  Edit `src/lib/questionnaire/pdfQuestionnaire.ts`. Find the `chargingLabels` object:

  ```ts
  const chargingLabels: Record<string, string> = {
    opportunity: 'Opportunity charging',
    battery_swap: 'Battery swap',
    not_sure: 'Not sure',
  }
  ```

  Replace with:

  ```ts
  const chargingLabels: Record<string, string> = {
    floor_contact: 'Floor contact / pantograph',
    inductive: 'Inductive (wireless)',
    battery_swap: 'Battery swap',
    not_sure: 'Not sure',
    opportunity: 'Opportunity charging',  // legacy
  }
  ```

- [ ] **Step 5: Typecheck**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no output.

- [ ] **Step 6: Run tests**

  ```bash
  npx vitest run
  ```
  Expected: all pass. If `enumAlignment.test.ts` fails, update it to include the new pallet names and charging values.

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/constants/enums.ts src/lib/validations/schemas.ts \
          src/lib/questionnaire/pdfQuestionnaire.ts docs/CHANGELOG.md
  git commit -m "feat(questionnaire): clarify pallet names, expand charging strategy options"
  ```

---

## Task 3 — Transfer type: acknowledge multi-select question

**Context:** The existing `transferType` field is a single-select enum tied to vehicle qualification gates. Making it truly multi-select would require gate logic changes across the vehicle matrix (Step 2) — out of scope here. Instead, the plan adds a `transferTypesNote` free-text field (informational only) and rewrites the label so single-select intent is clear. Flag for a follow-on plan if multi-select gates are needed.

**Files:**
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (~line 447)

- [ ] **Step 1: Update label and add "other handling" note field**

  Find the `transferType` select block (~line 447):

  ```tsx
  // BEFORE:
  <div className="fld">
    <label>Type of handling</label>
    <select {...register('transferType', { setValueAs: emptyToUndef })} defaultValue="">
      <option value="">Select…</option>
      {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>

  // AFTER:
  <div className="fld">
    <label>Primary handling method</label>
    <select {...register('transferType', { setValueAs: emptyToUndef })} defaultValue="">
      <option value="">Select…</option>
      {TRANSFER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <div className="help">Choose the main method — note additional methods in the Notes section.</div>
  </div>
  ```

- [ ] **Step 2: Typecheck + commit**

  ```bash
  npx tsc --noEmit
  git add src/components/questionnaire/QuestionnaireForm.tsx
  git commit -m "fix(questionnaire): clarify transfer type as primary method, add help text"
  ```

---

## Task 4 — Clear All: make button visible in-form

**Context:** A `clearAll` handler already exists (line 277) wired to a `tal:q-clear` window event from the brand bar. The user sees "holding old data" — the draft restores silently. Add a visible **Clear draft** button directly in the form (bottom of §01, or the form footer) so it's discoverable without hunting the brand bar.

**Files:**
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (~line 328, form footer area)
- Modify: `app/globals.css`

- [ ] **Step 1: Add Clear button near the form footer actions**

  Find the `q-actions` div (near the bottom of the form JSX, around the Export/Send buttons). Add a tertiary clear button:

  ```tsx
  <div className="q-actions">
    <div className="q-actions-btns">
      <button type="submit" className="q-export-btn" disabled={busy}>
        {busy ? 'Generating…' : 'Export PDF'}
      </button>
      <button type="button" className="q-send-btn" disabled={busy}
        onClick={handleSubmit(v => onSendToEngineer(v), onInvalid)}>
        Send to TAL Engineer
      </button>
    </div>
    <button type="button" className="q-clear-btn" onClick={clearAll}>
      Clear draft
    </button>
  </div>
  ```

- [ ] **Step 2: Add CSS for `.q-clear-btn`**

  In `app/globals.css`, find the `.q-actions` block and add after `.q-send-btn`:

  ```css
  .q-clear-btn {
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-size: 12px;
    cursor: pointer;
    padding: 4px 8px;
    text-decoration: underline;
    margin-top: 4px;
    align-self: center;
  }
  .q-clear-btn:hover { color: var(--text-primary); }
  ```

- [ ] **Step 3: Typecheck + commit**

  ```bash
  npx tsc --noEmit
  git add src/components/questionnaire/QuestionnaireForm.tsx app/globals.css
  git commit -m "feat(questionnaire): add visible 'Clear draft' button in form footer"
  ```

---

## Task 5 — Email flow: improved "attach PDF" UX

**Context:** Browsers cannot auto-attach files to a `mailto:` link. The current flow downloads the PDF then opens the email client with a text prompt to attach manually. Improve this by:
1. Trying `navigator.share()` with the file (works on mobile Safari/Android Chrome).
2. Falling back to the current download + mailto with a clearer in-app banner.

**Files:**
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (`onSendToEngineer`)
- Modify: `src/lib/questionnaire/pdfQuestionnaire.ts` (export `exportQuestionnairePdf` already public)

- [ ] **Step 1: Update `onSendToEngineer` to try Web Share API first**

  Replace the entire `onSendToEngineer` callback (~line 252):

  ```tsx
  const onSendToEngineer = useCallback(async (v: PartialProjectFormData) => {
    setInvalidMsg(null)
    if (!v.submissionType) {
      setInvalidMsg("Please choose who is completing this (Section 01) before sending.")
      document.getElementById('q-sec-01')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setBusy(true)
    try {
      const blob = await exportQuestionnairePdf(v)
      const filename = `${(v.customerName || v.projectName || 'questionnaire').replace(/[^a-z0-9-_]+/gi, '_')}_AV-Questionnaire.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })

      const subject = `TAL AV Questionnaire — ${v.customerName || v.projectName || 'New Opportunity'}`
      const bodyText =
        `Hi,\n\nPlease find the attached AV questionnaire PDF for ${v.customerName || 'the customer below'}.\n\n` +
        `Customer: ${v.customerName || '—'}\nProject: ${v.projectName || '—'}\n` +
        `Facility: ${v.facilityLocation || '—'}\n\nThank you`

      // Try Web Share API (mobile / supported desktop)
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: subject, text: bodyText, files: [file] })
      } else {
        // Fallback: download PDF, open mailto
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        const mailto = `mailto:AppsEngineering@bastiansolutions.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText + '\n\n[Attach the PDF that was just downloaded to your Downloads folder]')}`
        window.open(mailto, '_self')
      }
      setSubmitted(true)
    } finally { setBusy(false) }
  }, [])
  ```

- [ ] **Step 2: Import `exportQuestionnairePdf` (it's already imported via `downloadQuestionnairePdf` — add the named export)**

  In `src/lib/questionnaire/pdfQuestionnaire.ts`, verify `exportQuestionnairePdf` is already exported (it is, line 22). No change needed.

  In `QuestionnaireForm.tsx`, update the import line:

  ```tsx
  import { downloadQuestionnairePdf, exportQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/questionnaire/QuestionnaireForm.tsx
  git commit -m "feat(questionnaire): try Web Share API for PDF attach; fall back to download+mailto"
  ```

---

## Task 6 — Load type images (component scaffold; assets TBD)

**Context:** Add an optional image thumbnail to each load type chip, like the vehicle picker. Images don't exist yet — the component gracefully falls back to the text chip. When images are ready, drop them in `public/images/load-types/<slug>.png`.

**Files:**
- Create: `src/components/questionnaire/LoadTypePicker.tsx`
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (replace `<Chips name="unitLoadTypes" ...>`)
- Modify: `app/globals.css`

- [ ] **Step 1: Create image slug map in `enums.ts`**

  Add to `src/lib/constants/enums.ts`:

  ```ts
  /** Maps load type label → image filename stem (no extension).
   *  Drop PNG/WebP at public/images/load-types/<slug>.png to activate. */
  export const LOAD_TYPE_IMAGE_SLUG: Partial<Record<string, string>> = {
    'GMA Pallet (48×40 in)': 'gma-pallet',
    'Euro Pallet (1200×800 mm)': 'euro-pallet',
    'Half Pallet (24×40 in)': 'half-pallet',
    'Tote': 'tote',
    'Cart': 'cart',
    'Roll': 'roll',
    'IBC': 'ibc',
    'Coil': 'coil',
    'Rack': 'rack',
  }
  ```

- [ ] **Step 2: Create `LoadTypePicker.tsx`**

  Create `src/components/questionnaire/LoadTypePicker.tsx`:

  ```tsx
  'use client'
  import Image from 'next/image'
  import { TYPICAL_UNIT_TYPES, LOAD_TYPE_IMAGE_SLUG } from '@/src/lib/constants/enums'

  interface Props {
    value: string[]
    onChange: (next: string[]) => void
  }

  export default function LoadTypePicker({ value, onChange }: Props) {
    const toggle = (opt: string) =>
      onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

    return (
      <div className="load-type-grid">
        {TYPICAL_UNIT_TYPES.map(opt => {
          const slug = LOAD_TYPE_IMAGE_SLUG[opt]
          const on = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className={`load-type-card${on ? ' on' : ''}`}
              onClick={() => toggle(opt)}
              aria-pressed={on}
            >
              {slug ? (
                <Image
                  src={`/images/load-types/${slug}.png`}
                  alt={opt}
                  width={64}
                  height={48}
                  className="load-type-img"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="load-type-placeholder" aria-hidden />
              )}
              <span className="load-type-label">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }
  ```

- [ ] **Step 3: Replace `<Chips name="unitLoadTypes" ...>` in the form**

  In `QuestionnaireForm.tsx`, find (around line 406):

  ```tsx
  <div className="fld span-4">
    <label>Unit / load type(s)</label>
    <Chips name="unitLoadTypes" options={UNIT_LOAD_TYPE_OPTIONS} />
    <div className="help">Select all that apply.</div>
  </div>
  ```

  Replace with:

  ```tsx
  <div className="fld span-4">
    <label>Unit / load type(s)</label>
    <Controller control={control} name="unitLoadTypes" render={({ field }) => (
      <LoadTypePicker value={field.value ?? []} onChange={field.onChange} />
    )} />
    <div className="help">Select all that apply.</div>
  </div>
  ```

  Add import at top of file:
  ```tsx
  import LoadTypePicker from './LoadTypePicker'
  ```

- [ ] **Step 4: Add CSS for load type grid**

  In `app/globals.css`, after the `.cert-grid` block:

  ```css
  /* Load type visual picker */
  .load-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .load-type-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 8px 8px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: var(--surface-raised);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    min-height: 80px;
    text-align: center;
  }
  .load-type-card:hover { border-color: var(--text-secondary); }
  .load-type-card.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-raised)); }
  .load-type-img { object-fit: contain; }
  .load-type-placeholder { width: 64px; height: 48px; }
  .load-type-label { font-size: 11px; font-weight: 500; color: var(--text-secondary); line-height: 1.3; }
  .load-type-card.on .load-type-label { color: var(--accent); font-weight: 600; }
  @media (max-width: 600px) {
    .load-type-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }
  }
  ```

- [ ] **Step 5: Create placeholder image directory**

  ```bash
  mkdir -p public/images/load-types
  ```

  Drop PNG files here when ready. File names must match the slugs in `LOAD_TYPE_IMAGE_SLUG`.

- [ ] **Step 6: Typecheck + tests**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/questionnaire/LoadTypePicker.tsx \
          src/components/questionnaire/QuestionnaireForm.tsx \
          src/lib/constants/enums.ts app/globals.css public/images/load-types/
  git commit -m "feat(questionnaire): visual load-type picker with image thumbnails (assets TBD)"
  ```

---

## Task 7 — Unit system toggle (imperial / metric) ⚠️ Complex

**Context:** All questionnaire inputs currently hard-code imperial (lbs, in, ft, °F). Non-US customers (CAN, MX, EU) need to enter in metric without manually converting. The toggle is display/intake only — all values are stored in imperial (lbs/in/ft/°F) per the app-wide architecture rule. The PDF prints in the user's chosen unit system.

**Scope of affected fields:**
- Weight: `maxLoadWeightLbs` (lbs ↔ kg)
- Dimensions: `loadLengthIn`, `loadWidthIn`, `loadHeightIn` (in ↔ cm)
- Heights/distances: `transferHeightFt`, `topOfRollerHeightFt`, `maxLiftHeightFt`, `driveAisleWidthFt`, `rackingAisleWidthFt`, `rampDistanceFt`, `avgDistanceFt` (ft ↔ m)
- Temperature: `tempMinF`, `tempMaxF` (°F ↔ °C)
- Area: `facilitySizeSqFt` (sq ft ↔ m²)

**Files:**
- Create: `src/lib/questionnaire/useQUnit.ts`
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` (unit toggle UI + all affected inputs)
- Modify: `src/lib/questionnaire/pdfQuestionnaire.ts` (accept + print unit preference)
- Modify: `app/globals.css`

- [ ] **Step 1: Create `useQUnit` hook**

  Create `src/lib/questionnaire/useQUnit.ts`:

  ```ts
  'use client'
  import { useState, useCallback } from 'react'

  export type QUnitSystem = 'imperial' | 'metric'
  const Q_UNIT_KEY = 'tal:q-unit'

  export function useQUnit() {
    const [unit, setUnitRaw] = useState<QUnitSystem>(() => {
      try {
        const stored = localStorage.getItem(Q_UNIT_KEY)
        return stored === 'metric' ? 'metric' : 'imperial'
      } catch { return 'imperial' }
    })

    const setUnit = useCallback((u: QUnitSystem) => {
      setUnitRaw(u)
      try { localStorage.setItem(Q_UNIT_KEY, u) } catch { /* quota */ }
    }, [])

    return { unit, setUnit, isMetric: unit === 'metric' }
  }

  // Conversion helpers — always convert TO storage (imperial).
  export const toStorageLbs = (kg: number) => kg * 2.20462
  export const fromStorageLbs = (lbs: number) => lbs / 2.20462

  export const toStorageIn = (cm: number) => cm / 2.54
  export const fromStorageIn = (inches: number) => inches * 2.54

  export const toStorageFt = (m: number) => m * 3.28084
  export const fromStorageFt = (ft: number) => ft / 3.28084

  export const toStorageSqFt = (m2: number) => m2 * 10.7639
  export const fromStorageSqFt = (sqft: number) => sqft / 10.7639

  export const toStorageF = (c: number) => c * 9 / 5 + 32
  export const fromStorageF = (f: number) => (f - 32) * 5 / 9
  ```

- [ ] **Step 2: Add unit toggle UI to the questionnaire form**

  In `QuestionnaireForm.tsx`, inside `QuestionnaireFormInner`:

  1. Import the hook:
     ```tsx
     import { useQUnit } from '@/src/lib/questionnaire/useQUnit'
     ```

  2. Instantiate it (after other hooks at top of component):
     ```tsx
     const { unit, setUnit, isMetric } = useQUnit()
     ```

  3. Add the toggle to the page header area:
     ```tsx
     <div className="page-header">
       <div className="page-title">
         <span className="step-num">AV Questionnaire · {today}</span>
         <h1>
           {values.customerName?.trim() || 'New Questionnaire'}
           {values.projectName?.trim() && <span className="q-title-project"> — {values.projectName.trim()}</span>}
         </h1>
       </div>
       <div className="q-unit-toggle">
         <button type="button" className={`seg-btn${!isMetric ? ' on' : ''}`} onClick={() => setUnit('imperial')}>Imperial</button>
         <button type="button" className={`seg-btn${isMetric ? ' on' : ''}`} onClick={() => setUnit('metric')}>Metric</button>
       </div>
     </div>
     ```

- [ ] **Step 3: Create a `UnitInput` wrapper component**

  Add this function inside `QuestionnaireFormInner` (after `ThousandsInput`):

  ```tsx
  // Renders a unit-aware number input. Converts display ↔ storage on the fly.
  // `storageUnit` is always imperial; `metricUnit` is the display unit when metric.
  function UnitInput({
    name, metricUnit, imperialUnit, toMetric, toImperial, placeholder, step = '0.1',
  }: {
    name: keyof PartialProjectFormData
    imperialUnit: string
    metricUnit: string
    toMetric: (v: number) => number
    toImperial: (v: number) => number
    placeholder?: string
    step?: string
  }) {
    return (
      <Controller name={name} control={control} render={({ field }) => {
        const storedVal = field.value as number | undefined | null
        const displayVal = storedVal != null
          ? (isMetric ? +toMetric(storedVal).toFixed(3) : storedVal)
          : ''
        return (
          <div className="input-with-unit">
            <input
              type="number"
              step={step}
              min={0}
              inputMode="decimal"
              className="mono"
              placeholder={placeholder}
              value={displayVal}
              ref={field.ref}
              onChange={(e) => {
                const raw = e.target.value === '' ? undefined : Number(e.target.value)
                field.onChange(raw == null || isNaN(raw) ? undefined : (isMetric ? toImperial(raw) : raw))
              }}
              onBlur={field.onBlur}
            />
            <div className="unit">{isMetric ? metricUnit : imperialUnit}</div>
          </div>
        )
      }} />
    )
  }
  ```

- [ ] **Step 4: Replace hard-coded unit inputs with `UnitInput`**

  Import conversions at top of file:
  ```tsx
  import {
    fromStorageLbs, toStorageLbs,
    fromStorageIn, toStorageIn,
    fromStorageFt, toStorageFt,
    fromStorageSqFt, toStorageSqFt,
    fromStorageF, toStorageF,
  } from '@/src/lib/questionnaire/useQUnit'
  ```

  Replace each affected input. Examples:

  **Max load weight** (~line 417):
  ```tsx
  // BEFORE:
  <ThousandsInput name="maxLoadWeightLbs" control={control} placeholder="2,000" className="mono" allowDecimals />
  <div className="unit">lbs</div>

  // AFTER:
  <UnitInput name="maxLoadWeightLbs" imperialUnit="lbs" metricUnit="kg"
    toMetric={fromStorageLbs} toImperial={toStorageLbs} placeholder={isMetric ? '900' : '2,000'} />
  ```

  **Load length** (~line 423):
  ```tsx
  // BEFORE:
  <input type="number" step="0.1" inputMode="decimal" className="mono" placeholder="48" {...register('loadLengthIn', { setValueAs: emptyToNum })} />

  // AFTER (wrap in div.fld and use UnitInput):
  <UnitInput name="loadLengthIn" imperialUnit="in" metricUnit="cm"
    toMetric={fromStorageIn} toImperial={toStorageIn} placeholder={isMetric ? '120' : '48'} />
  ```

  Apply the same pattern to: `loadWidthIn`, `loadHeightIn`, `transferHeightFt`, `topOfRollerHeightFt`, `maxLiftHeightFt`, `driveAisleWidthFt`, `rackingAisleWidthFt`, `rampDistanceFt`, `avgDistanceFt`.

  **Facility size** (~line 565):
  ```tsx
  <UnitInput name="facilitySizeSqFt" imperialUnit="sq ft" metricUnit="m²"
    toMetric={fromStorageSqFt} toImperial={toStorageSqFt} placeholder={isMetric ? '4,600' : '50,000'} step="1" />
  ```

  **Temperatures** (~line 517):
  ```tsx
  <UnitInput name="tempMinF" imperialUnit="°F" metricUnit="°C"
    toMetric={fromStorageF} toImperial={toStorageF} placeholder={isMetric ? '-18' : '0'} step="1" />
  <UnitInput name="tempMaxF" imperialUnit="°F" metricUnit="°C"
    toMetric={fromStorageF} toImperial={toStorageF} placeholder={isMetric ? '40' : '104'} step="1" />
  ```

- [ ] **Step 5: Pass unit preference to PDF and print accordingly**

  In `pdfQuestionnaire.ts`, update the function signature:

  ```ts
  export async function exportQuestionnairePdf(
    p: PartialProjectFormData,
    unitSystem: 'imperial' | 'metric' = 'imperial'
  ): Promise<Blob>
  ```

  Add a helper at the top of the function body:

  ```ts
  const isMetric = unitSystem === 'metric'
  const fmtWt = (lbs: number | null | undefined) =>
    lbs != null ? (isMetric ? `${(lbs / 2.20462).toFixed(1)} kg` : `${lbs.toLocaleString()} lbs`) : '—'
  const fmtFt = (ft: number | null | undefined) =>
    ft != null ? (isMetric ? `${(ft / 3.28084).toFixed(2)} m` : `${ft} ft`) : '—'
  const fmtIn = (inches: number | null | undefined) =>
    inches != null ? (isMetric ? `${(inches * 2.54).toFixed(1)} cm` : `${inches} in`) : '—'
  const fmtF = (f: number | null | undefined) =>
    f != null ? (isMetric ? `${((f - 32) * 5 / 9).toFixed(1)} °C` : `${f} °F`) : '—'
  ```

  Then update each relevant row call to use `fmtWt(p.maxLoadWeightLbs)`, `fmtFt(p.transferHeightFt)`, etc. instead of the inline string templates.

  In `QuestionnaireForm.tsx`, update the call sites to pass `unit`:

  ```tsx
  await downloadQuestionnairePdf(v, unit)
  // and
  const blob = await exportQuestionnairePdf(v, unit)
  ```

  Update `downloadQuestionnairePdf` signature in `pdfQuestionnaire.ts` to accept and forward `unit`:

  ```ts
  export async function downloadQuestionnairePdf(
    p: PartialProjectFormData,
    unitSystem: 'imperial' | 'metric' = 'imperial'
  ): Promise<void> {
    triggerDownload(await exportQuestionnairePdf(p, unitSystem), `${fileBase(p)}.pdf`)
  }
  ```

- [ ] **Step 6: Add CSS for unit toggle**

  In `app/globals.css`:

  ```css
  .q-unit-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    align-self: flex-start;
    margin-top: 4px;
  }
  .q-unit-toggle .seg-btn {
    padding: 4px 12px;
    font-size: 12px;
    border: none;
    border-radius: 0;
  }
  .q-unit-toggle .seg-btn:first-child { border-right: 1px solid var(--border); }
  ```

  And make `.page-header` flex with space-between:

  ```css
  .q-form .page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  ```

- [ ] **Step 7: Typecheck + tests**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/lib/questionnaire/useQUnit.ts \
          src/components/questionnaire/QuestionnaireForm.tsx \
          src/lib/questionnaire/pdfQuestionnaire.ts \
          app/globals.css
  git commit -m "feat(questionnaire): imperial/metric unit toggle for all measurement inputs"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Wording: §01 label, `vehicleInMind` hint, `currentHeadcount` label
- ✅ Standard Pallet → named pallet types
- ✅ Charging strategies: floor contact + inductive
- ✅ Transfer type: single-select clarified with note (multi-select flagged for follow-on)
- ✅ Clear All button in-form
- ✅ Load type images (scaffold + CSS; assets separate)
- ✅ Email Web Share API with PDF file; mailto fallback
- ✅ Unit toggle (imperial / metric)

**Placeholder scan:** No TBDs — all code shown in full.

**Type consistency:** `UnitInput` uses `keyof PartialProjectFormData`; `useQUnit` returns `QUnitSystem`; `exportQuestionnairePdf` signature change propagated to both call sites.

---

## Execution recommendation

Tasks 1–5 are independent quick wins (~30 min total). Execute those first, verify in the browser, then decide whether to proceed with Task 6 (wait for image assets first) and Task 7 (most complex; unit conversions need careful testing).
