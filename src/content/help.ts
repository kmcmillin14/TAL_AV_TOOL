// In-app help content. Written for a first-time user ("novice") learning HOW to
// use the tool — plain language, one worked example per step, and an illustrative
// mockup. Kept as data (like the vehicle library) so it's easy to edit without
// touching the UI. One section per id: 'app' (overview) + 'step0'..'step4'.
//
// `figure.mock` names an illustration drawn by HelpMock.tsx. These are simple
// on-brand mockups today; a real screenshot can replace each one later by adding
// `figure.shot` (an image path) — HelpMock prefers the screenshot when present.

export type MockId =
  | 'app-flow' | 'entry' | 'form' | 'matrix' | 'engine' | 'dashboard'

export interface HelpFigure {
  /** Illustrative mockup id (swap for a real screenshot via `shot` later). */
  mock: MockId
  /** Optional real screenshot path; when set, HelpMock shows it instead of the mock. */
  shot?: string
  caption: string
}

export interface HelpExample {
  title: string
  /** Each line is a step in the worked example ("plain English → result"). */
  lines: string[]
}

export interface HelpSection {
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4'
  /** Small label above the title, e.g. "Step 01". */
  eyebrow?: string
  title: string
  summary: string
  howTo: string[]
  example?: HelpExample
  figure?: HelpFigure
  tips?: string[]
}

export const HELP: HelpSection[] = [
  {
    id: 'app',
    title: 'How this tool works',
    summary:
      'The Fleet Calculator turns your application requirements into a sized AGV/AMR fleet and a rough-order (ROM) proposal you can hand to a customer. You move left-to-right through five steps in the top ribbon. Nothing is required — fill in what you know and come back later; everything auto-saves to this browser.',
    howTo: [
      'Start (00) — begin a new project, or import a questionnaire / a previous revision.',
      'Application (01) — answer the questionnaire: what you move, how, the site, the schedule, and throughput.',
      'Vehicles (02) — see which vehicles qualify, shown as traffic lights. This step is just information — you don’t pick a vehicle here.',
      'Fleet Engine (03) — lay out each material flow and assign a vehicle; the tool sizes the fleet live.',
      'ROM Dashboard (04) — read the economics (CAPEX, payback, KPIs), try what-if scenarios, and export the proposal.',
    ],
    example: {
      title: 'The big picture, in one line',
      lines: [
        'Requirements in (loads, flows, schedule) →',
        'qualified vehicles + how many of each →',
        'a CAPEX range, payback, and a PowerPoint proposal out.',
      ],
    },
    figure: { mock: 'app-flow', caption: 'The five steps, left to right — each feeds the next.' },
    tips: [
      'The Imperial / Metric toggle (top-right) only changes what’s displayed — every value is stored in imperial.',
      'Use the accent Export button (top-right) any time to download the PowerPoint proposal, an Excel workbook, or a .json save file.',
      'The project header (REV / OPP / Customer / Project) is editable right in the top bar.',
    ],
  },
  {
    id: 'step0',
    eyebrow: 'Step 00',
    title: 'Start',
    summary:
      'Choose how to begin, and set the project header. Three big cards each start a project a different way; the panel above them holds the REV / OPP / Customer / Project / TAL Engineer fields that print on the proposal.',
    howTo: [
      'Start New — begin a blank project and fill the questionnaire yourself.',
      'Import Customer Questionnaire — upload a completed questionnaire (.json) to auto-fill Step 01.',
      'Import Previous Revision — upload an earlier export of this tool (.pdf or .json) to continue or re-revise a project.',
      'Fill in the Project Details panel (REV / OPP / Customer / Project / TAL Engineer) — it stays in sync with the top header.',
    ],
    example: {
      title: 'Example — a new revision of an existing quote',
      lines: [
        'You quoted "Acme – Dock Replen" last month and need a Rev B.',
        'Pick Import Previous Revision → choose the saved .json.',
        'The new project lands on Step 01 with everything pre-filled; bump REV to B.',
      ],
    },
    figure: { mock: 'entry', caption: 'Three ways to begin, with the Project Details panel above.' },
    tips: ['Importing is the fast path for a returning project or a new revision of one.'],
  },
  {
    id: 'step1',
    eyebrow: 'Step 01',
    title: 'Application questionnaire',
    summary:
      'Capture the project’s requirements. The form is grouped into three tiers — Vehicle Qualification, Fleet Sizing & Economics, and Proposal Details. Fields marked with a red asterisk (*) are the key ones that drive which vehicles qualify in Step 02. You never have to fill everything to move on.',
    howTo: [
      'Work down the sections using the left nav; the meter tracks how many key qualification answers you’ve given.',
      'Answer what you’re moving (weight, unit type, size), how it transfers, the site/environment, your schedule, and the throughput & distances.',
      'Add each material movement as a flow row (Origin · Destination · Distance · Moves/hr). These flows carry straight into the Fleet Engine.',
      'Use the Imperial / Metric toggle for entry convenience — values store in imperial either way.',
    ],
    example: {
      title: 'Example — a pallet move',
      lines: [
        'Moving: 2,500 lb pallets, 48×40 in.',
        'Transfer: Lift, floor-to-floor.',
        'Schedule: 2 shifts × 8 h, Mon–Fri.',
        'Flow: Receiving → Rack, 300 ft one-way, 30 moves/hr.',
      ],
    },
    figure: { mock: 'form', caption: 'A flow row: origin, destination, distance, and moves/hr. No vehicle column — that’s Step 03.' },
    tips: [
      'The red * marks the fields matched against vehicles in Step 02 — fill those first for a useful matrix.',
      'Partial input still flows through; you can refine numbers right up to the proposal.',
    ],
  },
  {
    id: 'step2',
    eyebrow: 'Step 02',
    title: 'Vehicles',
    summary:
      'A traffic-light matrix showing which library vehicles meet your Step 01 requirements. It’s informational — no vehicle is chosen here. Selection happens later, implicitly, when you assign vehicles to flows in the Fleet Engine.',
    howTo: [
      'Read each card’s light: GREEN passes every hard requirement and soft preference; YELLOW passes the hard ones but misses a soft preference; RED fails a hard requirement (weight, lift, temperature) — no override.',
      'Use the filters and search to narrow by status, category, or manufacturer.',
      'Flip a card to see the per-requirement detail and the full spec sheet.',
    ],
    example: {
      title: 'Example — reading a light',
      lines: [
        'A vehicle rated to 2,000 lb against your 2,500 lb load → RED (hard weight miss).',
        'A vehicle that fits everything but lacks a requested certification → YELLOW (review).',
        'A vehicle that meets all of it → GREEN.',
      ],
    },
    figure: { mock: 'matrix', caption: 'Each vehicle is a card with a green / yellow / red qualification light.' },
    tips: [
      'This step is optional — if you already know the vehicles, skip straight to the Fleet Engine.',
      'A RED light is a hard stop by design; the matrix stays conservative so the proposal is safe.',
    ],
  },
  {
    id: 'step3',
    eyebrow: 'Step 03',
    title: 'Fleet Engine',
    summary:
      'The whole sizing calculation on one page. You lay out each flow and assign a vehicle; the tool computes cycle time, the raw vehicle count, the extra vehicles charging needs, and a buffer — and shows the running total live as a waterfall: base → + charging → × buffer → total.',
    howTo: [
      'For each flow, pick the Vehicle, its Transfer type, the route speed, the round-trip Distance, and the Throughput (moves/hr).',
      'Open the Σ (sigma) on a row to see the exact cycle-time and vehicle-count math.',
      'Review the Charging section — runtime, recharge, and how many extra vehicles charging adds.',
      'Set the Buffer % — the one safety multiplier — and read the total fleet at the bottom.',
    ],
    example: {
      title: 'Example — the waterfall',
      lines: [
        '4.2 raw vehicles needed for the flows → round up to 5 (base).',
        '+1 to cover charging downtime → 6.',
        '× 10% buffer → 7 vehicles sold.',
      ],
    },
    figure: { mock: 'engine', caption: 'The sizing waterfall: base fleet → + charging → × buffer → total.' },
    tips: [
      'Vehicles are pooled per type across the whole project — grouping rows is just for organisation.',
      'Assigning a vehicle here is what “selects” it; Step 02 never picks for you.',
    ],
  },
  {
    id: 'step4',
    eyebrow: 'Step 04',
    title: 'ROM Dashboard',
    summary:
      'The customer-facing summary built from the fleet total — KPIs (fleet size, CAPEX range, payback, utilization), charts, and the proposal export. A driver rail on the left lets you run what-if scenarios; every KPI and chart recomputes live, and you can toggle Baseline vs Scenario to compare.',
    howTo: [
      'Read the headline KPIs at the top: total fleet, ROM CAPEX range, payback, net annual benefit.',
      'Adjust a driver on the left (throughput boost, shifts, labor rate, buffer…) to see a what-if; the deltas show green when a change helps, red when it hurts.',
      'Click the maximize icon on any tile to view a chart or table full-screen.',
      'Export the proposal (PowerPoint) or Save project file (.json) from the buttons at the bottom — or the Export button up top.',
    ],
    example: {
      title: 'Example — a what-if',
      lines: [
        'Baseline: 7 vehicles, $1.2–1.5M, 2.8-year payback.',
        'Set “Throughput boost” to +20% → fleet and CAPEX rise, payback shifts.',
        'Toggle Baseline / Scenario to compare the two side by side.',
      ],
    },
    figure: { mock: 'dashboard', caption: 'KPI band, driver rail for what-ifs, and the bento of charts.' },
    tips: [
      'Scenarios are in-memory — they never change your saved project until you click “Apply to baseline”.',
      'The PowerPoint export always reflects the baseline numbers, not an unsaved scenario.',
    ],
  },
]
