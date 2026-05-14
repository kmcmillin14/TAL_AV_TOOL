# ARCHITECTURE.md

The single source of truth for **how** the TAL Fleet Calculator is built. For **what** it does (per-step behavior, traffic-light matrix, vehicle JSON schema, calc-engine I/O), see `docs/SPECIFICATION.md` *(to be written)*. For decision history, see `docs/CHANGELOG.md`.

---

## 1. Mission

A web tool that lets TAL apps engineers and customers size AGV/AMR fleets — load specs in, qualified vehicles + flows + ROM proposal out. Anonymous, multi-user, no sign-in; each session lives in the user's browser, persisted via JSON import/export.

## 2. Stack

- **Next.js 16.2.5** (App Router, Turbopack) — React 19, TypeScript strict
- **React Hook Form 7** + **Zod 4** — form state + validation
- **Browser-only state** — `localStorage` via `src/lib/storage.ts`. No backend database.
- **Toyota Type** for body/heading (`public/fonts/ToyotaType-*.otf`), **JetBrains Mono** stack for numerics
- **Vercel** — static landing + per-page serverless functions

## 3. Non-negotiable rules

Each rule is followed by **why** so edge cases can be reasoned about, not just memorized.

- **Imperial-first storage.** All numeric fields stored in lbs, inches, feet, °F. Display layers can convert to metric; storage and calc layers cannot. *Why:* avoids round-trip drift and unit-ambiguity in customer-facing proposals.

- **Vehicle data lives in JSON only** — `src/content/vehicles/*.json`. Never in a database, never hardcoded in components. *Why:* the vehicle library evolves as a content edit (commit-able by anyone who can read JSON), not as a code change.

- **`src/calc/` is pure.** No React, no `fetch`, no `localStorage`, no `fs`. Inputs in → results out. *Why:* testable in isolation, portable to other contexts (a future CLI or background job), and free of hidden state.

- **No backend database.** Every user's session is a record in their browser's `localStorage`. Cross-session and cross-device persistence is the user's responsibility via JSON export/import. *Why:* anonymous multi-user, zero hosting cost, no PII to handle.

- **Hard gates are absolute.** Max load weight, max lift height, freezer/outdoor flags, required certifications. A vehicle that fails any hard gate is **RED**, with no override. *Why:* misqualifying a vehicle has downstream safety and contractual consequences; the traffic light must be conservative.

- **Aisle width is informational only** — never blocks qualification. *Why:* real-world aisle compatibility depends on turn radius, blind spots, and on-site verification, not a single dimension on a spec sheet.

- **Step 2 is informational only** — no vehicle selection happens there. *Why:* the qualified vehicle set is an *output* of the flows + calc engine in later steps, not a manual user choice.

- **Transfer methods are arrays per vehicle**, each with its own load/unload time. *Why:* one vehicle may support fork + conveyor + lift-platform with different cycle times each.

- **Price is a range** (`minUsd` / `maxUsd`), never a single value. *Why:* real quotes vary by dealer, configuration, and contract terms; a single number would be false precision.

- **Steps are independent and modular.** Each step's page lives at `app/projects/[id]/stepN/page.tsx`; step-specific subcomponents live at `src/components/stepN/`. A step page may import its **own** step's subcomponents plus any shared module (`src/components/PersistentHeader.tsx`, `src/lib/*`, `src/calc/*`); it must **not** import another step's internals.

- **Typography: Toyota Type is the only intentional font.** Body/heading uses `var(--tal-font-family)`, numerics use `var(--tal-font-numeric)`. The CSS variable definitions include a system-font fallback chain (`-apple-system`, `sans-serif`, etc.) for graceful degradation if the bundled font fails to load — that fallback chain is **not** a license to reference system fonts elsewhere. Never use Inter, Roboto, Arial, etc. as primary `font-family` values in components or new CSS.

## 4. Module boundaries

| Layer | May import | Must NOT import |
|---|---|---|
| `src/calc/*` | std lib, calc types | React, `fetch`, `localStorage`, `fs`, Zod schemas, app/lib code |
| `src/lib/vehicleLibrary.ts` | `fs`, `path` (server only) | React, `localStorage` |
| `src/lib/storage.ts` | `localStorage`, Zod schemas | `fs`, React |
| `src/components/*` | calc, lib, design-system | direct `fs` or `localStorage` (always go through `storage.ts`) |
| `app/**/page.tsx` | components, lib, calc | new inline calculation code (push to `src/calc/`) |

## 5. Folder map

```
tal-fleet-calculator/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # decision screen (Import / Fill Form)
│   ├── projects/[id]/stepN/      # six step pages (1..6)
│   ├── api/vehicles/route.ts     # only API route; reads bundled JSON
│   └── globals.css               # all design-system CSS lives here
├── src/
│   ├── calc/                     # pure calculation engine
│   ├── components/               # shared UI + per-step subcomponents (stepN/)
│   ├── content/vehicles/*.json   # canonical vehicle library (6 records today)
│   ├── design-system/            # design tokens, Icon component
│   └── lib/                      # storage, vehicleLibrary, utils, validations
├── public/                       # fonts, vehicle images, TAL logos
├── docs/                         # CHANGELOG, SPECIFICATION (TBD), SKILLS, WORKFLOWS
├── ARCHITECTURE.md               # this file
└── CLAUDE.md                     # Claude Code instructions; defers to this doc
```

## 6. Audit checklist (before any non-trivial PR)

- `npm run build` passes (`tsc` strict + `next build`).
- `grep -r "from 'react'\|localStorage\|from 'fs'" src/calc/` returns **nothing** — calc layer is still pure.
- No new vehicle data lives outside `src/content/vehicles/*.json`.
- No new `font-family` reference outside `var(--tal-font-family)` / `var(--tal-font-numeric)` / their CSS-variable definitions.
- Storage and calc layers still use imperial units (`lbs`, `inches`, `feet`, `°F`).
- New step page imports stay within its own `src/components/stepN/` plus shared modules — never `src/components/step{X≠N}/`.
- `docs/CHANGELOG.md` has an entry if the change touches architecture, the data model, or a non-negotiable rule.
