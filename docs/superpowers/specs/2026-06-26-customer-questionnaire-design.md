# Customer questionnaire — standalone capture form → PDF + JSON importable by Step 00

**Date:** 2026-06-26
**Status:** Design (brainstorming; pending user spec review)
**Owner:** AGV sales / applications engineering

## 1. Purpose

Give sales / applications engineers a single **customer-facing form** that captures everything
needed to seed a fleet-sizing project — the full Step 1 technical inputs **plus** opportunity /
sales context (vehicle in mind, RFQ, CAD, dates, budget, drivers, site readiness, specialty
applications). On submit it produces a **TAL-branded PDF with embedded JSON** that the main app
imports unchanged via Step 00 → "Import Customer Questionnaire". No re-keying; one artifact that is
both a human-readable proposal-intake sheet and a machine-importable project.

## 2. Scope & constraints

- **Standalone, self-contained route** `/questionnaire` — customer-facing, no PersistentHeader, no
  step chrome, no `storage.ts`. Deployable on its own later (the main app will sit behind company
  SSO; the questionnaire will not).
- **Shared contract only.** The route imports **just** the project Zod schema (`schemas.ts`), the
  enums (`enums.ts`), and a small export helper. No app internals (no storage, no step components).
- **Split-ready** (same repo now): later excluded from SSO middleware, or the schema is lifted to a
  shared package — no rewrite required.
- **Rebuild, don't refactor** the field UI: a fresh self-contained form bundling its own components,
  sharing only schema + enums. A **parity test** asserts every questionnaire field key is a real
  schema key so it can't drift. (Alternative — refactor `ApplicationForm` into a shared presentational
  component — rejected: couples the two apps and risks Step 1 regressions.)
- Honors all project rules: **no required fields**, imperial-first, Toyota Type only, no backend,
  schema is the single source of truth, docs-first.

Non-goals: live pricing/sizing inside the questionnaire (it only captures inputs); customer auth /
accounts; server persistence; editing an existing project (it always produces a fresh export).

## 3. Architecture

```
app/questionnaire/page.tsx           public route shell (TAL brand, intro, submit)
src/components/questionnaire/
  QuestionnaireForm.tsx               RHF form; local state; section list; export on submit
  sections/*.tsx                      one component per section (presentational; value+onChange)
  questionnaireExport.ts              builds {schemaVersion, exportedAt, project} envelope
src/lib/export/pdfQuestionnaire.ts    TAL-branded PDF w/ embedded JSON (reuses embed pattern)
```

- **State:** React Hook Form, local only. Optional draft autosave to its **own** localStorage key
  (`tal:questionnaire-draft`) so a long form survives a refresh — never touches `tal:projects`.
- **Output contract:** the **same wrapped envelope** Step 00 already imports
  (`{ schemaVersion, exportedAt, project }`, consumed by `importProjectFromJson`). `project` is a
  partial `StoredProject` assembled from answers. Zero new import-side code.
- **Submit:** generates the branded PDF (download) **and** offers a plain `.json` download fallback.
- **Reuse check:** confirm `src/lib/.../pdfExport.ts` embed-JSON helper takes a plain project object
  (no storage dependency); factor the embed step into `pdfQuestionnaire.ts` if needed so the route
  pulls no app internals.

## 4. Data model — new optional schema fields

All added to `projectSchema` as **optional** (no required-field rule), in a "Sales / Opportunity"
group. They are **informational** — never read by gates or calc — like the existing proposal fields.
Existing fields are reused where present (`desiredInstallDate`, `oemDealer`, `dealershipName`,
`dealerRep`, `customerName`, `facilityLocation`, `bastianRep`, `opportunityNumber`, `opportunityType`).

```ts
// ---- Customer questionnaire: opportunity / sales context ----
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

// drivers / current process
projectDrivers: z.array(z.string()).default([]),   // why automating (enum chips + free text)
currentProcess: z.string().optional(),             // how it's done today

// growth / seasonality
volumeGrowthNote: z.string().optional(),
seasonalityNote: z.string().optional(),

// site readiness / existing automation
facilitySizeSqFt: z.number().min(0).optional().nullable(),
dockDoors: z.number().int().min(0).optional().nullable(),
networkReady: z.boolean().optional(),
itContact: z.string().optional(),
existingAutomation: z.string().optional(),         // existing AGV/AMR fleet + brand
siteWalkthroughAvailable: z.boolean().optional(),

// specialty applications of interest (trailer load/unload, high reach, etc.)
specialtyApplications: z.array(z.string()).default([]),

// customer + TAL contact blocks (for the export header/footer)
customerContactName: z.string().optional(),
customerContactRole: z.string().optional(),
customerContactEmail: z.string().optional(),
customerContactPhone: z.string().optional(),
talRepName: z.string().optional(),
talRepEmail: z.string().optional(),
talRepPhone: z.string().optional(),
```

**New enum constants** (in `src/lib/constants/enums.ts`):
- `SPECIALTY_APPLICATIONS = ['Trailer loading', 'Trailer unloading', 'High reach / racking',
  'Floor-to-floor', 'Long-haul transport', 'Conveyor interface', 'Outdoor / yard', 'Other']`
- `PROJECT_DRIVERS = ['Labor availability', 'Labor cost', 'Safety', 'Throughput / capacity',
  'Quality / consistency', 'Ergonomics', '24/7 operation', 'Other']`

The enum chips render in both the questionnaire and (later) any Step-1 surfacing; the values feed
`projectDrivers` / `specialtyApplications`. A `enumAlignment`-style test asserts these arrays are the
source for the chips.

## 5. Form sections (top → bottom)

Comprehensive, plain-language, nothing required, progress indicator. Sections:

1. **You & your company** — customer name, facility location, contact (name/role/email/phone),
   TAL rep (name/email/phone), dealer (oemDealer / dealershipName / dealerRep).
2. **The opportunity** — vehicle in mind; RFQ? + number + due date; project stage; budget status +
   range; decision date; target go-live; CAD available? + notes; opportunity # / type.
3. **Why & how today** — project drivers (chips + text); current process; volume growth; seasonality;
   existing automation.
4. **Specialty applications of interest** — `SPECIALTY_APPLICATIONS` chips (trailer load/unload, high
   reach, …) + free text.
5. **What you move (loads)** — mirrors Step 1 loads (unit type, dims, weight, pallet subtype).
6. **How it's transferred** — `transferType` + transfer height (mirrors Step 1 §02).
7. **Environment & site** — aisle width, floor, temp range, indoor/outdoor, dust/moisture, ramp;
   facility size, dock doors, network ready + IT contact, site walkthrough available.
8. **Certifications & controls** — certifications, interlocks, WMS.
9. **Schedule** — shifts, hours, operating-days pattern, breaks.
10. **Throughput & flows** — required throughput, avg distance, flows (origin/destination/distance/
    throughput) — same shape as Step 3 flows.
11. **Anything else** — `projectNotes`.

## 6. PDF export — TAL brand guidelines

- **TAL logo in the top-right corner** of every page; follow TAL brand guidelines (Toyota Type,
  brand red accents, light theme), consistent with the existing app PDF export.
- **Header block:** project / customer name, date, opportunity #. **Contact block:** customer
  contact + TAL rep + dealer info. **Footer:** TAL contact info + page number.
- Human-readable, sectioned summary mirroring §5, with the **JSON envelope embedded** (hidden
  attachment, same mechanism as the app's `pdfExport`), so Step 00 re-imports it losslessly.
- Plain `.json` download offered alongside as a fallback.

## 7. Step 00 import

No change required — Step 00 already imports the wrapped envelope via `importProjectFromJson` /
`parseProjectPdf`. The new optional fields round-trip because they're in `projectSchema`
(`partialProjectSchema.parse` accepts them). Verify the Step 00 label reads "Import Customer
Questionnaire" (already present) and that the imported project lands on Step 1 with the new
sales fields populated.

## 8. Testing

- **Schema parity** (`questionnaire-parity.test.ts`): every field key the form writes is a key of
  `projectSchema.shape` — the form cannot reference a non-existent field.
- **Round-trip** (`questionnaireExport.test.ts`): build answers → `buildEnvelope` →
  `importProjectFromJson` → all fields (incl. the new sales fields, `specialtyApplications`,
  `projectDrivers`) survive equal.
- **Enum alignment**: `SPECIALTY_APPLICATIONS` / `PROJECT_DRIVERS` are the only source for their chips.
- **Schema unit**: each new field parses (valid + cleared/undefined) via `partialProjectSchema`.
- Existing `rom` / `gates` / `trafficLight` tests stay green — gates ignore the new informational
  fields (assert a project with only sales fields still computes the same traffic lights).

## 9. Constraints honored

Self-contained public route (schema + enums only) · no required fields · imperial-first · Toyota
Type only · no backend / localStorage-only (own draft key) · schema is single source of truth ·
split-ready · TAL brand + logo top-right on export · docs-first (SPECIFICATION + CHANGELOG before code).

## 10. Accepted limitations

- The questionnaire form UI is **duplicated** from Step 1 (rebuild, not shared) — mitigated by the
  parity + enum tests; intentional, for portability.
- Sales fields are **informational** — they print and seed the project but don't affect sizing.
- No server submission: the customer (or rep) returns the PDF/JSON out-of-band; Step 00 ingests it.
