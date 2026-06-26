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
      { sym: 'usable', name: 'Usable capacity', def: 'Battery you can actually use = rated Ah × depth of discharge (80%).', unit: 'Ah' },
      { sym: 'run', name: 'Runtime', def: 'Operating hours one charge sustains = usable ÷ draw.', unit: 'h' },
      { sym: 'recharge', name: 'Recharge time', def: 'Hours to refill — rated charge time (or usable ÷ charge current), with the charge rate derated to 85% for round-trip loss, near-full taper, and charger access.', unit: 'h' },
      { sym: 'C', name: 'Consecutive operating days', def: 'Days the fleet runs before a rest day that recharges to 100% (∞ for 24/7).', unit: 'days' },
      { sym: 'A_energy', name: 'Energy availability', def: 'Credits the nightly off-shift and the day-off reset = min(1, (usable/C + 24·charge) ÷ (H·(draw+charge))).', unit: '0–1' },
      { sym: 'A_cap', name: 'Capacity availability', def: 'Whether the battery covers the production window H = runtime ÷ (runtime + recharge), or 1 if it spans the window.', unit: '0–1' },
      { sym: 'A', name: 'Availability', def: 'Share of the day a vehicle can work (the rest is charging) = the smaller of energy and capacity, 0–1.', unit: '0–1' },
    ],
    why: 'A vehicle on the charger is not moving loads. Availability is the share of the day it can work; dividing demand by it provisions enough vehicles that the line never starves while others recharge. Energy availability credits charging during the nightly off-shift and the day-off reset (a day off recharges to 100% — a reset, not banking). Capacity availability is whether the battery covers a production window. The binding constraint is the smaller of the two; the buffer is applied after.',
  },
  {
    id: 'buffer',
    num: '04',
    title: 'Buffer',
    formula: 'fleet_sold = ⌈ (base + charging) × (1 + b) ⌉',
    variables: [
      { sym: 'base', name: 'Base fleet', def: 'Demand-driven vehicles (from step 02).', unit: 'veh' },
      { sym: 'charging', name: 'Charging add', def: 'Extra vehicles to cover charging downtime (from step 03).', unit: 'veh' },
      { sym: 'b', name: 'Buffer', def: 'Spare-capacity margin — Standard 10% · Medium 20% · Conservative 25%.', unit: '%' },
      { sym: 'fleet_sold', name: 'Fleet sold', def: 'Final recommended fleet per chassis.', unit: 'veh' },
    ],
    why: 'Real operations lose vehicles to maintenance, operator training, and demand spikes. The buffer is headroom on top of the modeled need so one vehicle going down does not stall throughput. It is the only multiplier in the pipeline, applied after base and charging, then rounded up to whole vehicles.',
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
