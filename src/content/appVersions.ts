// App release history — shown when the app version in the header is clicked.
// This is the APPLICATION's version log (not a project revision). Curated content;
// add a new entry at the TOP each release. The displayed header version is the
// first entry's `version`.

export interface AppVersion {
  version: string
  date: string          // ISO yyyy-mm-dd
  author: string
  summary: string[]     // bullet points
}

export const APP_VERSIONS: AppVersion[] = [
  {
    version: 'v1.0',
    date: '2026-06-23',
    author: 'Kyle McMillin',
    summary: [
      'Step 4 ROM dashboard rebuilt: hero Financials + Fleet boxes, utilization/availability/charging gauges, what-if scenario rail with Baseline/Scenario compare.',
      'Charts moved to themed Recharts (payback, TCO, utilization, CAPEX, battery SoC) with tooltips and annotations.',
      'Material flow map: industrial TAL recolor + backing data table; per-flow formula walkthrough; resilience status + bar; grouped assumptions.',
      'Step 1: fully-burdened labor rate input; not-yet-gated sections flagged.',
    ],
  },
  {
    version: 'v0.9',
    date: '2026-06-22',
    author: 'Kyle McMillin',
    summary: [
      'Step 00 entry screen with three start modes + live Project Details panel.',
      'App-wide 80% display density; light theme by default; compact page headers.',
      'Step 3 flows table: fit-to-width scaling, full AGV names, wrapping headers.',
    ],
  },
  {
    version: 'v0.8',
    date: '2026-06-21',
    author: 'Kyle McMillin',
    summary: [
      'Branded PowerPoint + Excel export; methodology panel; interactive KPI tiles.',
      'Scroll-spy dashboard layout; pre-push verification gate.',
    ],
  },
]

/** The current app version (header label). */
export const APP_VERSION = APP_VERSIONS[0]?.version ?? 'v1.0'
