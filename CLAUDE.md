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
