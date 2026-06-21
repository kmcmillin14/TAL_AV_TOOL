@AGENTS.md

# CLAUDE.md — Claude Code Project Instructions

TAL Fleet Calculator — Enterprise AGV/AMR fleet sizing tool. This file is the
single, version-controlled source of Claude Code instructions for the project
(the former copy in the parent folder has been removed to avoid drift).

## Before ANY Code Change

1. Read `ARCHITECTURE.md` — non-negotiable rules and the authoritative gate model
2. Read `docs/SPECIFICATION.md` — current spec (per-step behavior, source of truth)
3. Read `docs/CHANGELOG.md` — understand what has changed

## Rules That Must Never Be Violated

- Imperial-first: ALL storage and calculation in lbs, inches, feet, °F (convert only at display)
- Vehicle data comes from JSON files ONLY (`src/content/vehicles/`), never a database
- All calculations in `src/calc/` must be pure functions (no React, no I/O)
- No backend database — project state lives in browser `localStorage` (`src/lib/storage.ts`);
  cross-session/device persistence is JSON import/export only
- Each step is independent and modular — a step page never imports another step's internals
  (see `ARCHITECTURE.md` §4 module boundaries; the Fleet Engine sub-tab exception is noted there)
- Gates: see `ARCHITECTURE.md` §3 for the authoritative HARD (→ RED) vs SOFT (→ YELLOW) split.
  Hard gates have no tolerance; aisle width is informational only (NOT a gate)
- Step 2 is informational — no vehicle selection
- No required fields to advance between steps — every form field is optional (partial projects)
- Transfer methods are arrays per vehicle with individual load/unload times
- Price is a range (minUsd/maxUsd), not a single value
- Design system from Claude Design must be used for all UI
- Typography: Toyota Type is the ONLY font — `public/fonts/ToyotaType-*.otf`, via `@font-face`
  in `globals.css`, referenced as `var(--tal-font-family)` (body) / `var(--tal-font-numeric)`
  (numeric/labels). Never use Inter, Roboto, Arial, or system fonts as primary `font-family`.

## File Locations

- Architecture rules + gate model: `ARCHITECTURE.md`
- Specification: `docs/SPECIFICATION.md`
- Changelog: `docs/CHANGELOG.md`
- Vehicle library: `src/content/vehicles/*.json`
- Calculation engine: `src/calc/`
- Display formatters (shared by cards/modal/spec sheet): `src/lib/vehicleDisplay.ts`
- Design system: `src/design-system/`
- Browser storage (project state + import/export): `src/lib/storage.ts`
- Skills workflow: `docs/SKILLS.md`
- Long-task / autonomous-agent protocol (`/goal`): `docs/WORKFLOWS.md`

## When Adding Features

1. Update `docs/SPECIFICATION.md` first
2. Update `docs/CHANGELOG.md`
3. Check `ARCHITECTURE.md` for conflicts (if a rule changes, update ARCHITECTURE.md too)
4. Then implement code
5. Validate against acceptance criteria (`npm run build` / `npx vitest run`)

## Folder Structure Hygiene

- Delete files immediately when no longer imported/used — no orphaned components/utilities
- Never leave Next.js boilerplate files (`public/file.svg`, `globe.svg`, `next.svg`, etc.)
- Before creating a new file, check if an existing file can be edited instead
- If a refactor makes a file obsolete, delete it in the same commit
- After any significant refactor, grep for orphaned imports and remove them

## Skill Workflow (see docs/SKILLS.md)

Build (`/frontend-design` for new UI) → `/simplify` (pre-commit cleanup) → `/review`
(pre-merge) → commit + push. Auto-commit: after a set of changes, stage all, commit with a
summary, push to `origin main`.

## Pre-Push Checklist (run before EVERY push)

Run this every push. The `.githooks/pre-push` hook automates the mechanical gates
(steps 2–4); the rest are judgment steps the hook can't do.

1. **Docs first** — update `docs/SPECIFICATION.md` (behavior) and `docs/CHANGELOG.md`
   for any feature/behavior change (per "When Adding Features").
2. **Typecheck / build** — `npx tsc --noEmit` (or `npm run build`) is clean.
3. **Tests** — `npx vitest run` all green.
4. **Architecture gate** — `npm run check:arch` passes.
5. **`/simplify`** — quality cleanup of the diff (reuse · dead code · altitude).
6. **`/review`** — correctness review of the diff.
7. **CSS edited?** — after editing `app/globals.css`, restart the dev server clean
   (`rm -rf .next` then `npm run dev`) so the served chunk isn't stale; hard-refresh
   the browser (the chunk URL can stay the same hash).
8. Stage all, commit with a summary, push to `origin main`.

The `pre-push` hook enforces 2–4 and prints a reminder for the rest. Bypass with
`git push --no-verify` only for an intentional exception.

## Enforcement (run once per clone)

```
git config core.hooksPath .githooks
```

Enables **two** hooks:
- **pre-commit** — runs `npm run check:arch` (calc purity · module boundaries ·
  Toyota-Type-only · vehicle data in JSON — ARCHITECTURE.md §3/§6) and blocks a commit
  that changes the data model / architecture (`src/calc/`, `schemas.ts`,
  `src/content/vehicles/`, `ARCHITECTURE.md`) without a `docs/CHANGELOG.md` entry.
- **pre-push** — runs the Pre-Push Checklist gates (typecheck · `check:arch` · tests).

Bypass an intentional exception with `git commit --no-verify` / `git push --no-verify`.
CI can run the same gate via `npm run check:arch`.
