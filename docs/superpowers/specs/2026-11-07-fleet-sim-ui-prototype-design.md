# Fleet Simulation — UI Prototype / Demo — design

**Date:** 2026-11-07
**Status:** Design (for owner review) — prototype only; no app code changes
**Source:** 2026-11-07 evaluation thread (stay as is vs Monte Carlo vs simulation; stress test vs
primary sizing; node model). This spec defines a **clickable demo** to validate the UI with
apps and technical-sales engineers *before* any simulation engine is built.

---

## 1. Purpose

Answer one question cheaply: **would an apps / technical-sales engineer use this screen in a
real customer conversation?**

The prototype tests the *experience*, not the engine. It must make the three answers the
simulation exists to give feel obvious in one pass:

1. **Verdict** — does the Step 3 fleet hold the customer's peak?
2. **Break point** — how much growth headroom before it fails?
3. **First bottleneck** — where does it break first?

If engineers don't reach for these three answers in a mock customer meeting, the design
changes before a single line of engine code is written.

## 2. Decisions the prototype embodies (locked for the demo)

| # | Decision |
|---|---|
| D1 | **Formula is primary; the simulation is a stress test that may raise the fleet, never lower it.** Spare capacity is shown as the break point, never as a fleet reduction. |
| D2 | **Demand comes from Step 3 flows** — each flow's origin pushes its moves/hr to its destination. No second demand list. |
| D3 | **Node = role + kind.** Role (Pickup / Dropoff / Both) is **derived from Step 3** and shown as a badge; the engineer picks the **kind**. |
| D4 | **Five kinds:** Floor · Conveyor · Racking · Deep lane · Stand. |
| D5 | **Deep lane is configured by depth × height** (+ lanes, LIFO/FIFO). Height > 1 = stacked. |
| D6 | **Racking is configured by number of levels × height per level** (+ positions per level). |
| D7 | **ANSI B56.5 = aisle width only**, shown as amber **guidance**, never a gate. |
| D8 | **Pallets drawn to scale only where a load exists** — occupied positions and loaded vehicles. Empty positions and empty-travelling vehicles show no pallet. |
| D9 | **Browser only, no backend, no new storage.** Floor plan (phase 2) is in-memory only. |
| D10 | **Optional step after Sizing.** Never required to advance. |

### Open decisions — defaults the prototype assumes (owner to confirm)

| Open item | Prototype default |
|---|---|
| B56.5 aisle clearance value | **Placeholder**, visibly labeled "placeholder — owner to supply from current edition". |
| Mixed loads per flow | One load per project (`loads[0]`), shown as the pallet size. |
| Empty returns | Entered as explicit Step 3 flows (none in the sample). |
| Role derived from Step 3 | Yes — read-only badge. |

## 3. Scope

**In:** one interactive, self-contained page that looks like the real app (TAL hero bar, step
ribbon, tokens) showing the Simulate step on the bundled **Company A** sample; a deliberately
simple *toy* engine so the map moves and numbers respond to edits; a 5-minute demo script;
a usability-test plan.

**Out (non-goals):** a real or ANT-faithful engine; floor-plan import (shown only as a
disabled "Phase 2" affordance); Monte Carlo; Step 4/5/deck integration (shown as a static
"what changes downstream" note); persistence; mobile editing (mobile shows read-only verdict).

**Fidelity:** high visual fidelity, low engine fidelity. Every number carries a
**"Prototype — illustrative"** tag. The page must never be mistaken for a quote.

## 4. Form factor

- A **single self-contained HTML page** (inline CSS/JS, no build step), shareable as a
  private claude.ai artifact link or opened locally. Runs entirely in the browser; stores
  nothing beyond an optional per-viewer remembered setting.
- Lives outside the app's source tree — it must not touch `src/`, `app/`, the calc engine or
  architecture checks. If kept in the repo: `docs/prototypes/fleet-sim/index.html`.
- **Toyota Type:** if hosted as an artifact the bundled `.otf` must be inlined as a data-URI
  `@font-face`; otherwise fall back to the documented stack and note it on the page.

## 5. Sample scenario — Company A DC (`src/content/samples/company-a-project.json`)

2 shifts × 8 h, Mon–Fri · Standard Pallet **48 × 40 × 48 in**, 1,800 lb (GMA) · min aisle
**12 ft** · interlocks: High-Speed Doors, Pick Module Fencing.

| Flow (Step 3) | Distance | Moves/hr | Vehicle |
|---|--:|--:|---|
| Receiving Dock → Reserve Racking | 400 ft | 30 | CB18 (forklift, reach 14.67 ft) |
| Reserve Racking → Forward Pick | 250 ft | 18 | CB18 |
| Forward Pick → Pack Line 1 | 600 ft | 12 | M10 (tugger, floor) |
| Forward Pick → Pack Line 2 | 750 ft | 10 | M10 |
| Pack Out → Staging | 350 ft | 25 | 8HBC40A (pallet truck, floor) |
| Staging → Shipping Dock | 300 ft | 25 | 8HBC40A |

**Node kinds pre-set for the demo** (role derived from the flows above):

| Station | Role | Kind (demo) | Settings |
|---|---|---|---|
| Receiving Dock | Pickup | Floor | 4 positions |
| Reserve Racking | Both | Racking | 5 levels × 4 ft (1st beam 4 ft) — top beam 20 ft **exceeds CB18 reach → flag** (demo beat 4) |
| Forward Pick | Both | Stand | 2 positions, 0 ft |
| Pack Line 1 / 2 | Dropoff | Floor | 2 positions each |
| Pack Out | Pickup | Conveyor | out-feed 1 / 120 s, accumulation 3, height 0 ft |
| Staging | Both | Deep lane | 4 lanes × 6 deep × 1 high, LIFO |
| Shipping Dock | Dropoff | Floor | 6 positions |

The **Formula** figure shown is the current engine's real Step 3 output for this sample
(computed once with `computeFleet` and pasted in), so the demo compares against the true
number the app quotes today.

## 6. Screen layout (desktop, ≥ 1000 px)

```
┌ TAL hero bar · Rev · Opp · Customer · Project ─────────────────────── [?] ┐
│ 0 Start · 1 Intake · 2 Compatibility · 3 Sizing · ▸ Simulate · 4 Pricing … │
├───────────────────────────────────────────────────────────────────────────┤
│ VERDICT BAND                                                              │
│  ● Holds peak with 7 vehicles        Break point          First bottleneck│
│    Formula 7 · Simulated 7           +24% (68 moves/hr)   Staging lane    │
│    [Find fleet]  ⟶ (Accept 8)                                access       │
├──────────────────────────────────────────────┬────────────────────────────┤
│ STATION MAP (schematic, auto-placed)          │ NODE INSPECTOR             │
│  [Receiving]──400──▶[Reserve ▦]──250──▶[FwdPick]│ Staging                   │
│      ▪▪              ▦▦▦                 │      │ [BOTH] (from Step 3)      │
│                                   600 ──▶[Pack L1]│ Kind ○Floor ○Conv ○Rack │
│  [Pack Out ⇉]──350──▶[Staging ≡≡]──300──▶[Ship] │      ●Deep lane ○Stand   │
│   chips: ● ok  ● review  ● problem             │ Depth [6] Height [1]      │
│   aisles: heat = waiting · ⚠ = B56.5 guidance │ Lanes [4] Access [LIFO ▾] │
│                                               │ Serves: 8HBC40A ✓         │
│ ▶ Run  ⏸   1× 10× 60×   ──●──────── 06:00–22:00│ Pallet 48×40 in           │
├──────────────────────────────────────────────┴────────────────────────────┤
│ ▸ Detail  (closed)  Heat map · Storage fill · Vehicle timelines · Assumptions│
└───────────────────────────────────────────────────────────────────────────┘
```

Numbers above are layout placeholders; the prototype computes its own.

Progressive disclosure order (CLAUDE.md simplicity rule 3): **verdict band → map with chips →
inspector → Detail drawer (closed) → Assumptions (inside Detail)**.

## 7. Components

### 7.1 Verdict band (always visible, first thing read)
- **Verdict sentence** with one status swatch (good / warn / bad — the app's square swatch,
  not a filled pill): *"Holds peak with 7 vehicles"* · *"Falls short — needs 8"*.
- **Formula vs Simulated** — two figures, same type size; the formula is labeled *quoted*.
- **Break point** — `+N%` headroom and the moves/hr it equals. Primary sales number.
- **First bottleneck** — node or aisle name; clicking it selects it on the map.
- **Find fleet** — searches **upward only** from the formula number. **Accept N** appears
  *only* when the simulation needs more than the formula (D1). Accepting shows a small
  "Pricing will use 8 (simulated)" note; the prototype does not navigate.
- Tag: **Prototype — illustrative**.

### 7.2 Station map
- Schematic, auto-laid-out graph: stations as rounded tiles, flows as directed links labeled
  with Step 3 distance. Drag a station to tidy the layout (positions only — no distance edit).
- **Station tile:** name · role badge (`PICKUP` / `DROPOFF` / `BOTH`, derived) · kind icon ·
  health chip (`ok` / `review` / `problem`) · its positions drawn small (D8: a pallet glyph at
  true 48:40 proportion only in occupied positions; empty positions are outlines).
- **Vehicles:** dots in the vehicle-type colour moving along links; a loaded vehicle carries a
  pallet glyph, an empty one does not.
- **Aisle links:** thickness constant; colour ramp = waiting time (heat). A link below B56.5
  guidance carries an amber ⚠ glyph.
- Phase-2 affordance: a disabled **"Import floor plan (JPEG/PDF)"** button with a tooltip.

### 7.3 Node inspector (right rail)
1. Station name.
2. **Role badge** — read-only, with hover: *"Set by Step 3 flows. Change it there."*
3. **Kind** — five-way segmented control with icons.
4. **Kind settings** — only that kind's fields, all prefilled:

| Kind | Fields |
|---|---|
| Floor | Positions, dwell (min) |
| Conveyor | Rate (1 load / N s), accumulation, height (ft) |
| Racking | Levels, first beam (ft), level spacing (ft), positions/level |
| Deep lane | Lanes, depth, height (levels), access LIFO/FIFO |
| Stand | Height (ft), positions |

5. **Serves** — each vehicle assigned to a flow touching this node, ✓ / ✗ with the reason
   from the existing rules (forklift reach, lift-table matched height, floor-only, stacking
   gate). Example ✗: *"CB18 reach 14.67 ft < top beam 20 ft"*.
6. **Pallet** — `48 × 40 in` (from Step 1 loads).
7. **Health** — one line: *"Fill peaks 83% at 14:20"* / *"Lane wait P90 41 s"*.
8. Advanced (disclosure, closed): timing pattern (steady / random), level selection.

Selecting an aisle link shows instead: width (from Step 1, editable), one-way / two-way, and
the **B56.5 guidance** card (7.4).

### 7.4 B56.5 aisle guidance card
- Shows: aisle width · widest of vehicle / load (e.g. CB18 4.19 ft vs load 3.33 ft → 4.19 ft)
  · required clearance (**placeholder value, labeled**) · result: *Meets guidance* or amber
  *"Below B56.5 aisle guidance — verify on site walk"*.
- Footer: *"Guidance only, not a safety assessment. Values from ANSI/ITSDF B56.5 (current
  edition) — confirm with site risk assessment."*
- Never changes a verdict colour of the fleet; only the aisle chip.

### 7.5 Run controls
Run / Pause · speed 1× / 10× / 60× · shift scrubber (staffed window from Step 1: 06:00–22:00) ·
seed shown in Detail. **Auto-runs on open** at 60× so the first frame already shows a result.

### 7.6 Detail drawer (closed by default)
Tabs: **Heat map** (waiting by aisle/node, ranked list beside it) · **Storage fill**
(fill-over-shift line per storage node) · **Vehicle timelines** (working / travelling empty /
waiting / charging stacked bar per vehicle) · **Assumptions** (one charger per vehicle,
staggered charging, route speed factor, ANT-like behaviour, toy-engine disclaimer).

## 8. States the prototype must show

| State | Trigger | What the user sees |
|---|---|---|
| First open | Load page | Map auto-placed, auto-run, verdict filled — never an empty shell |
| Holds | Default sample | Green swatch, break point, bottleneck named |
| Falls short | Demo beat 3 (throughput +40%) | Amber/red swatch, "needs N", **Accept N** appears |
| Node can't be served | Racking top beam > CB18 reach | Node chip red, ✗ in Serves, verdict line notes it |
| Stacking conflict | Deep lane height → 2 while Step 1 says no stacking | Amber chip: *"Height 2 means stacking — Step 1 says not required"* |
| Aisle below guidance | Aisle width edited below threshold | Amber ⚠ on link, guidance card |
| No flows | Toggle "empty project" in demo menu | Designed empty state: *"Add flows in Step 3 to simulate"* + link |

## 9. Toy engine (prototype only — not the real model)

Simple, deterministic (seeded), runs in-page, enough to make edits feel causal:
- Moves arrive per flow at its Step 3 rate (random spacing, fixed seed).
- Each job: travel loaded + travel empty using the **same cycle inputs as Step 3** (distance,
  vehicle speed × route factor, transfer time, lift = height ÷ lift speed); racking/deep-lane
  lift uses the level's height; in-lane travel = position × pallet pitch at half speed.
- Nodes have capacity (positions); **one vehicle per deep lane / per conveyor handoff** at a
  time; a job waits when its destination is full or busy.
- Vehicles of a type are pooled; nearest idle takes the job. Charging is approximated by
  removing each vehicle for its share of non-available time from the v4 availability figure.
- Break point: re-run at +10% steps until throughput held < 100% or P90 wait > threshold.
- **Consistency check:** at low load the toy engine's vehicle count should be close to the
  formula's; if not, the demo numbers are wrong, not interesting.

## 10. Demo script (5 minutes)

1. **Open** — "Step 3 said 7. Here's the stress test." Verdict already filled. (20 s)
2. **Read the three answers** — holds, +24% headroom, Staging lane is first to tighten. (30 s)
3. **What-if** — demo menu: *Throughput +40%*. Verdict flips to *needs 8*; **Accept 8**
   appears; point at the bottleneck chip turning red. (60 s)
4. **A node it can't serve** — open Reserve Racking: 5 levels → top beam 20 ft; Serves shows
   *CB18 ✗ reach 14.67 ft*. Drop to 4 levels → ✓. (45 s)
5. **Deep lane** — Staging depth 6 → 3: lane wait jumps; height 1 → 2: stacking-conflict
   chip appears. (45 s)
6. **Aisle guidance** — click the Staging→Shipping aisle, narrow it: amber B56.5 card. (30 s)
7. **Detail** — open heat map + vehicle timelines: "this is what goes in the appendix." (45 s)
8. **Close** — "Formula stays the quote; simulation can only raise it." (15 s)

## 11. Visual and copy rules

- Tokens mirror `app/globals.css` (light default, dark supported): `--bg-base`, `--bg-surface`,
  `--border`, `--text-primary|secondary|tertiary`, `--accent` = TAL red `#EB0A1E`,
  `--good|warn|bad` (+ `-soft`). Red only for the accent and genuine problems.
- Four-step type scale (`hero | figure | body | label`), tabular numerals for every figure.
- Status as the app's 7 px square swatch, never fill-tinted pills (2026-10-10 rule).
- No explanatory sub-prose on the working surface; explanations live in tooltips and the
  Assumptions tab (CLAUDE.md "structure, not prose").
- Copy names things the engineer recognizes: *Find fleet*, *Accept 8*, *Break point*,
  *First bottleneck* — never "DES", "replication", "event queue".
- Phone (≤ 700 px): verdict band + a station list with chips; map and inspector hidden behind
  "Open on desktop to edit".

## 12. Usability test plan

**Participants:** 2–3 apps engineers + 1–2 technical sales engineers. 20 min each.

**Tasks (no coaching):**
1. "A customer asks if 7 vehicles is enough. What do you tell them?"
2. "They expect 30% growth next year. Is the fleet still OK?"
3. "Mark Staging as a 4-deep lane stacked 2 high." (tests kind picker + conflict chip)
4. "Is there anything on this site you'd raise on the site walk?"
5. "What would you put in the proposal from this screen?"

**Ask afterwards:** Which of the three answers would you say out loud to a customer? What did
you look for that wasn't there? What would you remove? Would you run this on every project,
some, or none — which ones?

**Success criteria (go / change / stop):**
- **Go** — ≥ 3 of 4 participants answer tasks 1–2 from the verdict band alone, *and* name
  the break point or bottleneck as something they'd use with a customer.
- **Change** — answers found only after opening Detail, or the kind picker needs coaching.
- **Stop / defer** — participants say the formula + a Monte Carlo range would be enough.

## 13. Prototype acceptance criteria

1. Opens to a filled verdict on the Company A sample with no input.
2. All seven states in §8 reachable in ≤ 2 clicks from the demo menu or inspector.
3. Changing any kind setting updates the verdict within 2 s.
4. Accept appears only when simulated > formula; nothing ever shows a fleet below formula.
5. Pallets visible only in occupied positions and on loaded vehicles.
6. B56.5 card labels the clearance value as a placeholder and never changes the fleet verdict.
7. Every number tagged *Prototype — illustrative*; no `$` figure anywhere.
8. Renders legibly in light and dark; no horizontal scroll at 400 px.
9. Touches nothing in `src/`, `app/`, `docs/SPECIFICATION.md`; `npm run check:arch` unaffected.

## 14. What the prototype will not tell us

Engine accuracy, ANT fidelity, run time on large projects, or whether the formula
under-sizes real sites. Those need the 3–5 past-project check (separate task) and, if built,
the real engine's own spec.

## 15. Next steps

1. Owner reviews this spec and the four open defaults (§2).
2. Build the prototype (≈ 2–4 days) and publish as a private link.
3. Run the usability sessions (§12); record go / change / stop.
4. In parallel: Monte Carlo spec + the past-project calibration check.
5. On *go*: write the engine spec (`…-fleet-simulation-design.md`) using the findings.
