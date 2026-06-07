# Slide-Deck Export — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design); pending spec review → implementation plan
**Feature:** Browser-side PowerPoint (`.pptx`) export of dynamic project data slides for the TAL Fleet Calculator, plus retention of the existing PDF proposal.

## Summary

Add a **"Generate deck"** action on the Step 4 ROM Dashboard that produces a branded
`.pptx` containing the **dynamic data slides** for a project — cover, application
requirements, fleet sizing, ROM pricing, analytics highlights, ROI/payback, and **one
auto slide per vehicle type in the fleet**. The sales engineer appends these to their own
TAL template/generic deck in PowerPoint (hybrid model). The existing fixed-layout **PDF**
proposal remains the record-of-file option.

The entire feature runs **client-side in the deployed browser** — no AI, no backend, no
server compute, no per-export cost — consistent with the project's localStorage-only
architecture.

## Decisions (locked via brainstorming)

| Decision | Choice |
|---|---|
| Output formats | **PPTX (new) + keep existing PDF** |
| Standard slides | Cover · Requirements · Fleet sizing · ROM pricing · Analytics highlights · ROI/payback · Auto per-vehicle |
| Selection UX | **Checklist dialog** (all on by default; per-vehicle slides listed individually; PPTX/PDF toggle). No reorder/drag. |
| Template approach | **Hybrid** — generate only the dynamic data slides; user merges with their TAL deck in PowerPoint |
| Per-vehicle granularity | **One slide per vehicle type in the fleet** (by `vehicleId`), not per flow |
| Branding | Recreate TAL look as a PptxGenJS master (red `#EB0A1E`, logo, footer); font face `'Toyota Type'` with PowerPoint's system fallback |

## Non-goals (YAGNI)

- No programmatic merge of the user's generic intro/closing deck (merge happens in PowerPoint).
- No slide reordering/drag.
- No new persisted settings — slide selection is per-export, in memory.
- No rebuild of the PDF; the PDF path reuses today's `downloadProjectPdf` (extended by the ROM plans).
- No server/Node template-fill library (keeps it browser-only and license-free).

## Architecture

New module `src/lib/deck/`, with a strict split between **pure data assembly** and
**rendering** (so the data is unit-testable without PptxGenJS).

```
src/lib/deck/
  deckData.ts        # PURE: project + fleet + rom + analytics → DeckModel. No pptxgenjs import.
  brand.ts           # TAL tokens: colors, logo path, footer text, font face, master definition.
  slides/
    coverSlide.ts        # (pptx, model) => void
    requirementsSlide.ts
    fleetSlide.ts
    pricingSlide.ts
    analyticsSlide.ts
    roiSlide.ts
    vehicleSlide.ts      # (pptx, model, vehicle) => void — looped per fleet vehicleId
  buildDeck.ts       # orchestrator: dynamic import pptxgenjs, define master, add selected slides, return Blob; downloadDeck().
src/components/rom/
  DeckExportDialog.tsx   # checklist modal; launched from RomExportBar.
```

### Library

`pptxgenjs` (MIT, browser bundle), loaded via dynamic `import('pptxgenjs')` inside
`buildDeck.ts` — mirrors how `src/lib/pdfExport.ts` dynamic-imports `pdf-lib` to keep it
out of the main bundle. Generates real, editable PowerPoint from scratch.

### Data model (`deckData.ts`, pure)

`buildDeckModel(input) => DeckModel` assembles everything the slides need, reusing the
existing pure calc (`fleetSummary`, `romSummary`, `fleetAnalytics`) — it does **not**
recompute physics. Shape (illustrative; finalized in the plan):

```ts
interface DeckModel {
  meta: { projectName: string; customerName: string; rep: string; location: string; dateLabel: string; revision: string }
  requirements: { maxLoadLbs: number | null; loadDims: string; maxLiftFt: number | null; minAisleFt: number | null;
                  schedule: string; daysPattern: string; tempEnvelope: string; certifications: number; interlocks: number; wms: string }
  fleet: { totalBaseFleet: number; totalChargingDelta: number; bufferVehicles: number; totalFleetSold: number;
           mix: Array<{ name: string; baseFleet: number; fleetSold: number }> }
  pricing: { lines: Array<{ name: string; qty: number; unitRange: string; lineRange: string }>; totalRange: string; midLabel: string }
  analytics: { tiles: Array<{ label: string; value: string }> }   // pre-formatted strings from fleetAnalytics
  roi: { capexRange: string; annualOpex: string; laborOffset: string; payback: string; tco: string; costPerMove: string }
  vehicles: Array<{ id: string; name: string; manufacturer: string; imageUrl: string; specs: Array<[string, string]>; priceRange: string; qty: number }>
}
```

All money/number formatting is done here (reusing the `StatTile`/`RomKpis` formatters),
so slide builders only place strings/images — keeping them trivial and the logic testable.

### Rendering (`slides/*.ts` + `brand.ts`)

- `brand.ts` exports `TAL` tokens and `defineMaster(pptx)` (PptxGenJS `defineSlideMaster`)
  that lays in the red title bar, logo placeholder, and footer. Font face is
  `'Toyota Type'`; PowerPoint substitutes a system font where TAL fonts aren't installed —
  documented as expected (colors, logos, images, layout remain faithful).
- Each slide builder takes `(pptx, model)` (or `(pptx, model, vehicle)` for the loop) and
  adds exactly one slide using the master. `vehicleSlide.ts` is called once per
  `model.vehicles[i]`.

### Orchestration (`buildDeck.ts`)

```
buildDeck(model: DeckModel, selection: DeckSelection): Promise<Blob>
  - const PptxGenJS = (await import('pptxgenjs')).default
  - const pptx = new PptxGenJS(); pptx.defineLayout(...); defineMaster(pptx)
  - if selection.cover        → coverSlide(pptx, model)
  - if selection.requirements → requirementsSlide(pptx, model)
  - if selection.fleet        → fleetSlide(pptx, model)
  - if selection.pricing      → pricingSlide(pptx, model)
  - if selection.analytics    → analyticsSlide(pptx, model)
  - if selection.roi          → roiSlide(pptx, model)
  - for each v in model.vehicles where selection.vehicleIds.has(v.id) → vehicleSlide(pptx, model, v)
  - return (await pptx.write({ outputType: 'blob' })) as Blob
downloadDeck(model, selection, filename): Promise<void>   // build + trigger download
```

`DeckSelection = { cover, requirements, fleet, pricing, analytics, roi: boolean; vehicleIds: Set<string> }`.

### Selection UI (`DeckExportDialog.tsx`)

Modal launched from `RomExportBar` ("Generate deck"). Lists the six standard slides with
checkboxes (default on), then a "Per-vehicle spec slides" group with one checkbox per
fleet vehicle (default on), and a **PPTX / PDF** format toggle:

- **PPTX** → `downloadDeck(model, selection, '<project>_deck.pptx')`.
- **PDF** → existing `downloadProjectPdf(project)` (unchanged).

Busy state during generation (mirrors the PDF button). Generate disabled when the fleet is
empty, with the hint "Size the fleet first."

## Data flow

```
step4 page (already has project, fleet, rom, analytics, vehicleById)
  → buildDeckModel({ project, fleet, rom, analytics, vehiclesById })   [pure]
  → <DeckExportDialog model=... project=... />
      → on Generate (PPTX): buildDeck(model, selection) → Blob → download
      → on Generate (PDF):  downloadProjectPdf(project)
```

Vehicle images (`public/images/vehicles/{id}.png|jpg`) and the TAL logo
(`public/assets/TAL-Logo-*.png`) are fetched and base64-encoded inside `buildDeck`
(PptxGenJS `addImage` accepts data URLs).

## Error handling

- **Missing vehicle image** → `vehicleSlide` draws a neutral placeholder rectangle; no crash.
- **Empty fleet** (`model.vehicles.length === 0` / `totalFleetSold === 0`) → PPTX disabled in the dialog with a hint.
- **Image fetch failure** → caught; slide proceeds without the image.
- **`buildDeck` failure** → surfaced as a non-blocking error state in the dialog; busy flag cleared in `finally`.

## Testing

- `deckData.ts` → vitest unit tests: `buildDeckModel` produces correct strings/structure
  from a stubbed project + fleet + rom + analytics (pure, like the existing rom tests).
- `buildDeck.ts` → one smoke test: for a given model + selection, the returned Blob is
  non-empty and the slide count matches the selection (PptxGenJS runs in the test env;
  count asserted via the pptx object before `write`, or by selection arithmetic).
- Slide builders are intentionally thin (place pre-formatted strings/images), so the model
  tests carry the meaningful coverage.
- Gate per repo rules: `npx vitest run` + `npm run build` + purity grep (`deckData.ts`
  imports no React/localStorage/fs) + commit/push.

## Dependencies & ordering

Builds on the ROM Dashboard work:
- `docs/superpowers/plans/2026-06-07-rom-dashboard.md` (provides `romSummary`, step4 page, `RomExportBar`, `useFleetData`).
- `docs/superpowers/plans/2026-06-07-rom-dashboard-analytics.md` (provides `fleetAnalytics`).

New runtime dependency: `pptxgenjs` (add to `package.json`).

## Open implementation notes (resolved in the plan, not blockers)

- Exact PptxGenJS layout coordinates (10"×5.63" 16:9) and master regions.
- Whether vehicle image extension is `.png` or `.jpg` per id (probe both; the fleet has 5 PNG + 1 JPG today).
- Filename convention: `<sanitized projectName>[_<revision>]_deck.pptx` (reuse pdfExport's `filename` sanitizer pattern).
