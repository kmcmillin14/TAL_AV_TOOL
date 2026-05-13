# Claude Code Skills — Workflow

Skills used on this project, when to invoke them, and how they fit together.

## The Three-Skill Workflow

### 1. `/frontend-design` — Before building new UI

Generates polished, non-generic UI for new sections.

**When to invoke:**
- Starting a new step page (Step 4, Step 5, etc.)
- Building a new component (results dashboard, KPI tile, modal)
- Redesigning an existing section

**How to invoke:**
```
/frontend-design <description of what to build>
```

**Example:**
```
/frontend-design Step 4: Throughput Results dashboard with 4 KPI tiles
(cycles/hr, utilization %, payback months, fleet size) and a per-vehicle
breakdown table. Match Step 2/3 hero bar layout.
```

**Constraints to mention every time:**
- Toyota Type font only (`var(--tal-font-family)`, `var(--tal-font-numeric)`)
- Use existing design system tokens from `app/globals.css`
- No Inter, Roboto, Arial, or system fonts
- Match hero bar pattern (hero-top + hero-bottom + hero-nav)

---

### 2. `/simplify` — After implementing, before committing

Reviews uncommitted changes for cleanup, reuse, and quality issues, then fixes them.

**When to invoke:**
- After finishing a feature, before `git add`
- After a refactor that touched multiple files
- When you suspect duplicate logic was introduced

**Catches things like:**
- Logic that duplicates existing helpers in `src/calc/` or `src/lib/`
- Over-engineered abstractions
- Dead code from refactors
- React imports sneaking into `src/calc/` (violates architecture rule)
- Vehicle data accidentally read from DB instead of JSON

**How to invoke:**
```
/simplify
```

---

### 3. `/review` — Before opening a PR or merging

Structured code review of pending branch changes.

**When to invoke:**
- Before `git push` on a feature branch
- Before opening a PR
- Before merging to `main`

**Checks for:**
- Architecture rule violations (see `ARCHITECTURE.md`)
- Missing test coverage
- Inconsistent patterns vs. existing code
- Spec/changelog updates missing (`docs/SPECIFICATION.md`, `docs/CHANGELOG.md`)

**How to invoke:**
```
/review
```

---

## Pre-Commit Ritual

For most feature work, run skills in this order:

1. **Build** the feature (with `/frontend-design` if UI is involved)
2. **`/simplify`** → clean up duplicate/dead code
3. **`/review`** → final sanity check
4. **Commit + push** (per auto-commit rule in `MEMORY.md`)

## Other Available Skills

These exist but aren't part of the core workflow:

- `/security-review` — Run before any release or auth-related change
- `/update-config` — Modify `settings.json`, hooks, permissions
- `/fewer-permission-prompts` — Auto-allowlist common safe commands
- `/init` — Initialize a new `CLAUDE.md` (already done for this project)
- `/loop` — Recurring task execution
- `/schedule` — Cron-style scheduled agents
- `/keybindings-help` — Customize keyboard shortcuts
