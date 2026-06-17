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

**Filename:** `Rev# Opp# Customer Project.pptx` (empty parts skipped; spaces kept;
filesystem-illegal chars stripped) — `buildFilename` in `pptxTemplateExport.ts`.

### P1 — live now (money slides via runtime shape injection)

The empty step shells are filled by **injecting native, editable `<p:sp>` text boxes at
build time** (`src/lib/pptx/content.ts` → `fillRomContent`) — the template stays a clean
branded shell; the content lives in code (reviewable, testable), not as template tokens.
Injection is no-op for any slide the user removed.

- **S25 KPIs:** fleet total · flow count · throughput; base + charging → buffered.
- **S26 KPIs:** per-vehicle fleet mix.
- **S27 Investment Summary:** CAPEX range (`rom.pricing.totalMin–totalMax`), total fleet, mix.
- **S28 ROI:** simple payback, annual labor offset, annual operating cost.

Data comes from `computeFleetModel(project, vehicles)` (`src/lib/fleetModel.ts`); money via a
local `usd()`; TAL red via theme `accent1`.

### P2 — planned

Remaining step slides (App Requirements S18, Matrix S19–20, Fleet Engine S21–23, Material
Flow S24) and dynamic `<a:tbl>` tables (pricing/mix rows cloned per item) — same injection
approach (a `graphicFrame`/`a:tbl` builder alongside `textBox`).
