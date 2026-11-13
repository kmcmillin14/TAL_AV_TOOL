// In-app help content. Written for a first-time user ("novice") learning HOW to
// use the tool — plain language, one worked example per step, and an illustrative
// mockup. Kept as data (like the vehicle library) so it's easy to edit without
// touching the UI. One section per id: 'app' (overview) + 'step0'..'step5'.
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
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'simulate' | 'step4' | 'step5'
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
      'The Fleet Calculator turns your application requirements into a sized AGV/AMR fleet and a rough-order (ROM) proposal you can hand to a customer. You move left-to-right through six steps in the top ribbon. Nothing is required — fill in what you know and come back later; everything auto-saves to this browser.',
    howTo: [
      'Start (00) — begin a new project, or import a questionnaire / a previous revision.',
      'Application (01) — answer the questionnaire: what you move, how, the site, the schedule, and throughput.',
      'Vehicles (02) — see which vehicles qualify, shown as traffic lights. This step is just information — you don’t pick a vehicle here.',
      'Fleet Engine (03) — lay out each material flow and assign a vehicle; the tool sizes the fleet live.',
      'ROM Configuration (04) — score Integration and Software complexity per vehicle, pick adders, and see a fleet-wide sell-price total.',
      'Dashboard (05) — read the economics (CAPEX, payback, KPIs), try what-if scenarios, and export the proposal.',
    ],
    example: {
      title: 'The big picture, in one line',
      lines: [
        'Requirements in (loads, flows, schedule) →',
        'qualified vehicles + how many of each →',
        'a CAPEX range, payback, and a PowerPoint proposal out.',
      ],
    },
    figure: { mock: 'app-flow', caption: 'The six steps, left to right — each feeds the next.' },
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
        'You quoted "Riverside DC – Dock Replen" last month and need a Rev B.',
        'Pick Import Previous Revision → choose the saved .json.',
        'The new project lands on Step 01 with everything pre-filled; bump REV to B.',
      ],
    },
    figure: { mock: 'entry', shot: '/images/help/step0.png', caption: 'Step 00 — three ways to begin, with the Project Details panel above.' },
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
    figure: { mock: 'form', shot: '/images/help/step1.png', caption: 'Step 01 — the questionnaire. Fields marked * drive Step 02 matching; nothing is required to move on.' },
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
    figure: { mock: 'matrix', shot: '/images/help/step2.png', caption: 'Step 02 — each vehicle is a card with requirement checks and a green / yellow / red light.' },
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
    figure: { mock: 'engine', shot: '/images/help/step3.png', caption: 'Step 03 — flows table and the live waterfall: base fleet → + charging → × buffer → total.' },
    tips: [
      'Vehicles are pooled per type across the whole project — grouping rows is just for organisation.',
      'Assigning a vehicle here is what “selects” it; Step 02 never picks for you.',
    ],
  },
  {
    id: 'simulate',
    eyebrow: 'Sizing · Simulate',
    title: 'Simulate',
    summary:
      'An optional check of the Sizing fleet on a drawn layout. You draw the site — points, routes and flows — and the simulation runs the vehicles through it to show whether the fleet keeps up and where it gets stuck. Nothing is invented: what is not drawn or not in the vehicle data is flagged.',
    howTo: [
      'Drawing (optional): load a PDF page or a PNG/JPG, then Set scale — click both ends of a known dimension and type its length.',
      'Points (P): choose a type and a role (Pick, Drop, or both) and click to place it. Clicking on a route places it on the route.',
      'Routes (R): click from point to point to draw a route; Esc ends the route. Routes snap to points and to other routes.',
      'Direction (D): click a route to step through two-way, one-way either way, and single-lane (no passing).',
      'Flows (F): click a Pick point, then a Drop point. Give the flow its moves per hour and vehicle on the right.',
      'Select (V): click anything to edit it; drag a point to move it; Delete removes it. ⌘Z / ⌘⇧Z undo and redo.',
    ],
    tips: [
      'A flow drawn here is the same flow Sizing uses: its distance and lift height now come from the layout, so the Sizing fleet can change.',
      'Sizing flows not yet on the layout are listed under “Link to points” — a name match is offered as one click.',
      'The drawing image is kept in the exported project file, not in the browser. After a reload, re-select the same file to bring it back.',
      'Run compares Sizing’s engine cycle (Sizing distance and route tier, a full loaded-out, empty-back cycle) with the simulated mission (the driven routes at the pace in Assumptions, with traffic, stations and charging, from dispatch to drop-off — its empty leg starts wherever the vehicle is).',
      'Check variability runs 10 seeds. With Regular arrivals only the start times change; set Random in Assumptions for real spread.',
      'B56.5 measures against fixed objects: draw walls, columns and rack faces with Place → Object for the rule to slow or block routes.',
    ],
  },
  {
    id: 'step4',
    eyebrow: 'Step 04',
    title: 'Pricing',
    summary:
      'The project quotation. Four priced categories — Hardware, Software, Professional services, and Adders — each with its own subtotal, closed by the total project investment. Underneath, a plain-English panel explains how the project scored: one complexity result for the whole fleet, because complexity comes from the site and the program, not from which chassis you picked.',
    howTo: [
      'Read the quotation top to bottom — Hardware itemizes per vehicle type; Software and Professional services are single fleet-wide lines.',
      'Pick options (warranty, support, training) below the quote — each applies once to the project total, never per vehicle.',
      'Check the scoring panel: each axis shows a named tier (Straightforward / Standard / Complex) and the plain-English reasons behind it. Open “Show scoring detail” for the point math.',
      'Use “Adjust tiers per vehicle” only when one chassis genuinely differs — an override needs a reason and can never drop below that vehicle’s own minimum.',
    ],
    example: {
      title: 'Example — a three-chassis fleet',
      lines: [
        'Hardware $2.40M itemized across CB18 ×4, M10 ×6, 8HBC40A ×5.',
        'Professional services $99.9K — charged once, because one fleet manager runs all three chassis.',
        'Scored Standard (2 of 3): an 11–20 unit fleet, a 500K+ sq ft facility, a customer new to AGVs.',
      ],
    },
    tips: [
      'Professional services covers integration, commissioning, startup support, and project management as one line — and is charged once per fleet-manager platform, not per vehicle type.',
      'Options are project-wide — checking one adds it once to the total, however many chassis types you have.',
      'A vehicle with no pricing configured (missing romInputs) is skipped with a note, not silently priced at zero.',
    ],
  },
  {
    id: 'step5',
    eyebrow: 'Step 05',
    title: 'Dashboard',
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
    figure: { mock: 'dashboard', shot: '/images/help/step4.png', caption: 'Step 05 — KPI band, driver rail for what-ifs, gauges, and the operation map.' },
    tips: [
      'Scenarios are in-memory — they never change your saved project until you click “Apply to baseline”.',
      'The PowerPoint export always reflects the baseline numbers, not an unsaved scenario.',
    ],
  },
]

/**
 * One-line help for every Fleet Simulation assumption (Milestone 6, acceptance 35), keyed
 * `scope.field` as in `SIM_FIELDS` (src/lib/simFields.ts). Plain words, one sentence; shown under the
 * field in the inspector and the Assumptions view. A test fails if a field has no line here.
 */
export const SIM_FIELD_HELP: Record<string, string> = {
  'vehicle.speedLoadedFps': 'Top speed carrying a load, on a straight route.',
  'vehicle.speedUnloadedFps': 'Top speed with no load; the loaded speed when the vehicle file has none.',
  'vehicle.accelFps2': 'How quickly it reaches speed. With acceleration and braking known, pace is not used.',
  'vehicle.decelFps2': 'How quickly it stops — also sets how early it asks for a junction.',
  'vehicle.turnSpeedFps': 'Speed through rounded corners.',
  'vehicle.reverseSpeedFps': 'Speed when backing into or out of a point.',
  'vehicle.widthFt': 'Body width — with the pallet, it sets the lane width and the B56.5 clearance.',
  'vehicle.overallLengthFt': 'Nose to fork tips — sets the gap to the vehicle ahead.',
  'vehicle.turningRadiusFt': 'Corners are rounded to this radius; 0 turns in place.',
  'vehicle.liftSpeedFps': 'How fast the forks rise to a raised point.',
  'vehicle.reorientSec': 'Extra time when it arrives facing the wrong way for the transfer.',
  'vehicle.approachDistanceFt': 'Straight run-in before a pick or drop, driven slowly.',
  'vehicle.avgPowerDrawKw': 'Average power while working — how fast the battery runs down.',
  'vehicle.chargerPowerKw': 'Charger output — how fast the battery comes back.',
  'vehicle.minSocPct': 'The battery is never run below this.',
  'vehicle.maxSocPct': 'Charging stops at this level.',
  'run.pacePct': 'Share of rated speed driven when the vehicle file has no acceleration or braking.',
  'run.safetyFt': 'Gap kept behind the vehicle ahead, beyond its length and load.',
  'run.demandPct': 'Moves per hour as a share of the Sizing figures — 120% tests growth.',
  'run.arrivals': 'Regular spaces orders evenly; Random varies them like a real shift.',
  'run.seed': 'Picks the random sequence — the same seed gives the same run.',
  'run.shiftH': 'From Step 1; change it here to try another shift (simulation only).',
  'run.shiftsPerDay': 'From Step 1. Shifts run back to back from midnight; off-shift no orders arrive and vehicles charge.',
  'safety.thresholdFps': 'At or above this speed the larger clearance applies (B56.5: 1.2 m/s).',
  'safety.lowSpeedIn': 'Minimum gap each side to walls and racks below the threshold speed.',
  'safety.fullSpeedIn': 'Gap each side at or above the threshold speed (B56.5: 0.5 m).',
  'safety.sharedBetweenVehicles': 'Two vehicles passing on a two-lane route share one clearance between them.',
  'point.heightFt': 'Height the load is picked from or set down at — drives lift time.',
  'point.handshakeSec': 'Extra wait for a conveyor or machine to accept or release the load.',
  'point.approachHeadingDeg': 'Direction the vehicle must face as it enters, in degrees (0 = east).',
  'route.speedLimitFps': 'Caps speed on this route, below the vehicle’s own speed.',
}
