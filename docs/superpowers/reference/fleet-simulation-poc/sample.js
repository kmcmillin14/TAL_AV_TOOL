/* Sample layout for the proof of concept — drawn by hand for the demo, in feet. */
function sampleProject() {
  const P = [], S = [], pid = {}
  let n = 0
  const pt = (x, y) => { const k = x + ',' + y; if (pid[k]) return pid[k]; const id = 'p' + (++n); P.push({ id, x, y }); pid[k] = id; return id }
  const seg = (a, b, dir = 'two') => S.push({ id: 's' + (S.length + 1), a: pt(...a), b: pt(...b), dir })
  // main aisles (two-way) with every junction a shared point
  const xsA = [20, 60, 110, 160, 210, 240, 300], xsB = [20, 60, 72, 84, 96, 120, 132, 160, 240, 280, 300]
  for (let i = 1; i < xsA.length; i++) seg([xsA[i - 1], 60], [xsA[i], 60])
  for (let i = 1; i < xsB.length; i++) seg([xsB[i - 1], 140], [xsB[i], 140])
  for (const x of [20, 160, 300]) seg([x, 60], [x, 140])
  // stubs
  seg([60, 60], [60, 30]); seg([110, 60], [110, 30]); seg([210, 60], [210, 30])   // line EOLs
  seg([240, 60], [240, 85]); seg([240, 140], [240, 115])                           // wrapper in / out
  seg([280, 140], [280, 165])                                                       // warehouse conveyor
  for (const x of [60, 72, 84, 96]) seg([x, 140], [x, 160])                         // chargers
  for (const x of [120, 132]) seg([x, 140], [x, 160])                               // parking
  const L = []; let li = 0
  const loc = (name, type, x, y) => L.push({ id: 'l' + (++li), name, type, pointId: pt(x, y) })
  loc('Line 1 EOL', 'pd', 60, 30); loc('Line 2 EOL', 'pd', 110, 30); loc('Line 3 EOL', 'pd', 210, 30)
  loc('Wrapper Infeed', 'conveyor', 240, 85); loc('Wrapper Outfeed', 'conveyor', 240, 115)
  loc('Warehouse Infeed', 'conveyor', 280, 165)
  const chargers = [60, 72, 84, 96].map((x, i) => ({ id: 'c' + (i + 1), pointId: pt(x, 160) }))
  const parking = [120, 132].map((x, i) => ({ id: 'k' + (i + 1), pointId: pt(x, 160) }))
  const flows = [
    { id: 'f1', from: 'Line 1 EOL', to: 'Wrapper Infeed', thru: 24, tier: 'medium', liftFt: 0, typedFt: 220 },
    { id: 'f2', from: 'Line 2 EOL', to: 'Wrapper Infeed', thru: 24, tier: 'medium', liftFt: 0, typedFt: 190 },
    { id: 'f3', from: 'Line 3 EOL', to: 'Wrapper Infeed', thru: 18, tier: 'medium', liftFt: 0, typedFt: 100 },
    { id: 'f4', from: 'Wrapper Outfeed', to: 'Warehouse Infeed', thru: 66, tier: 'medium', liftFt: 3, typedFt: 120 },
  ]
  return { layout: { points: P, segments: S, locations: L, chargers, parking, bg: null }, flows }
}
if (typeof module !== 'undefined') module.exports = { sampleProject }
