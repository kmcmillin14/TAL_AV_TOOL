# Fleet simulation — proof of concept (reference only)

TAL-authored proof of concept for the Simulate module. **Reference, not product code:** the
engine is ported to TypeScript in `src/calc/sim/` (see
`docs/superpowers/specs/2026-11-10-fleet-simulation-design-v2.md` §11). Nothing here is
imported by the app, and nothing here may be shipped as-is.

| File | Status | What it is |
|---|---|---|
| `engine.js` | received 2026-11-10 | Working engine: graph + Dijkstra, zone locks, dead-end spur rule, nearest-claims-first, zone handover, following, gridlock detection, battery/charging, results + verdict. Single vehicle type (CB18 hard-coded), straight segments. |
| `sample.js` | received 2026-11-10 | Hand-drawn sample layout (3 line EOLs → wrapper → warehouse conveyor, 4 chargers, 2 parking) used by acceptance test 9. |
| `app.js` | **not received** | POC UI (layout editor + run view). Interactions reference only. |
| `cb18-top.png` | **not received** | Owner-supplied top-down CB18 sprite (forks toward −x). Until supplied, CB18 is drawn as its JSON footprint shape. |
| `point-icons.html` / `.png` | **not received** | Approved icon sheet. Not blocking: the icon paths are in the spec v2 §5.2. |

**Baseline measured 2026-11-10** (`engine.js` + `sample.js`, pace 70%, safety 3 ft, random
arrivals, 16 h, charge at 30% / resume 60%): fleets 3–6 × seeds 1–6 × demand 100/130% =
48 runs, **0 gridlocks**, ~0.65 s per run in Node. Seed 1: fleet 3 @100% *Tight* (89% busy),
fleet 4 @100% *Meets*, fleet 3 @130% *Falls short*. The Fleet Engine formula sizes this
sample at 3 (raw 2.66). The TypeScript port must reproduce the zero-gridlock result
(acceptance test 9).

No vendor simulation code is or may be in this folder.
