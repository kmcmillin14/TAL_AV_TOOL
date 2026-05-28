// In-app help content. Authored for applications engineers learning HOW to use
// the tool. One section per id: 'app' (whole-app overview) + 'step0'..'step6'.
// Kept as data (like the vehicle library) so it's easy to edit without touching UI.

export interface HelpSection {
  id: 'app' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6'
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
    title: 'Step 3 · Flows',
    summary:
      'Model each material movement (origin → destination). The tool derives cycle time and fractional vehicle demand live, then sums it into a base fleet per vehicle type.',
    howTo: [
      'Add a flow (+ Flow), then fill the row: pick the Vehicle, its Transfer type (the +Ns badge is the handling time; lift methods open a small height popover), the Route Average Speed, round-trip Distance, and Throughput (moves/hour).',
      'Route Average Speed is High / Medium / Low — 70% is the realistic best-case average (a vehicle never sustains full cruise over a route). Pick lower for congested, turn-heavy routes.',
      'Read the Output columns: Cycle Time per trip and Vehicle Count (fractional). The summary box sums them per vehicle as raw → ⌈fleet⌉.',
      'Organize with Groups (+ Group) — visual zones like “ASRS” or “Dock.” Drag a row’s handle to reorder it, or drop it onto another group to move it there.',
      'Duplicate a row with its copy icon; remove it with the ×.',
    ],
    tips: [
      'Groups are visual only — the fleet still pools per vehicle type across the whole project.',
      'Distance is round-trip; the cycle already includes the loaded-out and empty-back legs.',
    ],
  },
  {
    id: 'step4',
    title: 'Step 4 · Charging',
    summary:
      'Will add the charging fleet delta on top of the Step 3 base fleet — derived from battery capacity, energy per foot, charge rate, and daily operating hours.',
    howTo: [],
    status: 'coming',
  },
  {
    id: 'step5',
    title: 'Step 5 · KPIs',
    summary:
      'Will apply the project buffer (the single safety multiplier) and surface fleet KPIs such as utilization and headroom.',
    howTo: [],
    status: 'coming',
  },
  {
    id: 'step6',
    title: 'Step 6 · ROM',
    summary:
      'Will assemble the rough-order-of-magnitude proposal — final fleet, price range, and assumptions — ready to export.',
    howTo: [],
    status: 'coming',
  },
]
