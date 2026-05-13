# Workflows

Long-running, multi-step protocols for autonomous agent work on the TAL Fleet Calculator. These are invoked on demand, not auto-loaded.

---

## /goal — Autonomous Long-Task Protocol

Use this template when handing off a multi-hour, end-to-end task to an autonomous agent (Claude Code or Codex). The agent should plan, execute, self-verify, and only check back when done or genuinely blocked.

### How to invoke

Paste the template below into Claude Code, replacing the bracketed fields with your specifics. Fill in every section — vagueness here is the #1 cause of off-target output.

### Template

```txt
/goal [THE FINAL OUTCOME — what "done" looks like in one line]

— CONTEXT —
• Project: [what you're building]
• Stack: [languages, frameworks, infra]
• Current state: [what exists today]
• Working dir: [path or repo]
• Constraints: [budget, time, off-limits items]
• Audience: [who this is for]

— SUCCESS CRITERIA (ALL MUST BE TRUE) —
1. [Specific measurable outcome]
2. [Specific measurable outcome]
3. [Specific measurable outcome]
4. Final deliverable runs without errors
5. You can show proof (screenshot · test output · URL)

— OPERATING RULES — NON-NEGOTIABLE —
1. PLAN FIRST. Output a numbered task list before writing any code.
2. WORK AUTONOMOUSLY. Don't ask clarifying Qs unless genuinely blocked.
3. SELF-VERIFY. After every step: run tests, inspect output, confirm it worked.
4. DEBUG YOURSELF. If it fails, diagnose + fix. Don't hand it back.
5. USE EVERY TOOL. MCPs · terminal · web · code exec · pull real data.
6. NO PLACEHOLDERS. No TODOs · no stubs · real components + real states.
7. PROGRESS LOG. Track completed · in-flight · decisions · blockers.
8. STAY ON GOAL. Discoveries off-spec? Note + keep moving.
9. IF BLOCKED. Log the wall · continue everything parallelizable.
10. CHECK SUCCESS BEFORE STOPPING. Re-read criteria · confirm each is met.

— QUALITY BAR —
• Code: clean, typed, follows project conventions
• Design: looks like a well-funded startup shipped it
• Output: survives a senior code review
• Docs: every new pattern / env var / decision logged

— FINAL DELIVERABLE —
✅ Confirmation each criterion is satisfied
📂 Every file created / modified
🚀 How to run / test / deploy
📊 Proof (screenshot · test output · URL)
📝 Decisions made + anything to know
⚠️ Known limitations + follow-ups

Begin by outputting your plan. Then execute end-to-end without checking in until done or genuinely blocked.
```

### Project-specific overrides for TAL Fleet Calculator

When using `/goal` on this project, the agent must also respect the always-on rules from `CLAUDE.md` and `ARCHITECTURE.md`. In particular:

- **Imperial-first** — all storage and calculation in lbs, inches, feet, °F.
- **Vehicle data is JSON-only** (`src/content/vehicles/*.json`) — never write vehicle data to the database.
- **Calc engine is pure** — no React, no DB calls in `src/calc/`.
- **Spec-first changes** — update `docs/SPECIFICATION.md` and `docs/CHANGELOG.md` before implementing, then check `ARCHITECTURE.md` for conflicts.
- **Toyota Type only** — never Inter, Roboto, Arial, or system fonts.
- **No required fields between steps** — every form field is optional for partial-project flow.
- **Folder hygiene** — delete orphaned files in the same commit as the refactor that made them obsolete.

If the `/goal` template's "WORK AUTONOMOUSLY" rule conflicts with a risky action (destructive git operations, dependency downgrades, schema migrations on shared data, pushing to `main` without verification), **pause and confirm** — that override beats the autonomy rule.

### When to use vs. skip

**Use `/goal` for:**
- End-to-end features that span schema + calc + UI (e.g., "add a new vehicle qualification dimension across the stack").
- Multi-hour migrations or refactors with a clear acceptance test.
- Build-out tasks where the spec is settled and you want hands-off execution.

**Skip `/goal` for:**
- Single-file edits, bug fixes, or quick questions — the ceremony is overhead.
- Tasks where the spec is still being negotiated — iterate in conversation first.
- Anything where you want to review each step before the next one runs.
