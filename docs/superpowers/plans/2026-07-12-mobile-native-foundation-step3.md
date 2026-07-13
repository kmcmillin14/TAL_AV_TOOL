# Mobile-Native Foundation + Step 3 Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared mobile primitives (`BottomSheet`, `SheetSelect`, `MobileHeader`) and apply them to the Fleet Engine flows as a list→sheet experience that replaces the stacked cards ≤ 700px.

**Architecture:** New shared UI location `src/components/mobile/` (peer to `PersistentHeader.tsx`). Step 3's `FlowsTable` narrow branch (already gated by `useIsNarrow(700)`) renders a summary list (`FlowListMobile`); tapping a row opens a full-screen editor (`FlowSheet`) whose selects are bottom-sheet pickers. No calc/schema/storage/desktop change — the sheet reads/writes the same `Flow` via the existing `onPatch`, with `derivedByFlowId` driving live outputs.

**Tech Stack:** Next.js 16 App Router, React 19, `react-dom` `createPortal` (already used in `RomBento.tsx`), single `app/globals.css`, Toyota Type only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-12-mobile-native-foundation-step3-design.md`

**Testing note:** this repo has **no component-render test harness** (vitest runs pure/node tests only; no `@testing-library`, and the spec forbids new deps). Per the spec, these UI primitives are verified by `npx tsc --noEmit`, the existing suite staying green, and DevTools device emulation in the running app. Each task's gate reflects that; do not fabricate vitest render tests.

**Bindings (every task):** `src/calc/*` untouched · imperial-first · Toyota Type via `--tal-font-*` only (never a literal font-family) · module boundaries (§4) · docs-first · full pre-push checklist incl. clean dev restart + served-chunk verification when CSS changes.

**`Flow` shape (reference):** `{ id, origin, destination, distanceFt (one-way ft), thruPerHr, routeLayout, liftHeightFt, vehicleId?, transferMethodIdx?, transferSecOverride?, sectionName? }`.

---

### Task 1: Docs first

**Files:**
- Modify: `ARCHITECTURE.md` (§4 module boundaries + §5 folder map)
- Modify: `docs/SPECIFICATION.md` (Responsive subsection — Step 3 mobile)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1:** In `ARCHITECTURE.md` §4 module-boundaries table, add a row after the `src/components/*` row:

```
| `src/components/mobile/*` | React, calc, lib, design-system | direct `fs`/`localStorage` (go through `storage.ts`) |
```

And append to the "Steps are independent and modular" bullet: "Shared mobile primitives live in `src/components/mobile/` (peer to `PersistentHeader.tsx`) and may be imported by any step's page/subcomponents."

- [ ] **Step 2:** In `ARCHITECTURE.md` §5 folder map, under `src/components/`, add: `│   │   ├── mobile/                # shared phone-native primitives (BottomSheet, SheetSelect, MobileHeader)`.

- [ ] **Step 3:** In `docs/SPECIFICATION.md`, in the "Responsive behavior" subsection, replace the "Fleet Engine flows ≤ 700px" bullet with:

```
- **Fleet Engine flows ≤ 700px — phone-native list → sheet.** The table gives
  way to a scannable summary list (`FlowListMobile`): read-only group headers
  (name · count · Σ demand · add-into-group), flow rows (index · route · vehicle
  · moves/hr · live demand · chevron), and a sticky raw-demand footer. Tapping a
  row (or "+ Flow") opens a full-screen editor (`FlowSheet`) with Cycle/Demand
  pinned live at the top and fields grouped Route / Vehicle & transfer; every
  select (vehicle, transfer, avg. speed) opens a bottom-sheet picker
  (`BottomSheet`/`SheetSelect` in `src/components/mobile/`). Delete is in the
  sheet header. Reorder, duplicate, and group rename/color/delete stay
  desktop-only. Autosave is live, so the sheet just closes on Done.
```

- [ ] **Step 4:** Add `docs/CHANGELOG.md` entry at top:

```markdown
## 2026-07-12 — Mobile-native foundation + Step 3 flows list/sheet

- New shared mobile primitives in `src/components/mobile/`: `BottomSheet`
  (portal slide-up overlay), `SheetSelect` (bottom-sheet option picker),
  `MobileHeader`. First reuse target for every step's phone UI.
- Fleet Engine flows ≤ 700px become a summary list → full-screen edit sheet
  (`FlowListMobile` / `FlowSheet`) with live Cycle/Demand at the top and
  bottom-sheet pickers — replacing the stacked `FlowCard` (deleted). Desktop
  table unchanged; no calc/schema change. First of a per-step mobile rollout
  (spec: docs/superpowers/specs/2026-07-12-mobile-native-foundation-step3-design.md).
```

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: mobile-native foundation + Step 3 list/sheet (architecture, spec, changelog)"
```

(Pre-commit hook runs `check:arch` and requires a CHANGELOG entry for ARCHITECTURE.md changes — Step 4 satisfies it.)

---

### Task 2: `BottomSheet` primitive

**Files:**
- Create: `src/components/mobile/BottomSheet.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Implement `src/components/mobile/BottomSheet.tsx`:**

```tsx
'use client'

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Shared slide-up overlay for phone-native pickers/editors. Rendered through a
 * portal to <body> so it escapes any `overflow:hidden` ancestor; closes on
 * scrim tap or Escape. The slide animation is CSS and respects
 * prefers-reduced-motion. Used by SheetSelect and the Step-3 pickers.
 */
export default function BottomSheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Lock body scroll while the sheet is up.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="m-sheet-scrim" onClick={onClose} role="presentation">
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="m-sheet-grip" aria-hidden />
        {title && <div className="m-sheet-title">{title}</div>}
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Add CSS to `app/globals.css`** (near the other overlay styles):

```css
/* ===== Shared mobile primitives (src/components/mobile) ===== */
.m-sheet-scrim {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; justify-content: center;
}
.m-sheet {
  width: 100%; max-width: 520px; max-height: 85vh; overflow-y: auto;
  background: var(--bg-surface); border-radius: 18px 18px 0 0;
  border: 1px solid var(--border); border-bottom: none;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.3);
  animation: m-sheet-up 0.22s ease;
}
@keyframes m-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .m-sheet { animation: none; } }
.m-sheet-grip { width: 36px; height: 4px; border-radius: 2px; background: var(--border-strong); margin: 10px auto 4px; }
.m-sheet-title { padding: 6px 18px 10px; font-weight: 700; font-size: 14px; color: var(--text-primary); border-bottom: 1px solid var(--border); }
.m-sheet-body { padding: 6px 0 max(12px, env(safe-area-inset-bottom)); }
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean. Temporarily mount `<BottomSheet open title="X"><div>hi</div></BottomSheet>` in the Step-3 page (or trust the tsc gate + Task 3 which exercises it) — then remove the temp mount. Commit:

```bash
git add src/components/mobile/BottomSheet.tsx app/globals.css
git commit -m "feat(mobile): BottomSheet portal overlay primitive"
```

---

### Task 3: `SheetSelect` picker

**Files:**
- Create: `src/components/mobile/SheetSelect.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Implement `src/components/mobile/SheetSelect.tsx`:**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import BottomSheet from './BottomSheet'

export interface SheetOption {
  id: string
  label: string
  dot?: string          // optional color dot (vehicle chips)
  sub?: string          // optional secondary line
}

interface Props {
  label: string
  value: string | undefined
  options: SheetOption[]
  placeholder?: string
  sheetTitle?: string
  onChange: (id: string) => void
  /** Optional custom trigger content (defaults to the selected option's label). */
  renderValue?: (opt: SheetOption | undefined) => ReactNode
}

/**
 * A labeled field whose value opens a BottomSheet list of options — the
 * phone-native replacement for a desktop dropdown. Generic; used for the
 * vehicle and avg-speed pickers in the flow sheet.
 */
export default function SheetSelect({ label, value, options, placeholder = 'Select', sheetTitle, onChange, renderValue }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.id === value)
  return (
    <div className="m-field">
      <label className="m-field-label">{label}</label>
      <button type="button" className="m-input m-pick" onClick={() => setOpen(true)}>
        <span className="m-pick-val">
          {renderValue ? renderValue(selected)
            : selected ? (<>{selected.dot && <span className="m-dot" style={{ background: selected.dot }} />}{selected.label}</>)
            : <span className="m-pick-ph">{placeholder}</span>}
        </span>
        <span className="m-pick-chev" aria-hidden>⌄</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={sheetTitle ?? label}>
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            className={`m-sheet-opt${o.id === value ? ' is-sel' : ''}`}
            onClick={() => { onChange(o.id); setOpen(false) }}
          >
            {o.dot && <span className="m-dot" style={{ background: o.dot }} />}
            <span className="m-sheet-opt-main">
              {o.label}
              {o.sub && <span className="m-sheet-opt-sub">{o.sub}</span>}
            </span>
            {o.id === value && <span className="m-sheet-opt-check" aria-hidden>✓</span>}
          </button>
        ))}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS** to `app/globals.css`:

```css
.m-field { display: flex; flex-direction: column; gap: 5px; }
.m-field-label { font-size: 11px; color: var(--text-secondary); }
.m-input {
  width: 100%; box-sizing: border-box; border: 1.5px solid var(--border);
  border-radius: 9px; padding: 12px; font-size: 16px; background: var(--bg-input);
  color: var(--text-primary); font-family: var(--tal-font-family);
}
.m-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.m-pick { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; }
.m-pick-val { display: inline-flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-pick-ph { color: var(--text-tertiary); }
.m-pick-chev { color: var(--text-tertiary); flex-shrink: 0; }
.m-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.m-sheet-opt {
  width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
  padding: 14px 18px; background: none; border: none; border-bottom: 1px solid var(--border);
  font-size: 15px; color: var(--text-primary); cursor: pointer; font-family: var(--tal-font-family);
}
.m-sheet-opt.is-sel { font-weight: 700; }
.m-sheet-opt-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.m-sheet-opt-sub { font-size: 11px; color: var(--text-tertiary); }
.m-sheet-opt-check { color: var(--accent); }
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` clean. Commit:

```bash
git add src/components/mobile/SheetSelect.tsx app/globals.css
git commit -m "feat(mobile): SheetSelect bottom-sheet option picker"
```

---

### Task 4: `MobileHeader` primitive

**Files:**
- Create: `src/components/mobile/MobileHeader.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Implement `src/components/mobile/MobileHeader.tsx`:**

```tsx
'use client'

import type { ReactNode } from 'react'

interface Props {
  title: string
  action?: ReactNode        // optional primary action (e.g. a "+ Flow" button)
  count?: string            // optional muted count/subtitle on the right of the title row
}

/** Compact phone page header shared by every step's mobile view: title left,
 *  one primary action right. Kept deliberately minimal. */
export default function MobileHeader({ title, action, count }: Props) {
  return (
    <div className="m-head">
      <div className="m-head-titles">
        <span className="m-head-title">{title}</span>
        {count && <span className="m-head-count mono">{count}</span>}
      </div>
      {action && <div className="m-head-action">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS:**

```css
.m-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 2px 12px; }
.m-head-titles { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.m-head-title { font-weight: 800; font-size: 16px; color: var(--text-primary); }
.m-head-count { font-size: 12px; color: var(--text-tertiary); }
.m-head-action { flex-shrink: 0; }
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` clean. Commit:

```bash
git add src/components/mobile/MobileHeader.tsx app/globals.css
git commit -m "feat(mobile): MobileHeader compact page header"
```

---

### Task 5: `FlowSheet` editor

**Files:**
- Create: `src/components/step3/FlowSheet.tsx`
- Modify: `app/globals.css`

Reuses: `SheetSelect`, `BottomSheet` (mobile), `VehicleDot` (`VehicleSelect`), `DerivTrigger`, `cycleDerivation` (`src/lib/derivation`), `ROUTE_LAYOUT_FACTORS` (`src/calc/types`), `units` (`src/lib/utils/units`), `vehicleColor` helper if present (else use the dot from `VehicleSelect` conventions).

- [ ] **Step 1: Implement `src/components/step3/FlowSheet.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import type { Flow, FlowDerived, RouteLayout } from '@/src/calc/types'
import { ROUTE_LAYOUT_FACTORS } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import { createPortal } from 'react-dom'
import Icon from '@/src/design-system/components/Icon'
import SheetSelect, { type SheetOption } from '@/src/components/mobile/SheetSelect'
import BottomSheet from '@/src/components/mobile/BottomSheet'
import DerivTrigger from './DerivTrigger'
import { VehicleDot } from './VehicleSelect'
import { vehicleColor } from './vehicleColor'
import { cycleDerivation } from '@/src/lib/derivation'

interface Props {
  flow: Flow
  index: number
  vehicles: Vehicle[]
  derived: FlowDerived
  unitSystem: UnitSystem
  onChange: (next: Flow) => void
  onDelete: () => void
  onClose: () => void
}

function clampNum(input: string, min = 0): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return min
  return Math.max(min, n)
}

const LAYOUT_LABEL: Record<RouteLayout, string> = { low: 'Low — congested', medium: 'Medium — mixed', high: 'High — open' }

/**
 * Full-screen phone editor for one flow. Live Cycle/Demand pinned at the top;
 * fields grouped Route / Vehicle & transfer; vehicle + avg-speed are
 * SheetSelect pickers, transfer is a bespoke BottomSheet (method + transfer
 * time + lift height). Reads/writes the same Flow via onChange (autosave live).
 */
export default function FlowSheet({ flow, index, vehicles, derived, unitSystem, onChange, onDelete, onClose }: Props) {
  const metric = unitSystem === 'metric'
  const v = flow.vehicleId ? vehicles.find(x => x.id === flow.vehicleId) : undefined
  const methodIdx = flow.transferMethodIdx ?? 0
  const [transferOpen, setTransferOpen] = useState(false)

  const roundTripFt = flow.distanceFt * 2
  const distDisplay = metric ? units.distance.toMetric(roundTripFt).toFixed(0) : roundTripFt.toString()
  const setDistance = (input: string) => {
    const n = clampNum(input)
    const oneWay = (metric ? units.distance.toImperial(n) : n) / 2
    onChange({ ...flow, distanceFt: oneWay })
  }

  const vehOptions: SheetOption[] = vehicles.map(vv => ({ id: vv.id, label: vv.name, dot: vehicleColor(vv.id), sub: vv.display.category }))
  const layoutOptions: SheetOption[] = (['high', 'medium', 'low'] as RouteLayout[]).map(l => ({
    id: l, label: LAYOUT_LABEL[l], sub: `${Math.round(ROUTE_LAYOUT_FACTORS[l] * 100)}% of rated cruise`,
  }))

  const active = v?.transferMethods?.[methodIdx] ?? v?.transferMethods?.[0]
  const isCustom = active?.method === 'Custom'
  const isLifting = active?.lifts === true
  const overridden = flow.transferSecOverride != null && flow.transferSecOverride > 0
  const defaultSec = isCustom ? 0 : ((active?.loadTimeSec ?? 0) + (active?.unloadTimeSec ?? 0))
  const transferSec = overridden ? flow.transferSecOverride! : defaultSec
  const liftTimeSec = derived.breakdown?.liftTimeSec ?? 0
  const transferSummary = active ? `${active.method} · ${Math.round(transferSec + (isLifting ? liftTimeSec : 0))}s${overridden ? '*' : ''}` : '—'

  const cycleTxt = derived.cycleSeconds == null ? '—' : `${Math.round(derived.cycleSeconds)}s`
  const demandTxt = derived.rawVehicles == null ? '—' : derived.rawVehicles.toFixed(2)

  const heightValue = metric ? Number(units.distance.toMetric(flow.liftHeightFt).toFixed(1)) : flow.liftHeightFt
  const onHeight = (input: string) => {
    const n = clampNum(input)
    onChange({ ...flow, liftHeightFt: metric ? units.distance.toImperial(n) : n })
  }
  const onOverride = (input: string) => {
    if (input.trim() === '') return onChange({ ...flow, transferSecOverride: undefined })
    onChange({ ...flow, transferSecOverride: clampNum(input) })
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="m-fullsheet" role="dialog" aria-modal="true" aria-label={`Flow ${index + 1}`}>
      <div className="m-fs-head">
        <button type="button" className="m-fs-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <span className="m-fs-title">Flow {String(index + 1).padStart(2, '0')}</span>
        <button type="button" className="m-fs-del" onClick={() => { onDelete(); onClose() }}>Delete</button>
      </div>

      <div className="m-outbar">
        <div className="m-outcell"><b>{cycleTxt}</b><span>Cycle</span></div>
        <div className="m-outcell m-out-accent">
          <b>{demandTxt}</b>
          <span>Demand (veh)</span>
          {derived.breakdown && v && (
            <DerivTrigger
              className="m-outcell-math"
              derivation={() => cycleDerivation(derived.breakdown!, {
                distanceFt: flow.distanceFt, thruPerHr: flow.thruPerHr,
                speedLoadedFps: v.calc.speedLoadedFps,
                speedUnloadedFps: v.calc.speedUnloadedFps ?? v.calc.speedLoadedFps,
                liftSpeedFps: v.calc.liftSpeedFps ?? null,
                rawVehicles: derived.rawVehicles,
              })}
              route={flow.origin || flow.destination ? `${flow.origin || '—'} → ${flow.destination || '—'}` : undefined}
              label="Show the fleet math for this flow"
            />
          )}
        </div>
      </div>

      <div className="m-fs-body">
        <div className="m-group">Route</div>
        <div className="m-two">
          <div className="m-field"><label className="m-field-label">Origin</label>
            <input className="m-input" value={flow.origin} placeholder="e.g. Dock A" onChange={e => onChange({ ...flow, origin: e.target.value })} /></div>
          <div className="m-field"><label className="m-field-label">Destination</label>
            <input className="m-input" value={flow.destination} placeholder="e.g. Storage 1" onChange={e => onChange({ ...flow, destination: e.target.value })} /></div>
        </div>
        <div className="m-two">
          <div className="m-field"><label className="m-field-label">{metric ? 'Distance RT (m)' : 'Distance RT (ft)'}</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" value={distDisplay} onChange={e => setDistance(e.target.value)} /></div>
          <div className="m-field"><label className="m-field-label">Moves / hr</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" value={flow.thruPerHr} onChange={e => onChange({ ...flow, thruPerHr: clampNum(e.target.value) })} /></div>
        </div>

        <div className="m-group">Vehicle &amp; transfer</div>
        <SheetSelect label="Vehicle" sheetTitle="Choose a vehicle" placeholder="Select a vehicle"
          value={flow.vehicleId} options={vehOptions}
          onChange={id => onChange({ ...flow, vehicleId: id, transferMethodIdx: 0, transferSecOverride: undefined })}
          renderValue={o => o ? (<><span className="m-dot" style={{ background: o.dot }} />{o.label}</>) : undefined}
        />
        <div className="m-field">
          <label className="m-field-label">Transfer</label>
          <button type="button" className="m-input m-pick" onClick={() => v && setTransferOpen(true)} disabled={!v}>
            <span className="m-pick-val">{transferSummary}</span>
            <span className="m-pick-chev" aria-hidden>⌄</span>
          </button>
        </div>
        <SheetSelect label="Avg. Speed" sheetTitle="Route average speed"
          value={flow.routeLayout} options={layoutOptions}
          onChange={id => onChange({ ...flow, routeLayout: id as RouteLayout })}
        />
      </div>

      <div className="m-fs-foot">
        <button type="button" className="btn primary m-fs-done" onClick={onClose}>Done</button>
      </div>

      {/* Transfer bottom sheet: method list + transfer-time override + lift height. */}
      <BottomSheet open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer">
        {(v?.transferMethods ?? []).map((m, i) => (
          <button key={`${m.method}-${i}`} type="button" className={`m-sheet-opt${i === methodIdx ? ' is-sel' : ''}`}
            onClick={() => onChange({ ...flow, transferMethodIdx: i, transferSecOverride: undefined })}>
            <span className="m-sheet-opt-main">{m.method}
              <span className="m-sheet-opt-sub">{m.method === 'Custom' ? 'engineer-defined — enter a time' : `default ${(m.loadTimeSec ?? 0) + (m.unloadTimeSec ?? 0)}s`}</span></span>
            {i === methodIdx && <span className="m-sheet-opt-check" aria-hidden>✓</span>}
          </button>
        ))}
        <div className="m-sheet-fields">
          <div className="m-field"><label className="m-field-label">Transfer time (s){overridden ? ' · override' : ''}</label>
            <input className="m-input mono" type="number" min="0" inputMode="decimal" placeholder={String(defaultSec)}
              value={flow.transferSecOverride ?? ''} onChange={e => onOverride(e.target.value)} /></div>
          {isLifting && (
            <div className="m-field"><label className="m-field-label">Lift height ({metric ? 'm' : 'ft'})</label>
              <input className="m-input mono" type="number" min="0" inputMode="decimal" value={heightValue} onChange={e => onHeight(e.target.value)} /></div>
          )}
        </div>
      </BottomSheet>
    </div>,
    document.body,
  )
}
```

  Note: `DerivTrigger` renders its own formula-icon button (styled by its
  `className` prop) and does not take children — so the Demand cell shows the
  value as plain text and `DerivTrigger` sits beside it as a small math button
  (positioned top-right of the cell via `.m-outcell-math` CSS below). No change
  to `DerivTrigger` itself; its desktop callers are unaffected.

- [ ] **Step 2: Add CSS:**

```css
.m-fullsheet {
  position: fixed; inset: 0; z-index: 260; background: var(--bg-surface);
  display: flex; flex-direction: column;
}
.m-fs-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.m-fs-x { background: none; border: none; color: var(--text-secondary); cursor: pointer; }
.m-fs-title { font-weight: 800; font-size: 15px; color: var(--text-primary); }
.m-fs-del { background: none; border: none; color: var(--bad); font-size: 13px; font-weight: 600; cursor: pointer; }
.m-outbar { display: flex; background: var(--bg-surface-2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.m-outcell { position: relative; flex: 1; padding: 12px 16px; }
.m-outcell + .m-outcell { border-left: 1px solid var(--border); }
.m-outcell b { font-size: 22px; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.m-out-accent b { color: var(--accent); }
.m-outcell span { display: block; font-size: 9.5px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-tertiary); }
.m-outcell-math { position: absolute; top: 8px; right: 10px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; }
.m-fs-body { flex: 1; overflow-y: auto; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
.m-group { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-tertiary); margin-top: 8px; }
.m-two { display: flex; gap: 10px; }
.m-two .m-field { flex: 1; min-width: 0; }
.m-fs-foot { padding: 10px 16px max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border); flex-shrink: 0; }
.m-fs-done { width: 100%; padding: 14px; }
.m-sheet-fields { padding: 12px 18px 4px; display: flex; flex-direction: column; gap: 12px; }
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` clean; `npx vitest run` still green (no calc touched). Commit:

```bash
git add src/components/step3/FlowSheet.tsx app/globals.css
git commit -m "feat(mobile): full-screen flow edit sheet with live outputs + bottom-sheet pickers"
```

---

### Task 6: `FlowListMobile` summary list

**Files:**
- Create: `src/components/step3/FlowListMobile.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Implement `src/components/step3/FlowListMobile.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import type { Flow, FlowDerived } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import { effectiveGroups as computeEffectiveGroups } from '@/src/calc/flowMetrics'
import { sectionColor } from './sectionColor'
import { vehicleColor } from './vehicleColor'
import FlowSheet from './FlowSheet'

interface Props {
  flows: Flow[]
  flowGroups: string[]
  flowGroupColors: Record<string, string>
  vehicles: Vehicle[]
  derivedByFlowId: Map<string, FlowDerived>
  unitSystem: UnitSystem
  onUpdate: (id: string, next: Flow) => void
  onDelete: (id: string) => void
  onAdd: (sectionName?: string) => Flow      // returns the created flow so we can open its sheet
}

const EMPTY: FlowDerived = { cycleSeconds: null, rawVehicles: null, breakdown: null }

/** Phone-native flows: a scannable summary list; tapping a row opens FlowSheet. */
export default function FlowListMobile({ flows, flowGroups, flowGroupColors, vehicles, derivedByFlowId, unitSystem, onUpdate, onDelete, onAdd }: Props) {
  const [editId, setEditId] = useState<string | null>(null)
  const effGroups = computeEffectiveGroups(flowGroups, flows)
  const ungrouped = flows.filter(f => !f.sectionName || !effGroups.includes(f.sectionName))
  const vName = (id?: string) => (id ? vehicles.find(v => v.id === id)?.name ?? id : 'No vehicle')
  const totalDemand = flows.reduce((s, f) => s + (derivedByFlowId.get(f.id)?.rawVehicles ?? 0), 0)

  // Sequential index across every rendered flow (groups first, then ungrouped).
  const order: string[] = [...effGroups.flatMap(g => flows.filter(f => f.sectionName === g).map(f => f.id)), ...ungrouped.map(f => f.id)]
  const indexOf = (id: string) => order.indexOf(id)

  const editing = editId ? flows.find(f => f.id === editId) : undefined

  const row = (f: Flow) => {
    const d = derivedByFlowId.get(f.id) ?? EMPTY
    return (
      <button key={f.id} type="button" className="m-row" onClick={() => setEditId(f.id)}>
        <span className="m-row-idx mono">{String(indexOf(f.id) + 1).padStart(2, '0')}</span>
        <span className="m-row-main">
          <span className="m-row-route">{f.origin || '—'} → {f.destination || '—'}</span>
          <span className="m-row-sub">
            <span className="m-dot" style={{ background: vehicleColor(f.vehicleId ?? '') }} />
            {vName(f.vehicleId)} · {f.thruPerHr}/hr
          </span>
        </span>
        <span className="m-row-dem"><b>{d.rawVehicles == null ? '—' : d.rawVehicles.toFixed(2)}</b><span>veh</span></span>
        <span className="m-row-chev" aria-hidden>›</span>
      </button>
    )
  }

  return (
    <div className="m-flowlist">
      {effGroups.map(g => {
        const gf = flows.filter(f => f.sectionName === g)
        const gd = gf.reduce((s, f) => s + (derivedByFlowId.get(f.id)?.rawVehicles ?? 0), 0)
        return (
          <div key={`g-${g}`} className="m-listgroup">
            <div className="m-listgroup-head">
              <span className="m-dot" style={{ background: flowGroupColors[g] ?? sectionColor(g) }} />
              <span className="m-listgroup-name">{g}</span>
              <span className="m-listgroup-meta mono">{gf.length} · {gd.toFixed(2)} veh</span>
              <button type="button" className="btn ghost m-listgroup-add" onClick={() => setEditId(onAdd(g).id)}>
                <Icon name="plus" size={12} /> Flow
              </button>
            </div>
            {gf.map(row)}
          </div>
        )
      })}
      {ungrouped.map(row)}

      <button type="button" className="flows-add-bottom" onClick={() => setEditId(onAdd().id)}>
        <Icon name="plus" size={12} /> Add flow
      </button>

      <div className="m-listfoot">
        <span>Raw demand</span>
        <b>{Math.ceil(totalDemand)} vehicle{Math.ceil(totalDemand) === 1 ? '' : 's'}</b>
      </div>

      {editing && (
        <FlowSheet
          flow={editing}
          index={indexOf(editing.id)}
          vehicles={vehicles}
          derived={derivedByFlowId.get(editing.id) ?? EMPTY}
          unitSystem={unitSystem}
          onChange={next => onUpdate(editing.id, next)}
          onDelete={() => onDelete(editing.id)}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS:**

```css
.m-flowlist { display: flex; flex-direction: column; }
.m-listgroup { margin-bottom: 4px; }
.m-listgroup-head { display: flex; align-items: center; gap: 8px; padding: 12px 2px 8px; border-bottom: 1px solid var(--border); }
.m-listgroup-name { font-weight: 700; font-size: 13px; color: var(--text-primary); }
.m-listgroup-meta { font-size: 11px; color: var(--text-tertiary); }
.m-listgroup-add { margin-left: auto; }
.m-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); padding: 12px 4px; cursor: pointer; font-family: var(--tal-font-family); }
.m-row:active { background: var(--bg-hover); }
.m-row-idx { font-size: 11px; color: var(--text-tertiary); width: 18px; flex-shrink: 0; }
.m-row-main { flex: 1; min-width: 0; }
.m-row-route { display: block; font-weight: 700; font-size: 13.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-row-sub { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; }
.m-row-dem { text-align: right; flex-shrink: 0; }
.m-row-dem b { font-size: 15px; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.m-row-dem span { display: block; font-size: 8.5px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-tertiary); }
.m-row-chev { color: var(--text-tertiary); font-size: 18px; flex-shrink: 0; }
.m-listfoot { display: flex; align-items: center; justify-content: space-between; padding: 14px 4px; margin-top: 6px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-secondary); }
.m-listfoot b { font-size: 16px; color: var(--text-primary); }
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` — will FAIL until Task 7 supplies `onAdd` returning a `Flow`. That's expected; the type is satisfied once `FlowsTable` passes the new callbacks. Do NOT commit yet — Task 7 wires it and both commit together.

---

### Task 7: Wire into `FlowsTable`; delete `FlowCard`

**Files:**
- Modify: `src/components/step3/FlowsTable.tsx`
- Delete: `src/components/step3/FlowCard.tsx`

- [ ] **Step 1:** In `FlowsTable.tsx`, change the `add` helper to RETURN the created flow (so the list can open its sheet). Current:

```tsx
const add = (sectionName?: string) =>
  onPatch({ flows: [...flows, emptyFlow(sectionName)] })
```

becomes:

```tsx
const add = (sectionName?: string): Flow => {
  const f = emptyFlow(sectionName)
  onPatch({ flows: [...flows, f] })
  return f
}
```

- [ ] **Step 2:** Replace the import of `FlowCard` with `FlowListMobile`:

```tsx
import FlowListMobile from './FlowListMobile'
```

(remove `import FlowCard from './FlowCard'`).

- [ ] **Step 3:** Replace the entire `narrow ?` branch (the `<div className="flows-cards">…</div>` block, currently ~lines 334–380) with:

```tsx
      ) : narrow ? (
        <FlowListMobile
          flows={flows}
          flowGroups={flowGroups}
          flowGroupColors={flowGroupColors}
          vehicles={vehicles}
          derivedByFlowId={derivedByFlowId}
          unitSystem={unitSystem}
          onUpdate={update}
          onDelete={remove}
          onAdd={add}
        />
```

Leave the desktop `<div className="flows-scroll">…table…</div>` branch untouched. Remove the now-unused `renderFlowCard` function and the `move` helper (mobile reorder is dropped per spec; `move` had no other caller — verify with a grep before deleting).

- [ ] **Step 4:** Delete the file: `git rm src/components/step3/FlowCard.tsx`. Grep to confirm no other importer: `grep -rn "FlowCard" src app` returns nothing.

- [ ] **Step 5: Verify (full gate):**

```bash
npx tsc --noEmit && npx vitest run && npm run check:arch
```

Expected: tsc clean, all vitest green (no calc touched), arch passes. `grep -rn "flows-cards\|renderFlowCard" src` returns nothing.

- [ ] **Step 6: Commit (Tasks 6 + 7 together):**

```bash
git add src/components/step3/FlowListMobile.tsx src/components/step3/FlowsTable.tsx app/globals.css
git rm src/components/step3/FlowCard.tsx
git commit -m "feat(mobile): Step 3 flows become a list->sheet; drop FlowCard"
```

---

### Task 8: CSS cleanup — retire orphaned `.flow-card*` / `.fc-*`

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1:** Grep for the old card classes now that `FlowCard` is gone: `grep -n "\.flow-card\|\.fc-" app/globals.css`. These blocks (added for the deleted card) are dead. Confirm none are shared with the new `.m-*` classes (they are not — different prefix), then delete the `.flow-card`, `.fc-group*`, `.fc-head`, `.fc-index`, `.fc-route`, `.fc-arrow`, `.fc-grid`, `.fc-field`, `.fc-label`, `.fc-veh`, `.fc-out*`, `.fc-actions*`, `.fc-move*` rules (the Step-3 stacked-card block added 2026-07-12).

- [ ] **Step 2: Verify** `npm run check:arch` passes; `grep -rn "fc-group\|flow-card" src app` returns nothing (no JSX references the removed classes). Commit:

```bash
git add app/globals.css
git commit -m "chore(mobile): remove orphaned FlowCard CSS"
```

---

### Task 9: QA, docs verification, and push

- [ ] **Step 1: Device-emulation QA** (DevTools, running app on `:3000` after a clean restart per the CSS rule). At iPhone SE 375 / iPhone 14 390 / iPad 768, on Step 3 ≤ 700px:
  - List renders: group headers, rows (route · vehicle · moves/hr · demand), sticky raw-demand footer.
  - Tap a row → full-screen sheet; editing origin/distance/moves/vehicle recomputes Cycle/Demand live at the top.
  - Vehicle and Avg. Speed open bottom-sheet pickers; selecting closes them and updates the value.
  - Transfer opens its bottom sheet; changing method, entering a Custom time, and (for a lifting method) a lift height all recompute.
  - "+ Flow" (bottom and per-group) creates a flow and opens its sheet; Delete removes it and closes.
  - No horizontal page scroll at 375px; Escape/scrim closes pickers.
  - Desktop (> 700px) still shows the table, unchanged.

- [ ] **Step 2: Full gates:** `npx tsc --noEmit && npx vitest run && npm run check:arch` — all green (275 tests).

- [ ] **Step 3: `/simplify` then `/review`** on the diff (pre-push checklist judgment steps).

- [ ] **Step 4: Clean dev restart + served-chunk verification** (CSS changed — per `dev_server_hmr_no_restart` memory): `pkill -9 -f next-server; pkill -9 -f "next dev"`, confirm port free, `rm -rf .next`, `npm run dev`, confirm the LISTEN pid is young, then curl the served `app_globals_*.css` chunk and grep for `m-fullsheet` and `m-flowlist` (> 0).

- [ ] **Step 5: Push:** `git push origin main` (full pre-push hook: tsc · check:arch · vitest).

---

## Self-review notes (applied)

- **Spec coverage:** BottomSheet (T2) · SheetSelect (T3) · MobileHeader (T4) · FlowSheet with live-top outputs + transfer bottom sheet + Custom-0s reuse (T5) · FlowListMobile with group headers + demand footer + add (T6) · FlowsTable wiring + FlowCard deletion (T7) · CSS cleanup (T8) · docs (T1) · QA/push (T9). MobileHeader (T4) is built as a foundation primitive but not yet consumed by Step 3 (the flows list uses the `flows-count` header already in FlowsTable) — it exists for the later per-step rollout; noted so its "unused in this sub-project" state is intentional, not an oversight.
- **Type consistency:** `onAdd: (sectionName?) => Flow` (T6) matches `add` returning `Flow` (T7); `SheetOption {id,label,dot?,sub?}` used consistently (T3/T5); `FlowDerived` `EMPTY` sentinel shared shape.
- **Placeholder scan:** clean. FlowSheet uses `DerivTrigger`'s real API (a `className`-styled formula-icon button beside the plain Demand value) — no invented props; `DerivTrigger.tsx` is not modified.
- **Known checkpoint:** T6 alone won't typecheck (needs T7's `add` signature) — commit T6+T7 together, stated in both tasks.
- **YAGNI cuts honored:** no reorder/duplicate/group-edit on mobile; no new deps; MobileHeader minimal.
