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
    formula: 'd = charge ÷ (charge + draw)        A = min(1, [z·R + (H − z·R)·d] ÷ H)',
    variables: [
      { sym: 'usable', name: 'Usable energy', def: 'Battery capacity actually available = voltage × amp-hours ÷ 1000 × usable %.', unit: 'kWh' },
      { sym: 'draw', name: 'Average draw', def: 'Power the vehicle consumes while working.', unit: 'kW' },
      { sym: 'charge', name: 'Charge input', def: 'Charger output.', unit: 'kW' },
      { sym: 'R', name: 'Runtime', def: 'Hours one charge lasts = usable ÷ draw.', unit: 'h' },
      { sym: 'd', name: 'Duty ratio', def: 'Share of the clock a vehicle can be working once its start charge is spent = charge ÷ (charge + draw). Battery capacity cancels out of this entirely — it is a current ratio.', unit: '0–1' },
      { sym: 'z', name: 'Off-shift charge', def: 'How much of a full charge the non-staffed hours can put back = min(1, (24 − H) ÷ recharge time). Zero at 24/7.', unit: '0–1' },
      { sym: 'A', name: 'Availability', def: 'Share of the staffed window a vehicle can work. The free hours off the overnight charge, then the duty ratio, averaged over the window.', unit: '0–1' },
    ],
    why: 'A vehicle on the charger is not moving loads. Every platform differs in how fast it puts energy back relative to how fast it takes it out, and that ratio — not battery size — sets the floor: at 24/7 availability IS the duty ratio. Below 24/7 a vehicle also starts the shift on its overnight charge, so a bigger battery buys a longer first run. Capacity wins the sprint; charge rate wins the marathon. Availability assumes charging is staggered across the fleet and that every vehicle has a charger; run in lockstep the honest figure is the bare duty ratio.',
  },
  {
    id: 'buffer',
    num: '04',
    title: 'Fleet build-up',
    formula: 'fleet = max(⌈raw⌉, ⌈ raw ÷ (A × U) ⌉)        base + charging + headroom = fleet',
    variables: [
      { sym: 'raw', name: 'Peak demand', def: 'Vehicle-equivalents the work needs with no stoppages.', unit: 'vehicles' },
      { sym: 'A', name: 'Availability', def: 'From step 03 — the share of the staffed window a vehicle can work.', unit: '0–1' },
      { sym: 'U', name: 'Target utilization', def: 'Share of AVAILABLE working time the fleet should run at — not of the clock. Default 90%: the throughput entered is peak, so the fleet already carries a spike allowance.', unit: '0–1' },
    ],
    why: 'One vehicle delivers A × U of work per staffed hour — available A of the window, loaded to U of that — so covering the demand takes raw ÷ (A × U). Reported as three stages that add exactly: peak demand, then the vehicles charging costs, then the vehicles headroom costs. Charging is costed first so it stays a property of the platform and does not shift when the utilization dial moves. Headroom sits on available time because a vehicle on a charger cannot answer a demand spike — charging downtime is not usable slack.',
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
    formula: 'OPEX = maintenance = CAPEX mid × maintenance %',
    variables: [
      { sym: 'CAPEX mid', name: 'System cost', def: 'Midpoint of the ROM CAPEX range.', unit: '$' },
      { sym: 'maintenance %', name: 'Maintenance rate', def: 'Annual reserve as a share of system cost.', unit: '% / yr' },
    ],
    why: 'Annual cost to run the fleet: a maintenance reserve sized as a fraction of CAPEX. Electricity is deliberately NOT modelled — the estimate would have rested on nameplate battery figures standing in for real duty-cycle draw, and on a blended $/kWh nobody enters, which is not a number a buyer should see attached to a quote. Add your own energy line from your site rate and measured draw.',
  },
] as const
