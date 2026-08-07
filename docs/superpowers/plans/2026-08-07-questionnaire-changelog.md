# Questionnaire Change-Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the TAL AV Questionnaire change log (17→15 new fields, 2 field-type changes, 4 logic fixes, 2 field moves) to `/questionnaire`, evaluate/fix the status bar, and keep the PDF-embedded-JSON round-trip into the main app intact.

**Architecture:** The questionnaire (`src/components/questionnaire/QuestionnaireForm.tsx`) is a standalone customer form whose every field key must be a real `projectSchema` key (enforced by `questionnaireParity.test.ts`). It exports a TAL-branded PDF with the project JSON embedded (`{schemaVersion, exportedAt, project}` envelope) that the main app imports via Step 00 (`importProjectFromJson`). Therefore every new field is added to `projectSchema` first, then wired into the form; legacy singular fields the main-app calc reads (`typicalUnitType`, `minAisleWidthFt`) are kept populated for back-compat. No backend is added (per decision: file-upload/auto-email/signed-URL items are **skipped**).

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript strict, React Hook Form 7 + `@hookform/resolvers/zod`, Zod 4, Vitest, `pdf-lib` (questionnaire PDF).

**Decisions carried in from brainstorming:**
- **Skip** `cad_file_upload`, `rfq_file_upload`, auto-email, and signed-URL routing (no backend). Keep their existing Y/N triggers (`cadAvailable`, `isRfq`).
- **Keep** the client-side "separate JSON file alongside the PDF" output item (no backend needed).
- `submission_type` is **required on export in the questionnaire only** (not a main-app step gate).

**Global conventions (apply in every task):**
- New enum option lists go in `src/lib/constants/enums.ts` (single source of truth — never inline arrays in the form; `enumAlignment.test.ts` guards this).
- New schema keys are all `.optional()` (or `.default([])` for arrays) — partial projects stay valid.
- Multi-select chip fields reuse the existing `Chips` helper; add the new field name to the `Chips`/`YesNo` union types so parity's regex still matches and TS is happy.
- After each task: `npx tsc --noEmit` clean and `npx vitest run` green before commit.
- CHANGELOG note: `schemas.ts` changes are gated by `.githooks/pre-commit` (requires a `docs/CHANGELOG.md` entry in the same commit). Every task that edits `schemas.ts` MUST also add a CHANGELOG line.

---

## File Structure

- Modify: `src/lib/validations/schemas.ts` — add ~20 new keys to `projectSchema`; add `distanceType` to `flowSchema`.
- Modify: `src/lib/constants/enums.ts` — add `SUBMISSION_TYPES`, `CHARGING_STRATEGIES`, `SHARED_TRAFFIC_TYPES`, `GUIDANCE_TYPES`, `REST_API_OPTIONS`, `WMS_INTERFACE_TYPES`, `TAGGING_SCAN_METHODS`, `UNIT_LOAD_TYPE_OPTIONS` (alias of `TYPICAL_UNIT_TYPES` for multi-select).
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx` — the bulk of the work (new fields, conditionals, moves, `SECTIONS.fields` updates, dual-download).
- Modify: `src/components/questionnaire/QuestionnaireNav.tsx` — status-bar evaluation fixes (required marker for Section 01).
- Modify: `src/lib/questionnaire/questionnaireExport.ts` — keep `normalizeForPort` correct; keep singular back-compat mirrors (aisle, unit type) here or in the form (decision: mirror in the form on change so the draft/PDF both carry it).
- Modify: `src/lib/__tests__/questionnaireExport.test.ts` — round-trip coverage for new fields + back-compat mirrors.
- Modify: `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`, `docs/questionnaire-interop.md`.

**Schema key map (change-log field → schema key → notes):**

| Change-log field | New schema key | Type | Notes |
|---|---|---|---|
| submission_type | `submissionType` | `enum(['customer','dealer','internal','partner'])` | required on export (form-level) |
| partner_company_name | `partnerCompanyName` | string | cond. partner |
| partner_rep_contact | `partnerRepContact` | string | cond. partner |
| internal_account_id | `internalAccountId` | string | cond. internal |
| dealership_name | `dealershipName` | string | **exists** — move UI to §01 |
| dealer_rep | `dealerRep` | string | **exists** — move UI to §01 |
| unit_load_type (multi) | `unitLoadTypes` | `array(string)` | new; mirror `unitLoadTypes[0]`→`typicalUnitType` |
| dwell_time_pickup_dropoff | `dwellTimeMin` | number | always visible |
| charging_strategy | `chargingStrategyPreference` | `enum(['opportunity','battery_swap','not_sure'])` | name avoids engine `chargeRegime` clash |
| top_of_roller_height | `topOfRollerHeightFt` | number | cond. handling=Lift table |
| max_lift_height | `maxLiftHeightFt` | number | **exists** — surface cond. Forklift/VNA |
| drive_aisle_width | `driveAisleWidthFt` | number | mirror `min(drive,racking)`→`minAisleWidthFt` |
| racking_aisle_width | `rackingAisleWidthFt` | number | emphasized helper when VNA |
| shared_traffic_type (multi) | `sharedTrafficTypes` | `array(string)` | |
| guidance_type | `guidanceType` | `enum(['wire','rail'])` | cond. Specialty=VNA |
| ramps_grade (Y/N + %) | `rampRequired` + `maxRampGrade` | **exist** | surface cond. Outdoor |
| hazard_zone_classification | `hazardZoneClassification` | string | cond. ATEX/IECEx; required-if-shown |
| rest_api_available | `restApiAvailable` | `enum(['yes','no','not_sure'])` | cond. wmsRequired |
| barcode_scanning_required | `barcodeScanningRequired` | boolean | always visible |
| wms_interface_type | `wmsInterfaceType` | `enum` | cond. wmsRequired |
| tagging_scan_method | `taggingScanMethod` | `enum` | cond. wmsRequired |
| existing_automation_today | `hasExistingAutomation` | boolean | toggle; keep `existingAutomation` text as follow-up |
| existing_automation_interop | `existingAutomationInterop` | string | cond. hasExistingAutomation |
| current_headcount_equipment | `currentHeadcount` | number | always visible |
| per-flow distance type | `flowSchema.distanceType` | `enum(['one_way','round_trip']).optional()` | per-row |

---

## Task 1: Schema + enum additions (foundation)

**Files:**
- Modify: `src/lib/constants/enums.ts` (append after `PROJECT_DRIVERS`, before the `type` exports at line 69)
- Modify: `src/lib/validations/schemas.ts` (`flowSchema` ~line 15–27; `projectSchema` — append new keys in the "Customer questionnaire" block ~line 174–209)
- Modify: `docs/CHANGELOG.md` (required by pre-commit hook)
- Test: `src/lib/__tests__/questionnaireSchema.test.ts` (new)

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/questionnaireSchema.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { projectSchema, flowSchema } from '@/src/lib/validations/schemas'

describe('questionnaire change-log schema additions', () => {
  const keys = new Set(Object.keys(projectSchema.shape))
  const expected = [
    'submissionType', 'partnerCompanyName', 'partnerRepContact', 'internalAccountId',
    'unitLoadTypes', 'dwellTimeMin', 'chargingStrategyPreference', 'topOfRollerHeightFt',
    'driveAisleWidthFt', 'rackingAisleWidthFt', 'sharedTrafficTypes', 'guidanceType',
    'hazardZoneClassification', 'restApiAvailable', 'barcodeScanningRequired',
    'wmsInterfaceType', 'taggingScanMethod', 'hasExistingAutomation',
    'existingAutomationInterop', 'currentHeadcount',
  ]
  it('adds every new key', () => {
    for (const k of expected) expect(keys.has(k), k).toBe(true)
  })
  it('all new keys are optional (partial project stays valid)', () => {
    expect(projectSchema.partial().safeParse({}).success).toBe(true)
    expect(projectSchema.safeParse({}).success).toBe(true)
  })
  it('flow gets an optional per-row distanceType', () => {
    expect('distanceType' in flowSchema.shape).toBe(true)
    expect(flowSchema.safeParse({ id: 'f1' }).success).toBe(true)
    expect(flowSchema.safeParse({ id: 'f1', distanceType: 'round_trip' }).success).toBe(true)
  })
  it('submissionType accepts the four values and rejects others', () => {
    for (const v of ['customer', 'dealer', 'internal', 'partner'])
      expect(projectSchema.safeParse({ submissionType: v }).success).toBe(true)
    expect(projectSchema.safeParse({ submissionType: 'nope' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/questionnaireSchema.test.ts`
Expected: FAIL (keys not present / distanceType missing).

- [ ] **Step 3: Add enum option lists** — append to `src/lib/constants/enums.ts` immediately before line 69 (`export type TransferMethod`):

```ts
/** Customer-questionnaire: who is submitting (§01). */
export const SUBMISSION_TYPES = [
  { value: 'customer', label: 'Customer (Direct)' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'internal', label: 'Internal (TAL Regional Office)' },
  { value: 'partner', label: '3rd Party Partner' },
] as const

/** §04 charging strategy preference (customer view — informational). */
export const CHARGING_STRATEGIES = [
  { value: 'opportunity', label: 'Opportunity charging' },
  { value: 'battery_swap', label: 'Battery swap' },
  { value: 'not_sure', label: 'Not sure' },
] as const

/** §05 shared traffic in the operating area (multi-select). */
export const SHARED_TRAFFIC_TYPES = [
  'Pedestrians', 'Manual forklifts', 'Other AGVs', 'None',
] as const

/** §05 VNA guidance type. */
export const GUIDANCE_TYPES = [
  { value: 'wire', label: 'Wire' },
  { value: 'rail', label: 'Rail' },
] as const

/** §09 REST API availability tri-state. */
export const REST_API_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
] as const

/** §09 WMS interface type. */
export const WMS_INTERFACE_TYPES = [
  { value: 'rest_api', label: 'REST API' },
  { value: 'file', label: 'File exchange (CSV/flat file)' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'other', label: 'Other' },
] as const

/** §09 tagging / scan method. */
export const TAGGING_SCAN_METHODS = [
  { value: 'barcode', label: 'Barcode' },
  { value: 'qr', label: 'QR' },
  { value: 'rfid', label: 'RFID' },
  { value: 'none', label: 'None' },
] as const

/** §03 unit/load type multi-select (same options as the singular list). */
export const UNIT_LOAD_TYPE_OPTIONS = TYPICAL_UNIT_TYPES
```

- [ ] **Step 4: Add `distanceType` to `flowSchema`** — in `src/lib/validations/schemas.ts`, inside `flowSchema` (after line 26 `sectionName: z.string().optional(),`):

```ts
  /** Per-flow distance semantics (questionnaire §07). Display/intake only —
   *  Step 3 sizing continues to use the flow's distanceFt directly. */
  distanceType: z.enum(['one_way', 'round_trip']).optional(),
```

- [ ] **Step 5: Add new keys to `projectSchema`** — in `src/lib/validations/schemas.ts`, append inside the "Customer questionnaire: opportunity / sales context" block (after line 209 `currentToyotaForklifts: z.string().optional(),`, before the `// Section 13` comment):

```ts
  // ---- Customer questionnaire change-log additions (2026-08-07) ----
  // §01 submitter routing
  submissionType: z.enum(['customer', 'dealer', 'internal', 'partner']).optional(),
  partnerCompanyName: z.string().optional(),
  partnerRepContact: z.string().optional(),
  internalAccountId: z.string().optional(),
  // §03 load types (multi). Legacy singular `typicalUnitType` mirrors [0] on save.
  unitLoadTypes: z.array(z.string()).max(20).default([]),
  // §04 handling detail
  dwellTimeMin: z.number().min(0).optional().nullable(),
  chargingStrategyPreference: z.enum(['opportunity', 'battery_swap', 'not_sure']).optional(),
  topOfRollerHeightFt: z.number().min(0).optional().nullable(),
  // §05 environment. driveAisle/rackingAisle mirror min()→minAisleWidthFt on save.
  driveAisleWidthFt: z.number().min(0).optional().nullable(),
  rackingAisleWidthFt: z.number().min(0).optional().nullable(),
  sharedTrafficTypes: z.array(z.string()).max(10).default([]),
  guidanceType: z.enum(['wire', 'rail']).optional(),
  // §09 certs / controls
  hazardZoneClassification: z.string().optional(),
  restApiAvailable: z.enum(['yes', 'no', 'not_sure']).optional(),
  barcodeScanningRequired: z.boolean().optional(),
  wmsInterfaceType: z.enum(['rest_api', 'file', 'middleware', 'other']).optional(),
  taggingScanMethod: z.enum(['barcode', 'qr', 'rfid', 'none']).optional(),
  // §12 current-state
  hasExistingAutomation: z.boolean().optional(),
  existingAutomationInterop: z.string().optional(),
  currentHeadcount: z.number().min(0).optional().nullable(),
```

- [ ] **Step 6: Add CHANGELOG entry** — prepend under the latest heading in `docs/CHANGELOG.md`:

```markdown
### Questionnaire change log (2026-08-07)
- Added ~20 questionnaire intake fields to `projectSchema` (submitter routing, multi
  load types, aisle split, shared traffic, VNA guidance, WMS/hazard/barcode controls,
  current-state). All optional/informational — ignored by gates and calc. Added optional
  per-flow `distanceType` to `flowSchema` (intake only; Step 3 sizing unchanged).
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/lib/__tests__/questionnaireSchema.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/constants/enums.ts src/lib/validations/schemas.ts docs/CHANGELOG.md src/lib/__tests__/questionnaireSchema.test.ts
git commit -m "feat(questionnaire): add change-log schema + enum fields"
```

---

## Task 2: Section 01 — submitter routing (submission_type + conditional clusters + moved dealer)

**Files:**
- Modify: `src/components/questionnaire/QuestionnaireForm.tsx`
  - imports (line 14–17): add the new enum imports.
  - `SECTIONS[0]` fields array (line 45–46): add new field keys.
  - `YesNo`/`Chips` unions: not needed here (uses `Controller`).
  - `FormSection id="q-sec-01"` body (line 226–242): add submission-type select + conditional clusters.

- [ ] **Step 1: Extend enum imports** — replace the import block at lines 14–17:

```tsx
import {
  TYPICAL_UNIT_TYPES, CERTIFICATIONS, TRANSFER_TYPE_OPTIONS,
  SPECIALTY_APPLICATIONS, PROJECT_DRIVERS,
  SUBMISSION_TYPES, CHARGING_STRATEGIES, SHARED_TRAFFIC_TYPES, GUIDANCE_TYPES,
  REST_API_OPTIONS, WMS_INTERFACE_TYPES, TAGGING_SCAN_METHODS,
} from '@/src/lib/constants/enums'
```

- [ ] **Step 2: Update `SECTIONS[0]`** (line 45–46) fields list:

```tsx
  { id: 'q-sec-01', num: '01', short: 'About you', tier: TIER_START,
    fields: ['submissionType', 'customerName', 'facilityLocation', 'customerContactName', 'customerContactRole', 'customerContactEmail', 'dealershipName', 'dealerRep', 'partnerCompanyName', 'partnerRepContact', 'internalAccountId'] },
```

- [ ] **Step 3: Add a `submissionType` branch flag** — after line 141 (`const unitType = values.typicalUnitType`) add:

```tsx
  const submissionType = values.submissionType
```

- [ ] **Step 4: Render submission-type + clusters** — replace the Section 01 `.fld-grid-3` opening (line 227) through its close so it reads (insert the submission-type field FIRST, add clusters before the closing `</div>` of the grid):

```tsx
            <div className="fld-grid-3">
              <div className="fld span-3">
                <label>How are you submitting this? <span className="req-star" aria-hidden>*</span></label>
                <Controller control={control} name="submissionType" render={({ field }) => (
                  <div className="seg-toggle">
                    {SUBMISSION_TYPES.map(o => (
                      <button key={o.value} type="button" className={`seg-btn${field.value === o.value ? ' on' : ''}`} onClick={() => field.onChange(o.value)}>{o.label}</button>
                    ))}
                  </div>
                )} />
                <div className="help">Required — tells us who to route this to.</div>
              </div>
              <div className="fld"><label>Customer / company</label><input {...register('customerName')} /></div>
              <div className="fld span-2">
                <label>Facility location</label>
                <Controller control={control} name="facilityLocation" render={({ field }) => (
                  <AddressInput value={field.value ?? ''} onChange={field.onChange} placeholder="Start typing an address…" />
                )} />
                <div className="help">Start typing — pick a suggestion to auto-fill</div>
              </div>
              <div className="fld"><label>Your name</label><input {...register('customerContactName')} /></div>
              <div className="fld"><label>Your job title</label><input {...register('customerContactRole')} placeholder="e.g. Operations Manager" /></div>
              <div className="fld"><label>Your email</label><input type="email" {...register('customerContactEmail')} /></div>
              <div className="fld"><label>TAL representative</label><input {...register('talRepName')} /></div>
              {submissionType === 'dealer' && (<>
                <div className="fld"><label>Dealership name</label><input {...register('dealershipName')} /></div>
                <div className="fld"><label>Dealer rep</label><input {...register('dealerRep')} /></div>
              </>)}
              {submissionType === 'partner' && (<>
                <div className="fld"><label>Partner company</label><input {...register('partnerCompanyName')} /></div>
                <div className="fld"><label>Partner rep / contact</label><input {...register('partnerRepContact')} /></div>
              </>)}
              {submissionType === 'internal' && (
                <div className="fld"><label>Internal account ID</label><input {...register('internalAccountId')} /></div>
              )}
            </div>
```

- [ ] **Step 5: Enforce required-on-export** — modify `onSubmit` (line 144–150) to guard:

```tsx
  const onSubmit: SubmitHandler<PartialProjectFormData> = useCallback(async (v) => {
    setInvalidMsg(null)
    if (!v.submissionType) {
      setSubmitted(false)
      setInvalidMsg('Please choose how you’re submitting (Section 01) before exporting.')
      document.getElementById('q-sec-01')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setBusy(true)
    try {
      await downloadQuestionnairePdf(v)
      setSubmitted(true)
    } finally { setBusy(false) }
  }, [])
```

- [ ] **Step 6: Add the `.req-star` style** — append to `app/globals.css` (search for `.seg-toggle` and add near it):

```css
.req-star { color: var(--tal-red, #c00); font-weight: 700; margin-left: 2px; }
```

- [ ] **Step 7: Typecheck + parity + build**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts`
Expected: PASS (all new §01 field names are schema keys).

- [ ] **Step 8: Commit**

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx app/globals.css
git commit -m "feat(questionnaire): §01 submission type + conditional dealer/partner/internal"
```

---

## Task 3: Section 03 — unit/load type single → multi-select

**Files:** Modify `src/components/questionnaire/QuestionnaireForm.tsx` (Section 03, lines 257–283; `Chips` union type ~line 181; `SECTIONS[2]` line 49–50; add a mirror effect).

- [ ] **Step 1: Extend the `Chips` name union** (line 181) so it accepts the new field:

```tsx
  const Chips = ({ name, options }: { name: 'projectDrivers' | 'specialtyApplications' | 'certifications' | 'interlocks' | 'unitLoadTypes' | 'sharedTrafficTypes'; options: readonly string[] }) => (
```

- [ ] **Step 2: Update `SECTIONS[2]` fields** (line 49–50):

```tsx
  { id: 'q-sec-03', num: '03', short: 'What you move', tier: TIER_APP,
    fields: ['unitLoadTypes', 'typicalUnitType', 'otherUnitTypeDescription', 'maxLoadWeightLbs', 'loadLengthIn', 'loadWidthIn', 'loadHeightIn'] },
```

- [ ] **Step 3: Replace the single `typicalUnitType` select** — swap the `.fld` block at lines 259–265 for a multi-select chip group:

```tsx
              <div className="fld span-4">
                <label>Unit / load type(s)</label>
                <Chips name="unitLoadTypes" options={UNIT_LOAD_TYPE_OPTIONS} />
                <div className="help">Select all that apply.</div>
              </div>
```

(The `unitType === 'Other'` conditional on line 266–268 stays — but change its condition to the array; see Step 4.)

- [ ] **Step 4: Repoint the "Other" branch + add the singular mirror.** Change line 141 `const unitType = values.typicalUnitType` to derive from the array and mirror back:

```tsx
  const unitLoadTypes = values.unitLoadTypes ?? []
  const showOtherUnit = unitLoadTypes.includes('Other')
```

Then change the conditional at line 266 from `{unitType === 'Other' && (` to `{showOtherUnit && (`.

Add a mirror effect so the legacy singular `typicalUnitType` (read by the main-app calc/import) stays populated — insert after the autosave `useEffect` (line 132):

```tsx
  // Keep legacy singular typicalUnitType in sync with the multi-select's first
  // choice so the main app's calc/import (which reads the singular field) works.
  const { setValue } = useForm as never // placeholder — see note
```

> NOTE for implementer: `setValue` must come from the existing `useForm` call at line 106. Add `setValue` to that destructure: `const { register, handleSubmit, control, reset, watch, setValue } = useForm<...>()`. Then add:
>
> ```tsx
> useEffect(() => {
>   setValue('typicalUnitType', unitLoadTypes[0] ?? undefined)
> }, [setValue, unitLoadTypes])
> ```
>
> Remove the placeholder line above; it exists only to make the intent explicit.

- [ ] **Step 5: Typecheck + parity**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §03 unit/load type multi-select (mirrors singular)"
```

---

## Task 4: Section 04 — dwell time, charging strategy, roller height, max lift height

**Files:** Modify `QuestionnaireForm.tsx` Section 04 (lines 285–328); `SECTIONS[3]` (line 51–52); branch flags near line 142.

- [ ] **Step 1: Update `SECTIONS[3]` fields** (line 51–52):

```tsx
  { id: 'q-sec-04', num: '04', short: 'How it’s moved', tier: TIER_APP,
    fields: ['pickContext', 'dropContext', 'transferType', 'transferHeightFt', 'dwellTimeMin', 'chargingStrategyPreference', 'topOfRollerHeightFt', 'maxLiftHeightFt', 'specialtyApplications'] },
```

- [ ] **Step 2: Add branch flags** near line 142 (`const showHeight = ...`):

```tsx
  const isLiftTable = transferType === 'lift_table'
  const isForklift = transferType === 'forklift'
  const specialties = values.specialtyApplications ?? []
  const isVNA = specialties.includes('VNA')
```

- [ ] **Step 3: Add the four fields** — inside Section 04's first `.fld-grid-2` (after the `showHeight` block that closes at line 319), before `</div>` at line 320 insert:

```tsx
              {isLiftTable && (
                <div className="fld">
                  <label>Top-of-roller height</label>
                  <div className="input-with-unit">
                    <input type="number" step="0.1" min="0" className="mono" {...register('topOfRollerHeightFt', { setValueAs: emptyToNum })} />
                    <div className="unit">ft</div>
                  </div>
                </div>
              )}
              {(isForklift || isVNA) && (
                <div className="fld">
                  <label>Max lift height</label>
                  <div className="input-with-unit">
                    <input type="number" step="0.1" min="0" className="mono" {...register('maxLiftHeightFt', { setValueAs: emptyToNum })} />
                    <div className="unit">ft</div>
                  </div>
                </div>
              )}
              <div className="fld">
                <label>Dwell / queue time at pick & drop</label>
                <div className="input-with-unit">
                  <input type="number" step="0.1" min="0" className="mono" {...register('dwellTimeMin', { setValueAs: emptyToNum })} />
                  <div className="unit">min</div>
                </div>
                <div className="help">Estimated wait per pick/drop</div>
              </div>
              <div className="fld">
                <label>Charging strategy</label>
                <select {...register('chargingStrategyPreference', { setValueAs: emptyToUndef })} defaultValue="">
                  <option value="">Select…</option>
                  {CHARGING_STRATEGIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
```

- [ ] **Step 4: Typecheck + parity, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §04 dwell/charging/roller/max-lift fields"
```

---

## Task 5: Section 05 — aisle split, shared traffic, VNA guidance, ramps, temp-visibility fix

**Files:** Modify `QuestionnaireForm.tsx` Section 05 (lines 330–377); `SECTIONS[4]` (line 53–54); mirror effect for aisle.

- [ ] **Step 1: Update `SECTIONS[4]` fields** (line 53–54):

```tsx
  { id: 'q-sec-05', num: '05', short: 'Where it runs', tier: TIER_APP,
    fields: ['driveAisleWidthFt', 'rackingAisleWidthFt', 'floorCondition', 'outdoorRequired', 'sharedTrafficTypes', 'guidanceType', 'rampRequired', 'maxRampGrade', 'temperatureEnvironment', 'tempMinF', 'tempMaxF', 'dustMoisture'] },
```

- [ ] **Step 2: Add branch flags** near line 142:

```tsx
  const isOutdoor = values.outdoorRequired === true
  const tempEnv = values.temperatureEnvironment
  const showTempRange = tempEnv === 'refrigerated' || tempEnv === 'freezer'
```

- [ ] **Step 3: Replace the "Narrowest aisle" `.fld` block** (lines 332–338) with the split pair:

```tsx
              <div className="fld">
                <label>Drive aisle width</label>
                <div className="input-with-unit">
                  <input type="number" step="0.1" min="0" className="mono" placeholder="8" {...register('driveAisleWidthFt', { setValueAs: emptyToNum })} />
                  <div className="unit">ft</div>
                </div>
              </div>
              <div className="fld">
                <label>Racking aisle width</label>
                <div className="input-with-unit">
                  <input type="number" step="0.1" min="0" className="mono" placeholder="6" {...register('rackingAisleWidthFt', { setValueAs: emptyToNum })} />
                  <div className="unit">ft</div>
                </div>
                {isVNA && <div className="help" style={{ fontWeight: 600 }}>VNA selected — racking aisle width is critical for fit.</div>}
              </div>
```

- [ ] **Step 4: Gate the temp-range inputs** — wrap lines 367–368 (`Min/Max temperature`) so they only show when refrigerated/freezer:

```tsx
              {showTempRange && (<>
                <div className="fld"><label>Min temperature (°F)</label><input type="number" className="mono" {...register('tempMinF', { setValueAs: emptyToNum })} /></div>
                <div className="fld"><label>Max temperature (°F)</label><input type="number" className="mono" {...register('tempMaxF', { setValueAs: emptyToNum })} /></div>
              </>)}
```

- [ ] **Step 5: Add shared-traffic, VNA guidance, and ramps** — before the Section 05 grid closes (`</div>` at line 376) insert:

```tsx
              <div className="fld span-3">
                <label>Shared traffic in the area</label>
                <Chips name="sharedTrafficTypes" options={SHARED_TRAFFIC_TYPES} />
              </div>
              {isVNA && (
                <div className="fld">
                  <label>VNA guidance type</label>
                  <select {...register('guidanceType', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {GUIDANCE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {isOutdoor && (<>
                <div className="fld">
                  <label>Ramps / grades present?</label>
                  <YesNo name="rampRequired" />
                </div>
                {values.rampRequired && (
                  <div className="fld">
                    <label>Max incline</label>
                    <div className="input-with-unit">
                      <input type="number" step="0.1" min="0" className="mono" {...register('maxRampGrade', { setValueAs: v => (v === '' || v == null ? 0 : Number(v)) })} />
                      <div className="unit">%</div>
                    </div>
                  </div>
                )}
              </>)}
```

- [ ] **Step 6: Extend the `YesNo` union** (line 199) to include `rampRequired`:

```tsx
  const YesNo = ({ name }: { name: 'isRfq' | 'cadAvailable' | 'networkReady' | 'siteWalkthroughAvailable' | 'wmsRequired' | 'rampRequired' | 'barcodeScanningRequired' | 'hasExistingAutomation' }) => (
```

- [ ] **Step 7: Add the aisle mirror effect** — after the `typicalUnitType` mirror from Task 3, add:

```tsx
  // Keep legacy minAisleWidthFt (main-app informational) = narrower of the two.
  useEffect(() => {
    const d = values.driveAisleWidthFt, r = values.rackingAisleWidthFt
    const nums = [d, r].filter((n): n is number => typeof n === 'number')
    setValue('minAisleWidthFt', nums.length ? Math.min(...nums) : undefined)
  }, [setValue, values.driveAisleWidthFt, values.rackingAisleWidthFt])
```

- [ ] **Step 8: Typecheck + parity, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §05 aisle split, shared traffic, VNA guidance, ramps, temp-range gating"
```

---

## Task 6: Section 06 — CAD is the site-readiness home

**Files:** Modify `QuestionnaireForm.tsx` Section 06 (lines 379–386); `SECTIONS[5]` (line 55–56). (CAD file upload is SKIPPED per decision — only the Y/N trigger + notes move here.)

- [ ] **Step 1: Update `SECTIONS[5]` fields** (line 55–56):

```tsx
  { id: 'q-sec-06', num: '06', short: 'Site readiness', tier: TIER_APP,
    fields: ['facilitySizeSqFt', 'dockDoors', 'networkReady', 'siteWalkthroughAvailable', 'cadAvailable', 'cadNotes'] },
```

- [ ] **Step 2: Add CAD Y/N + notes** — inside Section 06's `.fld-grid-3` (before `</div>` at line 385) insert:

```tsx
              <div className="fld"><label>CAD / drawings available?</label><YesNo name="cadAvailable" /></div>
              {cadAvailable && <div className="fld span-2"><label>CAD notes</label><input {...register('cadNotes')} placeholder="Format, what’s included…" /></div>}
```

(`cadAvailable` branch flag already exists at line 138.)

- [ ] **Step 3: Typecheck + parity, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §06 CAD availability (single home)"
```

---

## Task 7: Section 07 — per-flow distance type

**Files:** Modify `QuestionnaireForm.tsx` Section 07 flow rows (lines 433–466).

- [ ] **Step 1: Add a per-row distance-type toggle** — inside the flow row (after the Throughput `.fld` closes at line 453, before `.step1-flow-actions` at line 454) insert:

```tsx
                      <div className="fld">
                        <label>Distance type</label>
                        <Controller control={control} name={`flows.${i}.distanceType`} render={({ field }) => (
                          <div className="seg-toggle">
                            <button type="button" className={`seg-btn${field.value === 'one_way' ? ' on' : ''}`} onClick={() => field.onChange('one_way')}>One-way</button>
                            <button type="button" className={`seg-btn${field.value === 'round_trip' ? ' on' : ''}`} onClick={() => field.onChange('round_trip')}>Round-trip</button>
                          </div>
                        )} />
                      </div>
```

- [ ] **Step 2: Seed `distanceType` in `addFlow`** (line 111–114) so new rows default to one-way:

```tsx
  const addFlow = () => appendFlow({
    id: 'f_' + Math.random().toString(36).slice(2, 10),
    origin: '', destination: '', distanceFt: 0, thruPerHr: 0, routeLayout: 'medium', liftHeightFt: 0,
    distanceType: 'one_way',
  })
```

- [ ] **Step 3: Typecheck + tests, commit**

Run: `npx tsc --noEmit && npx vitest run` → PASS (parity uses `Controller ... name="..."`; note `flows.${i}.distanceType` is a template string, not a bare literal, so it does NOT need to be a top-level schema key — parity regex only matches quoted literals).

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §07 per-flow distance type"
```

---

## Task 8: Section 09 — hazard zone, REST API, barcode, WMS cluster

**Files:** Modify `QuestionnaireForm.tsx` Section 09 (lines 485–494); `SECTIONS[8]` (line 61–62); branch flags.

- [ ] **Step 1: Update `SECTIONS[8]` fields** (line 61–62):

```tsx
  { id: 'q-sec-09', num: '09', short: 'Certs & controls', tier: TIER_APP,
    fields: ['certifications', 'interlocks', 'hazardZoneClassification', 'barcodeScanningRequired', 'wmsRequired', 'wmsVendor', 'wmsInterfaceType', 'taggingScanMethod', 'restApiAvailable'] },
```

- [ ] **Step 2: Add branch flags** near line 142:

```tsx
  const certs = values.certifications ?? []
  const showHazardZone = certs.includes('ATEX') || certs.includes('IECEx')
```

- [ ] **Step 3: Replace the Section 09 body** (lines 486–493) with the expanded version:

```tsx
            <div className="fld-grid-4">
              <div className="fld span-4"><label>Required certifications</label><Chips name="certifications" options={CERTIFICATIONS} /></div>
              {showHazardZone && (
                <div className="fld span-4">
                  <label>Hazard zone classification <span className="req-star" aria-hidden>*</span></label>
                  <input {...register('hazardZoneClassification')} placeholder="e.g. Zone 1 / Class I Div 1" />
                  <div className="help">Required for ATEX / IECEx applications.</div>
                </div>
              )}
              <div className="fld span-4"><label>Equipment interlocks</label><Chips name="interlocks" options={INTERLOCKS} /></div>
            </div>
            <div className="fld-grid-2">
              <div className="fld"><label>Barcode scanning required?</label><YesNo name="barcodeScanningRequired" /></div>
              <div className="fld"><label>WMS integration required?</label><YesNo name="wmsRequired" /></div>
              {wmsRequired && (<>
                <div className="fld"><label>WMS vendor</label><input {...register('wmsVendor')} /></div>
                <div className="fld">
                  <label>WMS interface type</label>
                  <select {...register('wmsInterfaceType', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {WMS_INTERFACE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>REST API available?</label>
                  <select {...register('restApiAvailable', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {REST_API_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>Tagging / scan method</label>
                  <select {...register('taggingScanMethod', { setValueAs: emptyToUndef })} defaultValue="">
                    <option value="">Select…</option>
                    {TAGGING_SCAN_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>)}
            </div>
```

- [ ] **Step 4: Enforce hazard-zone required-if-shown** — extend the `onSubmit` guard from Task 2 Step 5 with a second check (add before `setBusy(true)`):

```tsx
    const certList = v.certifications ?? []
    if ((certList.includes('ATEX') || certList.includes('IECEx')) && !v.hazardZoneClassification?.trim()) {
      setSubmitted(false)
      setInvalidMsg('Hazard zone classification is required for ATEX / IECEx (Section 09).')
      document.getElementById('q-sec-09')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
```

- [ ] **Step 5: Typecheck + parity, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §09 hazard zone, barcode, REST API, WMS cluster"
```

---

## Task 9: Section 10 — remove duplicate CAD question

**Files:** Modify `QuestionnaireForm.tsx` Section 10 (lines 497–520); `SECTIONS[9]` (line 63–64).

- [ ] **Step 1: Remove the CAD Y/N + notes** from Section 10 — delete lines 516–517 (`CAD / drawings available?` `.fld` and the `cadAvailable && CAD notes` `.fld`). CAD now lives only in Section 06 (Task 6).

- [ ] **Step 2: Update `SECTIONS[9]` fields** (line 63–64) — drop `cadAvailable`, `cadNotes`:

```tsx
  { id: 'q-sec-10', num: '10', short: 'Opportunity', tier: TIER_DETAILS,
    fields: ['projectName', 'projectStage', 'budgetRange', 'isRfq', 'rfqNumber', 'rfqDueDate', 'decisionDate', 'targetGoLiveDate', 'customerContactPhone'] },
```

- [ ] **Step 3: Typecheck, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "fix(questionnaire): de-duplicate CAD question (§06 is the single home)"
```

---

## Task 10: Section 11 — remove dealer fields (moved to §01)

**Files:** Modify `QuestionnaireForm.tsx` Section 11 (lines 522–533); `SECTIONS[10]` (line 65–66).

- [ ] **Step 1: Remove the dealer `.fld-grid-3`** — delete lines 523–526 (the `dealershipName` + `dealerRep` grid). Keep the "Current Toyota forklifts" and "History" blocks.

- [ ] **Step 2: Update `SECTIONS[10]` fields** (line 65–66) — drop `dealershipName`, `dealerRep`:

```tsx
  { id: 'q-sec-11', num: '11', short: 'TAL / Toyota', tier: TIER_DETAILS,
    fields: ['currentToyotaForklifts', 'talHistory'] },
```

- [ ] **Step 3: Typecheck, commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "refactor(questionnaire): move dealer name/rep from §11 to §01"
```

---

## Task 11: Section 12 — existing-automation toggle, interop, current headcount

**Files:** Modify `QuestionnaireForm.tsx` Section 12 (lines 535–548); `SECTIONS[11]` (line 67–68); branch flag.

- [ ] **Step 1: Update `SECTIONS[11]` fields** (line 67–68):

```tsx
  { id: 'q-sec-12', num: '12', short: 'Why & today', tier: TIER_DETAILS,
    fields: ['projectDrivers', 'currentProcess', 'hasExistingAutomation', 'existingAutomation', 'existingAutomationInterop', 'currentHeadcount', 'volumeGrowthNote', 'seasonalityNote'] },
```

- [ ] **Step 2: Add branch flag** near line 142:

```tsx
  const hasExistingAutomation = values.hasExistingAutomation === true
```

- [ ] **Step 3: Replace the Section 12 `.fld-grid-2`** (lines 542–547) with the toggle-driven version:

```tsx
            <div className="fld-grid-2">
              <div className="fld"><label>How is this done today?</label><textarea {...register('currentProcess')} placeholder="Manual forklifts, hand carts, …" /></div>
              <div className="fld"><label>People / forklifts doing this today</label><input type="number" min="0" className="mono" {...register('currentHeadcount', { setValueAs: emptyToNum })} /></div>
              <div className="fld"><label>Any existing automation on site?</label><YesNo name="hasExistingAutomation" /></div>
              {hasExistingAutomation && (<>
                <div className="fld"><label>Existing automation (brand / fleet)</label><textarea {...register('existingAutomation')} placeholder="Any AGVs/AMRs already on site" /></div>
                <div className="fld"><label>Must new fleet interoperate with it?</label><input {...register('existingAutomationInterop')} placeholder="Shared traffic, handoffs, controls…" /></div>
              </>)}
              <div className="fld"><label>Volume growth</label><input {...register('volumeGrowthNote')} placeholder="e.g. +10%/yr" /></div>
              <div className="fld"><label>Seasonality</label><input {...register('seasonalityNote')} placeholder="e.g. Q4 peak" /></div>
            </div>
```

- [ ] **Step 4: Typecheck + parity, commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/questionnaireParity.test.ts` → PASS.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): §12 existing-automation toggle + interop + headcount"
```

---

## Task 12: Status bar evaluation + required marker (QuestionnaireNav)

**Evaluation of the current status bar (findings — record these in the commit body):**
1. The bar shows `pct` and "N of 13 sections" where a section counts as "started" if **any** of its `fields` has a value (`started()`), plus an intersection-observer active highlight and click-to-scroll. Solid baseline.
2. **Gap:** it does not communicate the new **required** `submissionType` — a customer can reach 100% "started" while §01's required choice is blank, then be blocked at export with no earlier signal. Fix: mark §01 in the rail when `submissionType` is empty.
3. New fields added across Tasks 2–11 are already folded into each section's `fields` array, so the "started" dot lights correctly (no `started()` logic change needed).
4. Conditional/hidden fields (partner clusters, temp range, ramps) never falsely inflate the meter because `started()` checks values, and hidden fields stay empty. No change needed.

**Files:** Modify `src/components/questionnaire/QuestionnaireNav.tsx`; Modify `src/components/questionnaire/QuestionnaireForm.tsx` (pass a `requiredUnmet` hint); Test: `src/components/questionnaire/__tests__/QuestionnaireNav.test.tsx` (new).

- [ ] **Step 1: Write the failing test** — `src/components/questionnaire/__tests__/QuestionnaireNav.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import QuestionnaireNav, { type QSection } from '../QuestionnaireNav'

const SECTIONS: QSection[] = [
  { id: 'q-sec-01', num: '01', short: 'About you', tier: 'Getting started', fields: ['submissionType'] },
  { id: 'q-sec-02', num: '02', short: 'Vehicles', tier: 'Getting started', fields: ['vehiclesOfInterest'] },
]

describe('QuestionnaireNav required marker', () => {
  it('flags §01 when submissionType is empty', () => {
    render(<QuestionnaireNav sections={SECTIONS} values={{}} />)
    expect(screen.getByLabelText('About you — required answer missing')).toBeTruthy()
  })
  it('drops the flag once submissionType is set', () => {
    render(<QuestionnaireNav sections={SECTIONS} values={{ submissionType: 'customer' }} />)
    expect(screen.queryByLabelText('About you — required answer missing')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/questionnaire/__tests__/QuestionnaireNav.test.tsx`
Expected: FAIL (no required marker rendered).

- [ ] **Step 3: Add the required marker to `QuestionnaireNav`** — replace the `dot`/button render (lines 76–89) so a section carrying `submissionType` shows a required pip when unset:

```tsx
          const isActive = activeId === s.id
          const tierStart = i === 0 || sections[i - 1].tier !== s.tier
          const isStarted = started(s, values)
          const requiredUnmet = s.fields.includes('submissionType') && !values.submissionType
          const dot = requiredUnmet ? 'section-dot required' : isStarted ? 'section-dot in-progress' : 'section-dot optional'
          return (
            <li key={s.id}>
              {tierStart && <div className="section-nav-tier">{s.tier}</div>}
              <button
                type="button"
                className={`section-nav-item${isActive ? ' active' : ''}`}
                onClick={() => handleClick(s.id)}
                aria-label={requiredUnmet ? `${s.short} — required answer missing` : undefined}
              >
                <span className={dot} aria-hidden />
                <span className="section-nav-num">{s.num}</span>
                <span className="section-nav-label">{s.short}</span>
                {requiredUnmet && <span className="section-nav-req">Required</span>}
              </button>
            </li>
          )
```

- [ ] **Step 4: Add styles** — append to `app/globals.css` near `.section-dot`:

```css
.section-dot.required { background: var(--tal-red, #c00); box-shadow: 0 0 0 3px rgba(204,0,0,0.18); }
.section-nav-req { margin-left: auto; font-size: 10px; font-weight: 700; color: var(--tal-red, #c00); text-transform: uppercase; letter-spacing: 0.04em; }
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run src/components/questionnaire/__tests__/QuestionnaireNav.test.tsx`
Expected: PASS. If `@testing-library/react` is not installed, check `package.json`; the repo uses Vitest — confirm with `npx vitest run` that the environment is `jsdom` (see `vitest.config`). If jsdom/testing-library are absent, convert this to a pure-function test of a small exported `isRequiredUnmet(section, values)` helper instead (add `export function isRequiredUnmet(...)` to the Nav module and assert on it).

- [ ] **Step 6: Commit**

```bash
git add src/components/questionnaire/QuestionnaireNav.tsx app/globals.css src/components/questionnaire/__tests__/QuestionnaireNav.test.tsx
git commit -m "feat(questionnaire): status bar flags unmet required submission type"
```

---

## Task 13: Output — download a separate JSON file alongside the PDF

**Files:** Modify `QuestionnaireForm.tsx` `onSubmit` (Task 2/8 version); reuse `questionnaireJsonBlob` from `questionnaireExport.ts`.

- [ ] **Step 1: Import the JSON blob builder** — extend the import at line 18 area:

```tsx
import { downloadQuestionnairePdf } from '@/src/lib/questionnaire/pdfQuestionnaire'
import { questionnaireJsonBlob } from '@/src/lib/questionnaire/questionnaireExport'
```

- [ ] **Step 2: Add a JSON download helper** — near the top-level helpers (after `emptyToNum`, ~line 87):

```tsx
function downloadJson(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Emit JSON alongside the PDF** — in `onSubmit`, after `await downloadQuestionnairePdf(v)`:

```tsx
      await downloadQuestionnairePdf(v)
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = (v.customerName || v.projectName || 'questionnaire').replace(/[^\w-]+/g, '_').slice(0, 40)
      downloadJson(questionnaireJsonBlob(v), `${slug}_${stamp}.json`)
      setSubmitted(true)
```

- [ ] **Step 4: Update the confirmation copy** (line 563) to mention both files:

```tsx
        {submitted && <span className="q-status q-status-ok"><Icon name="check" size={14} /> Downloaded PDF + JSON — send both to your TAL engineer.</span>}
```

- [ ] **Step 5: Typecheck, commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/questionnaire/QuestionnaireForm.tsx
git commit -m "feat(questionnaire): export a separate JSON file alongside the PDF"
```

---

## Task 14: Round-trip tests + docs + interop update

**Files:** Modify `src/lib/__tests__/questionnaireExport.test.ts`; `docs/questionnaire-interop.md`; `docs/SPECIFICATION.md`; `docs/CHANGELOG.md`.

- [ ] **Step 1: Add round-trip coverage** — append to `src/lib/__tests__/questionnaireExport.test.ts` a test that the new fields survive the envelope and the singular mirrors are respected:

```ts
import { buildQuestionnaireEnvelope } from '@/src/lib/questionnaire/questionnaireExport'
import { partialProjectSchema } from '@/src/lib/validations/schemas'

describe('change-log fields round-trip', () => {
  it('carries new intake fields through the envelope + reparses', () => {
    const answers = partialProjectSchema.parse({
      submissionType: 'dealer', dealershipName: 'Acme Lift', dealerRep: 'Sam',
      unitLoadTypes: ['Standard Pallet', 'Tote'], typicalUnitType: 'Standard Pallet',
      driveAisleWidthFt: 10, rackingAisleWidthFt: 6, minAisleWidthFt: 6,
      sharedTrafficTypes: ['Pedestrians'], guidanceType: 'wire',
      hazardZoneClassification: 'Zone 1', restApiAvailable: 'yes',
      barcodeScanningRequired: true, wmsInterfaceType: 'rest_api', taggingScanMethod: 'barcode',
      hasExistingAutomation: true, existingAutomationInterop: 'shared aisles', currentHeadcount: 4,
      dwellTimeMin: 2, chargingStrategyPreference: 'opportunity',
    })
    const env = buildQuestionnaireEnvelope(answers)
    const reparsed = partialProjectSchema.safeParse(env.project)
    expect(reparsed.success).toBe(true)
    expect(env.project.submissionType).toBe('dealer')
    expect(env.project.unitLoadTypes).toEqual(['Standard Pallet', 'Tote'])
    expect(env.project.minAisleWidthFt).toBe(6)
  })
})
```

- [ ] **Step 2: Run it — expect PASS**

Run: `npx vitest run src/lib/__tests__/questionnaireExport.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `docs/questionnaire-interop.md`** — under "Step-1-only fields not collected by the questionnaire", correct the ramps note (ramps are now on the customer form, conditional on Outdoor) and add a row noting the singular back-compat mirrors:

```markdown
## Back-compat mirrors (multi-select / split fields → legacy singular)

The questionnaire now uses multi-select / split inputs but keeps the legacy singular
fields the main-app calc/import reads populated (mirrored in the form on change):

| Questionnaire input | Legacy field kept in sync | Rule |
|---|---|---|
| `unitLoadTypes[]` | `typicalUnitType` | first selection |
| `driveAisleWidthFt` + `rackingAisleWidthFt` | `minAisleWidthFt` | `min()` of the two |

Ramps (`rampRequired` / `maxRampGrade`) are now collected on the customer form (conditional
on Outdoor), superseding the earlier "engineer-only" note for those two fields.
```

- [ ] **Step 4: Update `docs/SPECIFICATION.md`** — in the questionnaire section, list the new fields per section, the required `submissionType`, the hazard-zone required-if-shown rule, the temp-range visibility gate, and the dual PDF+JSON output.

- [ ] **Step 5: Add a CHANGELOG summary line** for the form/UI changes (schema line was added in Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/lib/__tests__/questionnaireExport.test.ts docs/questionnaire-interop.md docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "test+docs(questionnaire): round-trip coverage + interop/spec updates"
```

---

## Task 15: Full-suite verification + main-app import integration check

**Files:** none (verification only). This is the "make sure it works smoothly with main web app import" acceptance step.

- [ ] **Step 1: Typecheck + full test suite + arch gate**

Run: `npx tsc --noEmit && npx vitest run && npm run check:arch`
Expected: all green. In particular `questionnaireParity.test.ts`, `questionnaireExport.test.ts`, `questionnaireSchema.test.ts`, `enumAlignment.test.ts`, and `QuestionnaireNav.test.tsx` pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success (no route/type errors on `/questionnaire`).

- [ ] **Step 3: Manual integration smoke (record result in commit body).** With `npm run dev`:
  1. Open `/questionnaire`, choose a submission type, fill a few fields across §01–§12, add a flow with a per-row distance type, select ATEX (confirm hazard-zone required blocks export until filled), export.
  2. Confirm **two** files download (PDF + JSON).
  3. Open the main app Step 00, import the PDF (embedded JSON) — confirm the project loads, `bastianRep`/`desiredInstallDate` map (via `normalizeForPort`), `typicalUnitType` and `minAisleWidthFt` are populated from the multi/split inputs, and Step 2 traffic lights evaluate without error.
  4. Repeat importing the standalone JSON file — same result.

- [ ] **Step 4: `/simplify` then `/review`** the full diff (per CLAUDE.md pre-push checklist), address findings.

- [ ] **Step 5: CSS restart check** — since `app/globals.css` changed, `rm -rf .next && npm run dev`, hard-refresh, confirm the required pip + `.req-star` render.

- [ ] **Step 6: Final commit + push**

```bash
git add -A
git commit -m "chore(questionnaire): verify change-log integration + main-app import round-trip"
git push origin main
```

---

## Self-Review (spec coverage)

- §01 submission_type (required) + dealer move + partner/internal clusters → Tasks 2, 10 ✅
- §03 unit_load_type multi-select → Task 3 ✅
- §04 dwell, charging_strategy, top_of_roller_height, max_lift_height → Task 4 ✅
- §05 aisle split, shared_traffic_type, guidance_type, ramps_grade, temp-visibility fix → Task 5 ✅
- §06 cad trigger (upload SKIPPED) → Task 6 ✅
- §07 per-flow rows (already existed) + per-row distance type → Task 7 ✅
- §09 hazard_zone (required-if-shown), rest_api, barcode, WMS cluster → Task 8 ✅
- §10 rfq trigger kept (upload SKIPPED); CAD duplicate removed → Task 9 ✅
- §11 dealer removed (moved) → Task 10 ✅
- §12 existing_automation toggle + interop + headcount → Task 11 ✅
- Status bar evaluation + required marker → Task 12 ✅
- Output: separate JSON alongside PDF (email/upload/signed-URL SKIPPED per decision) → Task 13 ✅
- Docs + interop + round-trip tests + full verification/import → Tasks 14–15 ✅

**Skipped per decision (no backend):** `cad_file_upload`, `rfq_file_upload`, auto-email, signed-URL routing.
