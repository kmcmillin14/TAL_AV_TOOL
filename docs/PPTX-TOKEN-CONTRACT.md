# PPTX Token Contract — branded ROM export

The branded ROM PowerPoint export (`src/lib/pptxTemplateExport.ts`) loads
`public/templates/tal-rom-template.pptx` (the 35-slide TAL deck), removes the
slides the user didn't pick, fills placeholders, and downloads. This file is the
contract between the **template** (what placeholders/tables it must contain) and
the **code** (`src/lib/pptx/tokenMap.ts`). Keep them in sync.

## Slide map (template structure → `src/lib/pptx/sections.ts`)

| Slides | Section key | Notes |
|---|---|---|
| 1 | `cover` | always; bracket placeholders |
| 2–10 | `company` | static marketing |
| 11–17 | *(per-vehicle)* | overviews; included only for fleet chassis. 11 8TB · 12 8HBC · 13 M10 · 14 ML2 · 15 E7(ebase7) · 16 CB18 · 17 Cleanfix(always dropped) |
| 18 | `appReq` | Application Requirements (P2) |
| 19–20 | `matrix` | Vehicle Selection Matrix (P2) |
| 21–23 | `fleetEngine` | Raw / Charging / Buffer (P2) |
| 24 | `materialFlow` | Material Flow (P2) |
| 25–26 | `kpis` | KPIs (P1) |
| 27 | `investment` | Investment Summary / CAPEX (P1) |
| 28 | `roi` | ROI / payback (P1) |
| 29–32 | `services` | static |
| 33 | `whyTal` | static |
| 34 | `contact` | always; bracket placeholders |
| 35 | — | trailing; always kept |

## Placeholders

### P0 — live now (cover S1 + contact S34, native single-run brackets)

| Placeholder text (in template) | Filled with |
|---|---|
| `[TAL Representative]` | `bastianRep` |
| `[TAL Representative Name]` | `bastianRep` |
| `[Project Name + Rev + OPP #]` | `projectName · Rev {versionNumber} · {OPP|LEAD} {opportunityNumber}` |
| `[Customer and Location]` | `customerName — facilityLocation` |

A placeholder with no value is left as-is (editable bracket), never blanked.
`[Title]` / `[Email]` / `[Phone Number]` on S34 have no app field → left as brackets.

### P1/P2 — planned (`{{token}}` + skeleton tables to add to step slides)

To be added to the prepped template, styled natively, then filled by code:
- KPIs/Investment/ROI: `{{fleetTotal}}`, `{{capexLow}}`, `{{capexHigh}}`, `{{paybackYears}}`,
  `{{annualOffset}}`, `{{opexEnergy}}`, `{{opexMaint}}`, …
- Dynamic tables (one tokenized data row, cloned per item): fleet mix
  (`{{veh}} {{qty}} {{raw}}`), pricing (`{{veh}} {{qty}} {{unitLow}} {{unitHigh}}`),
  flows, requirements.

Run-normalization (merge adjacent runs within an `<a:p>`) will be applied before
`{{token}}` replacement so PowerPoint run-splitting doesn't cause misses.
