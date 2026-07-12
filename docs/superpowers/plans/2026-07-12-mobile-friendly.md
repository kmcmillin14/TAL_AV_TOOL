# Mobile-Friendly TAL Fleet Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every step usable on a phone (390px) and comfortable on a tablet (768px) — full review + light editing on mobile; heavy data entry stays desktop-optimized.

**Architecture:** CSS-first (extend the existing `@media` ladder in `app/globals.css`: 1200/1000/900/700/600 + new 480) with three structural JS changes where CSS can't save the layout: touch-visible row actions, a stacked card layout + button reorder for the flows table under 700px, and a collapsible drivers panel on the dashboard. No new dependencies; Toyota Type only; no calc/storage changes.

**Tech Stack:** Next.js 16 App Router, single `app/globals.css`, React 19. Verification is `npx tsc --noEmit` + `npx vitest run` + manual DevTools device-emulation checks (no component-test infra in this repo); each task lists the exact viewport checks.

**Current state (surveyed 2026-07-12):** viewport meta auto-injected by Next; 31 media queries exist; `veh-grid` 2-col @1000 / 1-col @600; `form-with-nav` 1-col @1000; `rom2-shell` 1-col @1000; workspace padding @700. Mobile-hostile: flows table (fixed 1316px + `zoom` fit → illegible shrink), HTML5 drag (no touch), `.flow-act-inner` hover-reveal (unreachable on touch), hero meta line density, FloatingPanel edge clipping.

---

### Task 1: Touch foundation — hover-reveal fallback + touch targets

**Files:**
- Modify: `app/globals.css` (`.flow-act-inner` block ~2216; `.tbtn-icon`, `.flow-act-btn` sizing)

- [ ] **Step 1:** Add the no-hover fallback directly under the existing hover rules:

```css
/* Touch devices have no hover — actions must always be visible there. */
@media (hover: none) {
  .flow-act-inner { opacity: 1; }
}
```

- [ ] **Step 2:** Enforce ≥40px touch targets on coarse pointers (icons are 24–30px today):

```css
@media (pointer: coarse) {
  .tbtn-icon, .flow-act-btn { min-width: 40px; min-height: 40px; }
  .header-menu-item { padding-top: 12px; padding-bottom: 12px; }
}
```

- [ ] **Step 3:** Verify in DevTools device emulation (iPhone 14, touch on): flow-row actions visible without hover; header icons comfortably tappable. Run `npx tsc --noEmit`.
- [ ] **Step 4:** Commit: `git add app/globals.css && git commit -m "fix(mobile): touch-visible row actions + 40px coarse-pointer targets"`

### Task 2: Hero bar ≤700px — two-deck header

**Files:**
- Modify: `app/globals.css` (extend the existing `@media (max-width: 700px)` block at ~323)

- [ ] **Step 1:** Inside that block, stack the grid and tighten the meta line (fields stay tappable/editable):

```css
  .hero-top { grid-template-columns: 1fr; min-height: 0; padding: 0 12px; }
  .hero-top > .hero-brand { padding: 10px 0 4px; }
  .hero-top > .hero-actions { padding: 0 0 8px; justify-self: start; flex-wrap: wrap; }
  .hero-meta-line { justify-content: flex-start; padding: 0 0 6px; }
  .hero-meta-item { padding: 4px 6px; }
  .hero-brand .logo { height: 24px; }
```

- [ ] **Step 2:** Step tabs become swipeable: in the same block,

```css
  .step-dots { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .step-dot { min-width: 128px; flex-shrink: 0; }
  .step-dot .desc { display: none; }
```

(Adjust selectors to the real step-dot rules at ~1460–1480 — the 760/480 rules there may already shrink labels; merge, don't duplicate.)

- [ ] **Step 3:** Verify at 390px: no horizontal page scroll (`document.documentElement.scrollWidth <= 390` in console), tabs swipe, meta fields editable. Commit `fix(mobile): stacked hero bar + swipeable step tabs under 700px`.

### Task 3: Step 0 / Step 1 polish ≤600px

**Files:**
- Modify: `app/globals.css` (step0 cards ~1386+; form paddings)

- [ ] **Step 1:** Step-0 entry cards go single column with reduced height; project-details panel fields stack:

```css
@media (max-width: 600px) {
  .step0-cards { grid-template-columns: 1fr; }        /* match the real class at ~1390 */
  .step0-card { min-height: 160px; }
  .form-section { padding: 16px 12px; }
  .form-grid { grid-template-columns: 1fr; }          /* any 2-col field grids in Step 1 */
}
```

(Grep the actual class names first — `grep -n "step0" app/globals.css` — and target those; the snippet shows intent, the selectors must match reality.)

- [ ] **Step 2:** Inputs ≥16px font at ≤600px so iOS Safari doesn't auto-zoom on focus:

```css
@media (max-width: 600px) {
  input, select, textarea { font-size: 16px; }
}
```

- [ ] **Step 3:** Verify at 390px: Step 0 cards stack, Step 1 sections readable, focusing an input doesn't zoom the page. Commit `fix(mobile): step 0/1 single-column + iOS no-zoom inputs`.

### Task 4: Flows table ≤700px — stacked flow cards (the big one)

**Files:**
- Create: `src/components/step3/FlowCard.tsx`
- Modify: `src/components/step3/FlowsTable.tsx` (render cards instead of `<table>` under the breakpoint)
- Modify: `app/globals.css` (`.flow-card*` styles)

Desktop/tablets (>700px) keep the existing table + zoom-fit. Under 700px each flow renders as a card; same data, same handlers.

- [ ] **Step 1:** Breakpoint hook (no new deps) at the top of `FlowsTable.tsx`:

```tsx
function useIsNarrow(px = 700): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [px])
  return narrow
}
```

- [ ] **Step 2:** `FlowCard.tsx` — one card per flow, reusing the existing selects/inputs and derived outputs. Layout: header row (index + route inputs), body grid of labeled fields, output strip, action row. Props identical to `FlowRow` minus drag, plus `onMoveUp/onMoveDown`:

```tsx
'use client'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import VehicleSelect, { VehicleDot } from './VehicleSelect'
import MethodSelect from './MethodSelect'
import SpeedsUsedSelect from './SpeedsUsedSelect'

interface Props {
  index: number
  flow: Flow
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export default function FlowCard({ index, flow, vehicles, derived, unitSystem, onChange, onDelete, onDuplicate, onMoveUp, onMoveDown }: Props) {
  const v = flow.vehicleId ? vehicles.find(x => x.id === flow.vehicleId) : undefined
  const field = (label: string, node: React.ReactNode) => (
    <label className="fc-field"><span className="fc-label">{label}</span>{node}</label>
  )
  return (
    <div className="flow-card">
      <div className="fc-head">
        <span className="fc-index mono">{String(index + 1).padStart(2, '0')}</span>
        <input className="fc-route" value={flow.origin} placeholder="Origin"
          onChange={e => onChange({ ...flow, origin: e.target.value })} />
        <span className="fc-arrow">→</span>
        <input className="fc-route" value={flow.destination} placeholder="Destination"
          onChange={e => onChange({ ...flow, destination: e.target.value })} />
      </div>
      <div className="fc-grid">
        {field('Vehicle', <span className="fc-veh"><VehicleDot vehicle={v} /><VehicleSelect vehicles={vehicles} value={flow.vehicleId}
          onChange={vid => onChange({ ...flow, vehicleId: vid, transferMethodIdx: vid ? 0 : undefined })} /></span>)}
        {field('Transfer', <MethodSelect vehicle={v} methodIdx={flow.transferMethodIdx ?? 0}
          liftHeightFt={flow.liftHeightFt} liftTimeSec={derived.breakdown?.liftTimeSec ?? 0}
          transferSecOverride={flow.transferSecOverride} unitSystem={unitSystem}
          onMethodChange={i => onChange({ ...flow, transferMethodIdx: i, transferSecOverride: undefined })}
          onLiftChange={ft => onChange({ ...flow, liftHeightFt: ft })}
          onOverrideChange={sec => onChange({ ...flow, transferSecOverride: sec })} />)}
        {field('Layout', <SpeedsUsedSelect value={flow.routeLayout} vehicle={v} unitSystem={unitSystem}
          onChange={l => onChange({ ...flow, routeLayout: l })} />)}
        {field('Distance RT', <input className="flow-cell mono" type="number" min="0" inputMode="decimal"
          value={flow.distanceFt * 2} onChange={e => onChange({ ...flow, distanceFt: Math.max(0, Number(e.target.value) || 0) / 2 })} />)}
        {field('Moves/hr', <input className="flow-cell mono" type="number" min="0" inputMode="decimal"
          value={flow.thruPerHr} onChange={e => onChange({ ...flow, thruPerHr: Math.max(0, Number(e.target.value) || 0) })} />)}
      </div>
      <div className="fc-out mono">
        <span>Cycle <strong>{derived.cycleSeconds == null ? '—' : `${Math.round(derived.cycleSeconds)}s`}</strong></span>
        <span>Demand <strong>{derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)}</strong></span>
      </div>
      <div className="fc-actions">
        {onMoveUp && <button type="button" className="flow-act-btn" onClick={onMoveUp} aria-label="Move up"><Icon name="arrowL" size={14} /></button>}
        {onMoveDown && <button type="button" className="flow-act-btn" onClick={onMoveDown} aria-label="Move down"><Icon name="arrowR" size={14} /></button>}
        <button type="button" className="flow-act-btn" onClick={onDuplicate} aria-label="Duplicate"><Icon name="copy" size={14} /></button>
        <button type="button" className="flow-act-btn flow-delete" onClick={onDelete} aria-label="Delete"><Icon name="x" size={14} /></button>
      </div>
    </div>
  )
}
```

(Metric distance display: reuse `units.distance` exactly as `FlowRow.tsx:75-84` does — copy that block, don't re-derive. Rotate the arrow icons vertically via CSS `transform: rotate(90deg)` on `.fc-actions .flow-act-btn svg`, or add proper up/down chevrons to `Icon.tsx` if preferred.)

- [ ] **Step 3:** In `FlowsTable.tsx`: `const narrow = useIsNarrow()`. When `narrow`, render group headers as simple card-section titles and `FlowCard`s (move up/down = swap within the `flows` array via the existing `onPatch`), plus the bottom `+ Add flow` button; skip the `<table>`, zoom-fit, and drag wiring entirely. Move-up/down handler:

```tsx
const move = (id: string, dir: -1 | 1) => {
  const i = flows.findIndex(f => f.id === id)
  const j = i + dir
  if (i === -1 || j < 0 || j >= flows.length) return
  const next = [...flows]
  ;[next[i], next[j]] = [next[j], next[i]]
  onPatch({ flows: next })
}
```

- [ ] **Step 4:** CSS:

```css
.flow-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; background: var(--bg-surface); }
.fc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.fc-index { color: var(--text-tertiary); font-size: 11px; }
.fc-route { flex: 1; min-width: 0; }
.fc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.fc-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fc-label { font-family: var(--tal-font-numeric); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); }
.fc-veh { display: flex; align-items: center; gap: 6px; }
.fc-out { display: flex; gap: 18px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); }
.fc-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
```

- [ ] **Step 5:** Verify at 390px: cards render, all fields edit and recompute, reorder works, group flows land in the right group. At 900px: table unchanged. `npx tsc --noEmit && npx vitest run`. Commit `feat(mobile): stacked flow cards + button reorder under 700px`.

### Task 5: ROM Dashboard ≤700px

**Files:**
- Modify: `app/globals.css` (rom2 blocks at ~3230/3358+); `app/projects/[id]/step4/page.tsx` (drivers `<details>` wrapper)

- [ ] **Step 1:** Wrap `RomDrivers` in a native `<details className="rom-drivers-collapse">` with `<summary>Drivers</summary>` (open by default ≥700px via CSS `display: contents` trick: at >700px style `summary { display: none }` and force the panel visible with `details[open]` default — set `open` attribute unconditionally and hide the summary on desktop; on mobile the summary toggles it).
- [ ] **Step 2:** CSS ≤700px: KPI/gauge grids to 1–2 columns; operation map horizontally scrollable (`overflow-x: auto` on its wrapper); `eh-actions` (Export buttons) wrap under the title: `.engine-head.with-actions { flex-wrap: wrap; } .eh-actions { margin-left: 0; }`.
- [ ] **Step 3:** Verify at 390px: drivers collapse/expand, KPIs stack, buttons wrap without overflowing, no horizontal page scroll. Commit `fix(mobile): dashboard collapsible drivers + stacked KPI grids`.

### Task 6: Popovers, panels, and Step-2 modal

**Files:**
- Modify: `src/components/step3/FloatingPanel.tsx`; `app/globals.css` (cmp-overlay ~1238, cycle-popover)

- [ ] **Step 1:** FloatingPanel: clamp within the viewport — after computing position, `left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8))` (read the component first; it already anchors — add the clamp where it sets style).
- [ ] **Step 2:** `.cycle-popover { max-width: calc(100vw - 24px); }` and comparison modal full-screen ≤700px (`.cmp-overlay { padding: 0 } .cmp-modal { border-radius: 0; height: 100%; }` — match real class names).
- [ ] **Step 3:** Verify: transfer-time panel and cycle popover fully on-screen on iPhone emulation; Step-2 compare usable. Commit `fix(mobile): viewport-clamped panels + full-screen compare modal`.

### Task 7: QA sweep + docs

- [ ] **Step 1:** Device matrix pass (DevTools emulation): iPhone SE 375, iPhone 14 390, Pixel 7 412, iPad 768 — every step 0–4: no horizontal scroll, all actions reachable, exports download. Note: iOS Safari blob downloads open in a viewer instead of saving — verify PPTX/PDF still retrievable; if not, document as known limitation.
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run && npm run check:arch` all green.
- [ ] **Step 3:** Docs per house rules: `docs/SPECIFICATION.md` gains a short "Responsive behavior" subsection (breakpoints + per-step mobile behavior); `docs/CHANGELOG.md` entry. Commit + push (full pre-push checklist; globals.css changed → clean dev restart + served-chunk verification).

---

## Self-review notes

- Coverage: hover/touch (T1), header/nav (T2), forms (T3), flows table incl. reorder (T4), dashboard incl. export buttons (T5), overlays (T6), QA+docs (T7). Charging/Buffer pipeline tables reuse the same `.waterfall-table` patterns — they're readable at 390px once workspace padding shrinks (T2/T3); revisit in T7 if the matrix pass disagrees.
- Deliberate scope cuts (YAGNI): no PWA/offline, no touch drag-and-drop library (buttons suffice), no per-device font scaling, no landscape-specific work.
- Selector names in Tasks 2/3/5/6 must be confirmed against `globals.css` before editing — the plan flags each spot with "match the real class"; treat those greps as part of the step.
