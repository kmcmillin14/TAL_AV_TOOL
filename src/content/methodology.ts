// Methodology reference for Step 4 → "04 Methodology". Defines every variable in
// the fleet-sizing / ROM calc chain and explains WHY each formula is shaped the
// way it is. Content-as-data (like src/content/help.ts); rendered by
// MethodologyPanel. The symbols here match the tokens used in each `formula`,
// so a reader can map the equation to the glossary. Imperial (ft · s · $).

export interface MethodVariable {
  sym: string            // token used in the formula (e.g. "v_load")
  name: string
  def: string            // plain-language meaning
  unit?: string
}

export interface MethodTopic {
  id: string
  num: string            // "01"…
  title: string
  formula: string        // symbolic, using the glossary tokens
  variables: MethodVariable[]
  why: string            // the rationale — why the math is shaped this way
}

export const METHODOLOGY: readonly MethodTopic[] = [
  {
    id: 'cycle',
    num: '01',
    title: 'Cycle time',
    formula: 'cycle = d ÷ (v_load × p)  +  d ÷ (v_empty × p)  +  t_load  +  t_unload  +  t_lift',
    variables: [
      { sym: 'cycle', name: 'Cycle time', def: 'Seconds for one full move — pick up, travel out, set down, travel back.', unit: 's' },
      { sym: 'd', name: 'Distance', def: 'One-way leg length between origin and destination.', unit: 'ft' },
      { sym: 'v_load', name: 'Loaded speed', def: "Vehicle's rated travel speed while carrying a load.", unit: 'ft/s' },
      { sym: 'v_empty', name: 'Empty speed', def: 'Rated travel speed returning empty.', unit: 'ft/s' },
      { sym: 'p', name: 'Route pace', def: 'Fraction of rated speed actually sustained — Low 0.30 · Medium 0.50 · High 0.70.', unit: '×' },
      { sym: 't_load', name: 'Load time', def: 'Seconds to pick up the load — from the chosen transfer method.', unit: 's' },
      { sym: 't_unload', name: 'Unload time', def: 'Seconds to set the load down — from the transfer method.', unit: 's' },
      { sym: 't_lift', name: 'Lift time', def: 'Vertical transfer time = lift height ÷ lift speed (0 when the move is floor-to-floor).', unit: 's' },
    ],
    why: 'One move is a round trip: out loaded, back empty, plus the time to pick up and set down (and raise/lower for a vertical transfer). Travel uses a route-average pace, never rated top speed — acceleration, braking, and cornering mean a vehicle never holds cruise end-to-end, so 70% is the realistic ceiling.',
  },
  {
    id: 'demand',
    num: '02',
    title: 'Raw vehicle demand',
    formula: 'demand = (Q × cycle) ÷ 3600        base = ⌈ Σ demand ⌉',
    variables: [
      { sym: 'Q', name: 'Throughput', def: 'Moves required per hour on this flow.', unit: 'moves/hr' },
      { sym: 'cycle', name: 'Cycle time', def: 'Seconds per move (from step 01).', unit: 's' },
      { sym: 'demand', name: 'Raw demand', def: 'Fractional vehicles a single flow needs running in parallel.', unit: 'veh' },
      { sym: 'base', name: 'Base fleet', def: 'Whole vehicles per chassis — the ceiling of summed demand across its flows.', unit: 'veh' },
    ],
    why: 'Throughput is per hour and cycle is in seconds, so ÷3600 converts to vehicle-hours of work per hour — i.e. how many vehicles must run at once. Demand is summed across every flow a chassis serves, then rounded up: you cannot buy a fraction of a vehicle, and rounding down would miss throughput.',
  },
  {
    id: 'charging',
    num: '03',
    title: 'Charging availability',
    formula: 'A = min(A_energy, A_cap)        fleet = ⌈ demand ÷ A ⌉',
    variables: [
      { sym: 'run', name: 'Runtime', def: 'Hours of operation per full charge — the cutsheet figure, taken at face value (no DOD or efficiency derates: a measured runtime already contains them).', unit: 'h' },
      { sym: 'recharge', name: 'Recharge time', def: 'Hours to a full recharge — the cutsheet charge time.', unit: 'h' },
      { sym: 'C', name: 'Consecutive operating days', def: 'Days the fleet runs before a rest day that recharges to 100% (∞ for 24/7).', unit: 'days' },
      { sym: 'A_energy', name: 'Energy availability', def: 'Weekly balance crediting every non-working hour plus the day-off reset = min(1, (24 + recharge/C) ÷ (H·(1 + recharge/run))).', unit: '0–1' },
      { sym: 'A_cap', name: 'Rotation availability', def: 'The run:charge ratio = run ÷ (run + recharge), or 1 when the battery covers the production window H (breaks credited as top-up).', unit: '0–1' },
      { sym: 'A', name: 'Availability', def: 'Share of the day a vehicle can work (the rest is charging) = the smaller of energy and rotation, 0–1.', unit: '0–1' },
    ],
    why: 'A vehicle on the charger is not moving loads. Availability is the share of the day it can work; dividing demand by it provisions enough vehicles that the line never starves while others recharge. Energy availability credits charging during every non-working hour and the day-off reset (a day off recharges to 100% — a reset, not banking). Rotation availability is whether the battery covers a production window. Any vehicle is assumed to charge whenever it is not working.',
  },
  {
    id: 'buffer',
    num: '04',
    title: 'Target utilization (headroom)',
    formula: 'fleet_sold = max(base, ⌈ max(raw ÷ A_energy, raw × (1+b) ÷ A_cap) ⌉)',
    variables: [
      { sym: 'base', name: 'Base fleet', def: 'Demand-driven vehicles (from step 02).', unit: 'veh' },
      { sym: 'charging', name: 'Charging add', def: 'Extra vehicles to cover charging downtime (from step 03).', unit: 'veh' },
      { sym: 'b', name: 'Headroom', def: 'The buffer equivalent of the target utilization (u = 1 ÷ (1+b)) — Conservative 70% · Standard 80% · Aggressive 85%.', unit: '%' },
      { sym: 'fleet_sold', name: 'Fleet sold', def: 'Final recommended fleet per chassis — the larger of the rotation and energy constraints, floored at base.', unit: 'veh' },
    ],
    why: 'Real operations lose vehicles to maintenance, operator training, and demand spikes. The fleet pays the larger of two constraints: peak need with utilization headroom (÷ rotation availability) or weekly energy sustain. Energy is never buffered — idle robots charge — and each chassis rounds up exactly once, at the end, so rounding slack is never buffered twice.',
  },
  {
    id: 'payback',
    num: '05',
    title: 'ROI · simple payback',
    formula: 'payback = CAPEX_mid ÷ (N_op × rate)',
    variables: [
      { sym: 'CAPEX_mid', name: 'System cost (mid)', def: 'Midpoint of the budgetary ROM price range.', unit: '$' },
      { sym: 'N_op', name: 'Operators displaced', def: 'Head-count the fleet removes from the task.', unit: 'people' },
      { sym: 'rate', name: 'Fully-burdened rate', def: 'Annual loaded cost of one operator (wages + overhead).', unit: '$/yr' },
      { sym: 'payback', name: 'Payback', def: 'Years for displaced labor to repay the system cost.', unit: 'yr' },
    ],
    why: 'Simple payback is the time for the labor the fleet displaces to repay what the system costs. Operating cost is reported separately, not netted against the labor offset, to keep the headline conservative and the math transparent — a buyer can apply their own OPEX assumptions without re-deriving the payback.',
  },
  {
    id: 'opex',
    num: '06',
    title: 'Operating cost',
    formula: 'OPEX = energy + maintenance       energy = Σ(kW × h/day × days/yr × qty) × $/kWh',
    variables: [
      { sym: 'kW', name: 'Operating power', def: 'Power per vehicle while working = draw × voltage ÷ 1000.', unit: 'kW' },
      { sym: 'h/day', name: 'Operating hours', def: 'Run hours per day = shifts × hours/shift (capped at 24).', unit: 'h' },
      { sym: 'days/yr', name: 'Operating days', def: 'Working days per year for the site.', unit: 'days' },
      { sym: '$/kWh', name: 'Energy cost', def: 'Electricity price.', unit: '$/kWh' },
      { sym: 'maintenance', name: 'Maintenance', def: 'Annual reserve = a fixed percentage of system cost.', unit: '$/yr' },
    ],
    why: 'Annual cost to run the fleet: electricity to move the vehicles plus a maintenance reserve sized as a fraction of CAPEX. Energy is summed per chassis from its real power draw and the site schedule, so heavier or longer-running fleets cost proportionally more to operate.',
  },
] as const
