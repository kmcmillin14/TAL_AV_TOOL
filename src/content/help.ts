// In-app help content. Authored for applications engineers learning HOW to use
// the tool. One section per id: 'app' (whole-app overview) + 'step0'..'step4'.
// Kept as data (like the vehicle library) so it's easy to edit without touching UI.

export interface HelpSection {
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4'
  title: string
  summary: string
  howTo: string[]
  tips?: string[]
  /** Steps not yet built — shown as a preview of intended purpose. */
  status?: 'coming'
}

export const HELP: HelpSection[] = [
  {
    id: 'app',
    title: 'App Overview',
    summary:
      'The Fleet Calculator sizes an AGV/AMR fleet from your application requirements and builds a defensible ROM proposal. Work left-to-right through the six steps in the top ribbon.',
    howTo: [
      'Start (00) — import a previous proposal (.pdf/.json) to continue a project, or start a new one from scratch.',
      'Application (01) — enter the project-wide requirements: load, transfer, site, schedule, throughput, environment.',
      'Vehicles (02) — review which library vehicles qualify against those requirements (informational; no selection here).',
      'Flows (03) — model each material movement; the tool computes cycle time and the vehicle count per type, live.',
      'Charging (04) · KPIs (05) · ROM (06) — layer charging demand, buffer/KPIs, and the final proposal (coming).',
    ],
    tips: [
      'Imperial / Metric (top-right) only changes what is displayed — every value is stored in imperial.',
      'Nothing is required to advance between steps. Fill in what you have and return later.',
      'Work auto-saves to this browser. Use the ⋯ menu to export a JSON (re-importable) or a PDF proposal — that is how you move a project between machines.',
      'The project header (REV / OPP / Customer / Project) is editable inline in the top bar; that divider sits at page center.',
    ],
  },
  {
    id: 'step0',
    title: 'Step 0 · Start',
    summary: 'Choose how to begin a project.',
    howTo: [
      'Import Existing Checklist — upload a previously exported .pdf or .json to restore a project and all its data.',
      'Fill Application Form — start a blank project and enter everything manually.',
      'Either way, set the project header (REV / OPP / Customer / Project) in the top bar.',
    ],
    tips: ['Importing is the fast path for a returning project or a new revision of one.'],
  },
  {
    id: 'step1',
    title: 'Step 1 · Application',
    summary:
      'Capture the project-wide requirements that qualify vehicles in Step 2 and frame the proposal.',
    howTo: [
      'Work through the sections (Load, Transfer, Site, Schedule, Throughput, …) using the left section nav; the progress bar tracks required fields.',
      'Fields marked * are the ones that drive Step 2 qualification — e.g. max load weight, lift height, aisle width, temperature, certifications.',
      'Use the Imperial/Metric toggle for entry convenience; values are stored in imperial regardless.',
    ],
    tips: [
      'You do not have to complete every field to continue — partial input still flows through.',
      'What you enter here is matched against each vehicle’s spec sheet in Step 2.',
    ],
  },
  {
    id: 'step2',
    title: 'Step 2 · Vehicles',
    summary:
      'An informational qualification matrix — which library vehicles meet your Step 1 requirements. No vehicle is chosen here; selection happens implicitly through the flows in Step 3.',
    howTo: [
      'Read each card’s traffic light: GREEN passes all hard gates + soft preferences; YELLOW passes the hard gates but a soft preference fails; RED fails a hard gate (weight, lift height, temp, certs) — with no override.',
      'Use the filters and search to narrow by status, category, or manufacturer.',
      'Flip a card for the per-gate qualification detail and the full spec sheet.',
    ],
    tips: [
      'The TAL logo marks TAL-integrated and TAL-offered (3rd-party) vehicles; the OEM/manufacturer is shown under each name.',
      'This step is optional — if you already know the vehicles, skip straight to Flows.',
    ],
  },
  {
    id: 'step3',
    title: 'Step 3 · Fleet Engine',
    summary:
      'The whole sizing calculation in one tab, with three sub-tabs: Flows (movement → base fleet), Charging (battery physics → extra vehicles), and Fleet (× buffer → total).',
    howTo: [
      'Flows: add a flow (+ Flow), pick the Vehicle, its Transfer type (the +Ns badge is handling time; lift methods open a height popover), the Route Average Speed, round-trip Distance, and Throughput (moves/hour). The Σ icon opens the live fleet-math derivation. Organize with Groups — drag a row to reorder or drop it onto another group.',
      'Charging: choose the recharge window (Overnight vs Continuous 24/7) and each vehicle’s charge method (Opportunity vs Plugged). The table shows runtime, recharge time, availability, and any extra vehicles charging requires.',
      'Fleet: set the buffer % — the only safety multiplier — and read the waterfall: base → + charging → × buffer → total fleet.',
    ],
    tips: [
      'Groups are visual only — the fleet pools per vehicle type across the whole project.',
      'Runtime = usable Ah ÷ discharge A. Under Overnight, a vehicle whose runtime covers the day adds no charging vehicles.',
    ],
  },
  {
    id: 'step4',
    title: 'Step 4 · ROM Dashboard',
    summary:
      'Will assemble the customer-facing proposal from the Fleet Engine total — fleet KPIs (utilization, CAPEX/OPEX, payback), rough-order pricing, and export.',
    howTo: [],
    status: 'coming',
  },
]
