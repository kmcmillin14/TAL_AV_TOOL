# Two questionnaires — gap analysis & interop

The app has **two** intake forms that must round-trip into the same project:

1. **Step 1 — Application Form** (`src/components/step1/ApplicationForm.tsx`) — the engineer's
   in-app form, writes to `localStorage` via `storage.ts`.
2. **Customer AV Questionnaire** (`/questionnaire`) — standalone, customer-facing; exports a
   TAL-branded PDF with the project JSON embedded, imported via Step 00.

Both serialize to the **same `projectSchema`** and the same `{ schemaVersion, exportedAt, project }`
envelope (`importProjectFromJson`). That is the contract that makes them interoperable.

## Field coverage

| Area | Step 1 | Questionnaire | Ports? |
|---|---|---|---|
| Loads | `loads[]` (multi) | singular `typicalUnitType`/`maxLoadWeightLbs`/`load*In` | ✅ singular flows through `appRequirementsFromProject`; `storage` keeps both |
| Transfer | `transferType` + height | same + `pickContext`/`dropContext` | ✅ |
| Environment | aisle, floor, temp, outdoor, dust | same | ✅ |
| Schedule | shifts/hours/days/breaks | same | ✅ |
| Throughput | `requiredThroughputPerHour` + `flows[]` | avg + `peakThroughputPerHour` + `flows[]` | ✅ flows identical shape |
| Certs / controls | certifications, interlocks, WMS | same | ✅ |
| Sales / opportunity | — | vehiclesOfInterest, RFQ, stage, budget, drivers, etc. | ✅ informational; ignored by gates |

## Name mismatches (the real interop risk) — resolved

Two concepts had **different field names** in each form, so a raw round-trip dropped them. Fixed in
`buildQuestionnaireEnvelope` → `normalizeForPort` (non-destructive — only fills an empty canonical
field):

| Questionnaire field | Canonical Step-1 field | Why |
|---|---|---|
| `talRepName` | `bastianRep` | the app header shows `bastianRep` as "TAL Engineer" |
| `targetGoLiveDate` | `desiredInstallDate` | Step 1 uses `desiredInstallDate` |

Covered by `questionnaireExport.test.ts` ("ports cleanly into the main app…").

## Step-1-only fields not collected by the questionnaire (by design)

`operatorsPerShift`, ramps (`rampRequired`/`rampDistanceFt`/`maxRampGrade`), and ROM economics
(`fullyBurdenedRateUsdPerYear`, etc.) are **engineer inputs** — the customer doesn't supply them, and
the engineer fills them in Step 1/Step 4 after import. They round-trip if present but aren't on the
customer form. This is intentional, not a gap.

## Guarantees

- **Schema is the single source of truth** — both forms import only `projectSchema`/enums; a
  `questionnaireParity.test.ts` asserts every questionnaire field is a real schema key.
- **Round-trip tested** — `questionnaireExport.test.ts` covers sales fields, flows, the rep/date
  mapping, and load fields surviving `importProjectFromJson`.
- **Both directions** — the app's own PDF/JSON export uses the same envelope, so an app project
  re-imports the same way a questionnaire does.

## Back-compat mirrors (multi-select / split fields → legacy singular)

The questionnaire now uses multi-select / split inputs but keeps the legacy singular
fields the main-app calc/import reads populated (mirrored in the form on change):

| Questionnaire input | Legacy field kept in sync | Rule |
|---|---|---|
| `unitLoadTypes[]` | `typicalUnitType` | first selection |
| `driveAisleWidthFt` + `rackingAisleWidthFt` | `minAisleWidthFt` | `min()` of the two |

Ramps (`rampRequired` / `maxRampGrade`) are now collected on the customer form
(conditional on Outdoor), superseding the earlier "engineer-only" note for those two
fields.

## Change-log intake fields (2026-08-07)

New customer-questionnaire fields added (all optional/informational, ignored by gates
and calc; they round-trip via the same envelope): `submissionType` (+ `partnerCompanyName`,
`partnerRepContact`, `internalAccountId`, and dealer name/rep now under §01), `unitLoadTypes`,
`dwellTimeMin`, `chargingStrategyPreference`, `topOfRollerHeightFt`, `driveAisleWidthFt`,
`rackingAisleWidthFt`, `sharedTrafficTypes`, `guidanceType`, `hazardZoneClassification`,
`restApiAvailable`, `barcodeScanningRequired`, `wmsInterfaceType`, `taggingScanMethod`,
`hasExistingAutomation`, `existingAutomationInterop`, `currentHeadcount`, plus per-flow
`distanceType`. `submissionType` is required on export (questionnaire-side only);
`hazardZoneClassification` is required when ATEX/IECEx is selected.
