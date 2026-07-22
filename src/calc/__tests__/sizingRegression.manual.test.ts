/**
 * Old-vs-new sizing regression census (Workstream 2) — AUTHORITATIVE.
 *
 * Legacy side = the codified real workbook ("Example Fleet Calcs.xlsx", see
 * legacySizing.ts). App side = the live v3 calc. This is an END-TO-END comparison:
 * each model computes its OWN demand + its OWN fleet from the SAME physical
 * scenario (roundtrip distance, frequency, schedule). The legacy is route-layout
 * agnostic (one avg speed per vehicle, ×1.2 over 100 m); the app uses rated speed
 * × route factor {low .3 / med .5 / high .7}, so we SWEEP all three app layouts
 * against the single legacy point (owner decision 2026-07-22).
 *
 * Runs ONLY when RUN_REGRESSION=1 (excluded from the normal suite):
 *   RUN_REGRESSION=1 npx vitest run sizingRegression
 * Writes docs/analysis/sizing-regression.{csv,md}.
 *
 * Physical-input mapping: app Flow.distanceFt is ONE-WAY (cycle doubles it);
 * the legacy P column is ROUNDTRIP. So one physical trip → app distanceFt = d,
 * legacy roundtripFt = 2d.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Flow, FlowDerived, FleetSettings, RouteLayout } from '../types'
import { DEFAULT_BUFFER_PCT } from '../types'
import { flowDerived, groupSummary } from '../flowMetrics'
import { fleetSummary } from '../fleet'
import { consecutiveOperatingDays } from '../romAnalytics'
import { legacyFleetSize, LEGACY_VEHICLE_SPECS, type LegacyMission } from '../legacySizing'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import cb18 from '@/src/content/vehicles/cb18.json'
import ml2 from '@/src/content/vehicles/ml2.json'
import m10 from '@/src/content/vehicles/m10.json'
import tb50a from '@/src/content/vehicles/8tb50a.json'
import hbc40a from '@/src/content/vehicles/8hbc40a.json'

// Only the 5 the owner asked to test; id must exist in LEGACY_VEHICLE_SPECS.
const VEHICLES: { v: Vehicle; id: keyof typeof LEGACY_VEHICLE_SPECS }[] = [
  { v: cb18 as unknown as Vehicle, id: 'cb18' },
  { v: ml2 as unknown as Vehicle, id: 'ml2' },
  { v: m10 as unknown as Vehicle, id: 'm10' },
  { v: tb50a as unknown as Vehicle, id: '8tb50a' },
  { v: hbc40a as unknown as Vehicle, id: '8hbc40a' },
]
const ROUTES: RouteLayout[] = ['low', 'medium', 'high']
const REPLICATES = Number(process.env.REGRESSION_REPLICATES ?? 50)

// Schedule presets → app FleetSettings + the (shifts,hours) the legacy table keys on.
const SCHEDULES = [
  { name: '1x8 Mon-Fri', shifts: 1, hours: 8, pattern: 'Mon–Fri' },
  { name: '2x8 Mon-Fri', shifts: 2, hours: 8, pattern: 'Mon–Fri' },
  { name: '3x8 Mon-Sat', shifts: 3, hours: 8, pattern: 'Mon–Sat' },
  { name: '24/7',        shifts: 3, hours: 8, pattern: 'Mon–Sun' },
]
function settingsFor(s: typeof SCHEDULES[number]): FleetSettings {
  return {
    regime: 'continuous', bufferPct: DEFAULT_BUFFER_PCT,
    dailyOpHr: Math.min(24, s.shifts * s.hours), breakHrs: 0,
    consecutiveOpDays: consecutiveOperatingDays(s.pattern), chargeMethods: {},
  }
}

// Deterministic PRNG (mulberry32).
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo)

interface PhysMission { oneWayFt: number; freqPerHr: number }
/** Generate one physical system (3–12 missions) — model-agnostic inputs. */
function genSystem(r: () => number): PhysMission[] {
  const n = Math.floor(between(r, 3, 12.999))
  return Array.from({ length: n }, () => ({
    oneWayFt: Math.round(between(r, 50, 750)),   // roundtrip 100–1500 ft
    freqPerHr: between(r, 5, 90),
  }))
}

interface Row {
  vehicle: string; schedule: string; route: string; missions: number
  appRaw: number; appFleet: number; binding: string
  legacyRaw: number; legacyFleet: number; delta: number
}

function runApp(
  sys: PhysMission[], veh: Vehicle, route: RouteLayout, sch: typeof SCHEDULES[number],
) {
  const flows: Flow[] = sys.map((m, i) => ({
    id: `f${i}`, origin: `O${i}`, destination: `D${i}`,
    distanceFt: m.oneWayFt, thruPerHr: m.freqPerHr, routeLayout: route,
    liftHeightFt: 0, vehicleId: veh.id,
  }))
  const derived = new Map<string, FlowDerived>()
  for (const f of flows) derived.set(f.id, flowDerived(f, veh))
  const group = groupSummary(veh.id, flows, derived)
  const fs = fleetSummary([group], new Map([[veh.id, veh]]), settingsFor(sch))
  return { raw: group.groupRaw, fleet: fs.groups[0]?.fleetSold ?? 0, binding: fs.groups[0]?.binding ?? 'n/a' }
}

// ── stats ──────────────────────────────────────────────────────────────────
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1)
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0 }
const pct = (xs: number[], p: (x: number) => boolean) => xs.length ? (100 * xs.filter(p).length) / xs.length : 0

describe.runIf(process.env.RUN_REGRESSION)('sizing regression census (real legacy workbook vs app v3)', () => {
  it('generates the end-to-end census, writes CSV + report', () => {
    const rows: Row[] = []
    let seed = 0x5EED
    for (const { v, id } of VEHICLES) {
      const spec = LEGACY_VEHICLE_SPECS[id]
      for (const sch of SCHEDULES) {
        for (let rep = 0; rep < REPLICATES; rep++) {
          const sys = genSystem(mulberry32(seed++))
          // Legacy computed ONCE per physical system (route-agnostic).
          const legMissions: LegacyMission[] = sys.map(m => ({ roundtripFt: m.oneWayFt * 2, freqPerHr: m.freqPerHr }))
          const leg = legacyFleetSize(legMissions, spec, sch.shifts, sch.hours)
          for (const route of ROUTES) {
            const app = runApp(sys, v, route, sch)
            rows.push({
              vehicle: id, schedule: sch.name, route, missions: sys.length,
              appRaw: app.raw, appFleet: app.fleet, binding: app.binding,
              legacyRaw: leg.raw, legacyFleet: leg.fleet, delta: app.fleet - leg.fleet,
            })
          }
        }
      }
    }
    expect(rows.length).toBe(VEHICLES.length * SCHEDULES.length * REPLICATES * ROUTES.length)

    const outDir = resolve(__dirname, '../../../docs/analysis')
    mkdirSync(outDir, { recursive: true })
    const header = 'vehicle,schedule,route,missions,appRaw,appFleet,binding,legacyRaw,legacyFleet,delta'
    writeFileSync(resolve(outDir, 'sizing-regression.csv'),
      [header, ...rows.map(r =>
        `${r.vehicle},${r.schedule},${r.route},${r.missions},${r.appRaw.toFixed(3)},${r.appFleet},${r.binding},${r.legacyRaw.toFixed(3)},${r.legacyFleet},${r.delta}`)].join('\n') + '\n')

    const all = rows.map(r => r.delta)
    const L: string[] = []
    L.push('# Sizing regression — real legacy workbook vs app v3\n')
    L.push(`_Auto-generated by \`src/calc/__tests__/sizingRegression.manual.test.ts\` · ${rows.length} comparisons (5 vehicles × 4 schedules × ${REPLICATES} seeded systems × 3 app route layouts)._\n`)
    L.push('**Legacy = the codified "Example Fleet Calcs.xlsx"** (its own speeds, +20% travel allowance, per-vehicle transfer, schedule-keyed charging {1×8 = 0, 2×8 = +15%, 3× = +30%}, 20% buffer, single final ceiling). Δ = app fleet − legacy fleet (negative = app quotes fewer). Both compute their own demand from the same physical scenario (app one-way distance = ½ legacy roundtrip).\n')
    L.push('## Overall\n')
    L.push(`- comparisons: **${rows.length}**  ·  mean Δ **${mean(all).toFixed(2)}**  ·  median Δ **${median(all)}**`)
    L.push(`- |Δ|≥1: **${pct(all, d => Math.abs(d) >= 1).toFixed(1)}%**  ·  |Δ|≥2: **${pct(all, d => Math.abs(d) >= 2).toFixed(1)}%**`)
    L.push(`- app FEWER (Δ<0): **${pct(all, d => d < 0).toFixed(1)}%**  ·  more (Δ>0): **${pct(all, d => d > 0).toFixed(1)}%**  ·  equal: **${pct(all, d => d === 0).toFixed(1)}%**\n`)

    const strat = (key: (r: Row) => string, title: string) => {
      L.push(`## By ${title}\n`)
      L.push('| stratum | n | mean Δ | median Δ | %app fewer | %app more | %equal |')
      L.push('|---|--:|--:|--:|--:|--:|--:|')
      const g = new Map<string, number[]>()
      for (const r of rows) { const k = key(r); (g.get(k) ?? g.set(k, []).get(k)!).push(r.delta) }
      for (const [k, ds] of [...g].sort())
        L.push(`| ${k} | ${ds.length} | ${mean(ds).toFixed(2)} | ${median(ds)} | ${pct(ds, d => d < 0).toFixed(0)}% | ${pct(ds, d => d > 0).toFixed(0)}% | ${pct(ds, d => d === 0).toFixed(0)}% |`)
      L.push('')
    }
    strat(r => r.route, 'app route layout (the effective-speed lever)')
    strat(r => r.vehicle, 'vehicle')
    strat(r => r.schedule, 'schedule')

    const top = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)
    L.push('## Top 10 divergence exemplars\n')
    L.push('| vehicle | schedule | route | missions | app raw→fleet (bind) | legacy raw→fleet | Δ |')
    L.push('|---|---|---|--:|--:|--:|--:|')
    for (const r of top)
      L.push(`| ${r.vehicle} | ${r.schedule} | ${r.route} | ${r.missions} | ${r.appRaw.toFixed(1)}→${r.appFleet} (${r.binding}) | ${r.legacyRaw.toFixed(1)}→${r.legacyFleet} | ${r.delta} |`)
    L.push('')
    L.push('## Reading the results\n')
    L.push('- **Route layout is the dominant lever** (as expected): legacy avg speed sits between the app’s low and medium layouts, so app @ high (faster effective speed) quotes fewer, app @ low (slower) quotes more.')
    L.push('- **Charging diverges by schedule**: legacy adds +15% at 2×8 and +30% at 3×; the app credits off-shift/weekend charging (near 0 for single/light shifts), so the app quotes fewer on the charging axis — most visible where charging binds.')
    L.push('- **Modeling differences to attribute**: legacy +20% flat travel allowance and a single per-vehicle transfer time vs the app’s per-method load/unload/lift; legacy ignores operating days (no weekend credit).')
    L.push('- **Anchor**: legacy math is unit-verified against the workbook’s own cells (example row 1.073, CB18 transfer 75 s, ML2 13.25 s, the charging table). Swap the transfer config if a customer uses non-default pick/drop or conveyor geometry.\n')

    writeFileSync(resolve(outDir, 'sizing-regression.md'), L.join('\n'))
    expect(rows.length).toBeGreaterThan(1000)
  })
})
