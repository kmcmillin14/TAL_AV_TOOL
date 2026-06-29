# Team exercise — Michelin tire-putaway pilot (end-to-end)

A 15-minute run through the whole flow: fill out the **customer questionnaire**, export it, then
import it into the **app** and size a fleet. Uses a realistic Michelin distribution-center scenario.

> **Before sharing:** replace the two links below with your Vercel URLs (see `docs/DEPLOYMENT.md`).
>
> - **Questionnaire (customer):** `https://REPLACE-ME-questionnaire.vercel.app/questionnaire`
> - **App (engineer):** `https://REPLACE-ME-app.vercel.app`

---

## The scenario

Michelin's Greenville, SC distribution center wants to pilot AGVs to **unload trailers and put
pallets of tires away into reserve racking**. Three shifts, six days, seasonal peaks, a long-standing
Toyota lift-truck fleet but no AGVs yet.

## Part 1 — Fill out the questionnaire (play the customer)

Open the **Questionnaire** link and enter the values below. Nothing is required; this set produces a
coherent result. Watch the section scroller (left) track progress, and the conditional fields appear
as you answer (e.g. RFQ, CAD, WMS).

| Section | Field | Value |
|---|---|---|
| **01 About you** | Customer / company | Michelin North America |
| | Facility location | 1 Parkway South, Greenville, SC *(try the address finder)* |
| | Your name / job title | Dana Whitfield / Distribution Operations Manager |
| | Your email | dana.whitfield@example.com |
| **02 Vehicles** | Vehicles of interest | **CB18 AGF** (counterbalance forklift) |
| **03 What you move** | Unit / load type | Standard Pallet |
| | Max load weight | 2200 lbs |
| | L × W × H | 48 × 40 × 65 in |
| **04 How it's moved** | Pick from / Set down at | Trailer → Rack |
| | Type of handling | Forklift — lifts to height |
| | Transfer height | 18 ft |
| | Specialty applications | Trailer unloading, High reach |
| **05 Where it runs** | Narrowest aisle | 11 ft · Floor: Smooth · Indoor · Ambient |
| **06 Site readiness** | Facility size / dock doors | 480,000 sq ft / 32 · Network ready: Yes · Walkthrough: Yes |
| **07 Throughput & flows** | Mode | Per-flow detail |
| | Flow 1 | Inbound Dock → Reserve Rack A · 280 ft · 45/hr |
| | Flow 2 | Reserve Rack A → Pick Face · 360 ft · 35/hr |
| **08 Schedule** | Shifts / hours / days | 3 / 8 / Mon–Sat · 2 breaks × 20 min |
| **10 Opportunity** | Stage / budget | Budgeting / $1.5M–$3M |
| | Decision / go-live | 2026-09-30 / 2027-04-01 |
| **11 TAL / Toyota** | Current Toyota forklifts | ~15 counterbalance + 6 reach trucks |
| **12 Why & today** | Drivers | Labor availability, Throughput / capacity, Safety |

Then click **Export** (top-right toolbar). A TAL-branded **PDF downloads** (the project data is
embedded inside it). That PDF is what a real customer would email back.

> **Shortcut / answer key:** `samples/michelin-questionnaire.json` is the same scenario. You can
> import it directly in Part 2 instead of exporting your own, or compare it against what you filled in.

## Part 2 — Import & size the fleet (play the engineer)

1. Open the **App** link → you land on **Step 00 (Project Setup)**.
2. Click **Import Customer Questionnaire** → choose the **PDF** you just exported (or
   `michelin-questionnaire.json`). You'll see "Loaded ✓" and it opens **Step 1**.
3. **Step 1 — Application:** confirm the imported values (loads, transfer, environment, schedule,
   flows). Note the TAL rep / install date carried over from the questionnaire.
4. **Step 2 — Vehicle matrix:** see which vehicles qualify (green / yellow / red) for a 2,200 lb
   pallet lifted to 18 ft. CB18 should qualify; note why others don't.
5. **Step 3 — Fleet Engine:** the two flows are already there. Assign a vehicle per flow and watch
   the cycle-time + fleet count update. (The engineer assigns vehicles here — never the customer.)
6. **Step 4 — ROM dashboard:** review fleet size, CAPEX range, payback, and the assumptions panel.
   Try the throughput-scenario driver and full-screen a tile.

## Discussion points
- Where did **per-flow** detail change the answer vs a single average throughput?
- How did **18 ft high reach** + **2,200 lb** narrow the vehicle matrix?
- What did the questionnaire **not** capture that the engineer had to add (operators, ROM economics)?
- How would **3 shifts × 6 days** affect the charging adder and the recommended fleet?

## Reset
On the app, use the **trash icon** in the header to clear the project, or import the sample again for
a fresh run. The questionnaire's **Clear** (trash icon) wipes the form + its saved draft.
