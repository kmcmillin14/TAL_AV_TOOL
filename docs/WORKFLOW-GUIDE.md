# TAL AV Tool — Workflow Guide

**Audience:** TAL application engineers, sales reps, and dealer partners.

---

## MACRO — The Full Picture

```
CUSTOMER / DEALER                    TAL ENGINEER
─────────────────                    ────────────
Questionnaire                        Fleet Calculator
(talavquestionnaire.vercel.app)      (main app)

  Fill in 13 sections                  Import PDF
  Export PDF  ──────────────────────►  Step 1: Refine inputs
  (JSON embedded inside)               Step 2: Review vehicle matrix
                                       Step 3: Size the fleet
                                       Step 4: ROM + ROI dashboard
                                       Export customer deck (PPTX)
```

**Key principle:** The questionnaire captures *what the customer knows*. The main app is where the engineer *sizes and prices* the fleet. They share the same data schema — the PDF is the handoff artifact.

---

## MICRO — Step by Step

### Part 1 — Questionnaire (Customer / Dealer fills out)

URL: `talavquestionnaire.vercel.app`

The questionnaire has 13 sections. Customers work top to bottom; all fields are optional — they fill in what they know.

| § | Section | Key inputs | Why it matters |
|---|---------|------------|----------------|
| 01 | **General Info** | Submission type (Customer / Dealer / Partner / TAL Internal), Project name, Customer / company, Facility address (Google autocomplete), Contact name / role / email | Routes the submission; populates the main app header |
| 02 | **Vehicles** | Vehicles of interest, specific vehicle in mind | Helps engineer pre-filter the matrix |
| 03 | **What you move** | Unit load types (multi-select), dimensions, max weight | Drives weight + payload gates in Step 2 |
| 04 | **How it's moved** | Pick / drop context, transfer type, lift height, dwell time, charging preference | Drives transfer and lift gates; informs fleet charging model |
| 05 | **Where it runs** | Drive aisle width, racking aisle width, indoor/outdoor, temperature environment (ambient / refrigerated / freezer), floor condition, shared traffic, ramps | Drives environment gates; aisle widths are informational (not hard gates) |
| 06 | **Site readiness** | Facility sq ft, dock doors, network ready, CAD available | Context for engineer; CAD triggers a follow-up request |
| 07 | **Throughput & flows** | Avg throughput (moves/hr), peak throughput, avg distance, per-flow detail (origin → destination, distance, rate, distance type) | Primary fleet-sizing inputs; flows port directly into Step 3 |
| 08 | **Schedule** | Shifts/day, hours/shift, operating days, breaks | Determines available operating hours for fleet model |
| 09 | **Certs & controls** | Certifications (CE, UL, ATEX…), interlocks, WMS vendor + interface type, barcode scanning, tagging/scan method, hazard zone classification | Narrows eligible vehicles; surfaces integration complexity early |
| 10 | **Commercial** | Project stage, budget status, budget range, ROI target (yrs), RFQ, decision date, target go-live | Frames the opportunity; engineer uses for ROM / payback framing |
| 11 | **TAL / Toyota** | Current Toyota forklifts, history with TAL / Toyota | Relationship context; informs rep approach |
| 12 | **Why & today** | Automation drivers (chips), current process, total headcount, operators/shift doing this task, fully burdened rate ($/yr) | Labor offset calculation in ROM dashboard; motivations shape the deck |
| 13 | **Notes** | Free text | Anything that doesn't fit elsewhere |

**Exporting:**
- **Export PDF** — downloads a single PDF. The project JSON is embedded inside it. Send this file to your TAL engineer.
- **Send to TAL Engineer** — downloads the PDF and opens an email to `AppsEngineering@bastiansolutions.com` pre-addressed with the opportunity details. Attach the PDF and send.

---

### Part 2 — Handoff (TAL Engineer receives the PDF)

1. Open the main Fleet Calculator app.
2. On the **Step 00** project screen, click **Import** (or drag-and-drop the PDF).
3. The app extracts the embedded JSON and creates a new project pre-populated with all questionnaire answers.
4. Verify the import: project name, customer, and facility should appear in the header.

---

### Part 3 — Main App (TAL Engineer sizes the fleet)

#### Step 1 — Application

Refine what the customer submitted. The form mirrors the questionnaire fields — anything already filled in is pre-populated.

- **Loads tab**: confirm load type, weight, and dimensions. Add multiple load types if needed.
- **Transfer & lift**: set transfer type (forklift, lift table, conveyor, tow cart…) and heights.
- **Environment**: verify temperature, floor condition, aisle widths, ramps.
- **Schedule**: adjust shifts, hours, breaks if the customer under-specified.
- **Throughput**: set required moves/hr and add/edit per-flow rows (origin → destination → distance → rate).

> All fields are optional — a partial project is always valid. Step 2 skips gates for unset values.

#### Step 2 — Vehicle Matrix

Read-only qualification view. **No vehicle is selected here.**

Each vehicle card shows:
- **Traffic light** — GREEN (all gates pass), YELLOW (soft preference fails), RED (hard gate fails)
- Hard gates: weight capacity, transfer compatibility, lift height, temperature rating, certifications, transfer method
- Soft gates: aisle width recommendation, floor condition, outdoor rating

Use this step to verify which vehicles are in play before moving to sizing.

#### Step 3 — Fleet Engineer

This is where the engineer assigns vehicles and the system sizes the fleet.

1. **Add flows** (if not already imported from the questionnaire).
2. **Assign a vehicle** to each flow or flow group — the engineer always chooses; the app never auto-selects.
3. The fleet engine calculates:
   - Raw vehicles needed (throughput ÷ vehicle cycle capacity)
   - Charging buffer (opportunity vs. plug-in; overnight vs. continuous)
   - Final fleet count with headroom buffer (default 80% utilization target)
4. Review the **Fleet summary** — total units per vehicle type, binding constraints, charge method.

> Distance entry is **one-way**. The engine accounts for round-trip internally.

#### Step 4 — ROM Dashboard

Return-on-investment summary for the customer deck.

Key inputs (pre-populated from questionnaire; editable):
- **Operators displaced** (derived from `operatorsPerShift × shiftsPerDay`; overridable)
- **Fully burdened rate** ($/yr per operator — from §12)
- **ROI target** (yrs — from §10 Commercial)
- **Energy cost** ($/kWh)
- **Service life** (yrs)
- **Annual maintenance** (% of CapEx)

Output:
- Annual labor savings
- TCO over service life
- Payback period vs. ROI target (highlights if fleet pays back within customer's target)
- Payback chart (used in the PPTX customer deck)

#### Export

- **Export PPTX** — generates a customer-ready PowerPoint deck (one claim per slide, payback chart included).
- **Export PDF** — full project summary with embedded JSON (importable by another engineer).

---

## Quick Reference

| Action | Where |
|--------|-------|
| Customer fills in application details | Questionnaire §01–13 |
| Customer exports handoff file | Questionnaire → Export PDF |
| Engineer imports questionnaire | Main app Step 00 → Import |
| Engineer reviews vehicle eligibility | Main app Step 2 (read-only) |
| Engineer assigns vehicles + sizes fleet | Main app Step 3 |
| Engineer builds ROI case | Main app Step 4 |
| Generate customer deck | Main app Step 4 → Export PPTX |

---

## Data Flow — What moves where

```
Questionnaire field          →   Main app field
─────────────────────────────────────────────────
customerName                 →   Project header (Customer)
projectName                  →   Project header (Project)
facilityLocation             →   Project header (Location)
talRepName                   →   bastianRep (TAL Engineer)
targetGoLiveDate             →   desiredInstallDate
flows[]                      →   Step 3 flows (direct)
unitLoadTypes / loads[]      →   Step 1 loads (matrix qualification)
maxLoadWeightLbs             →   Weight gate (Step 2)
transferType                 →   Transfer gate (Step 2)
driveAisleWidthFt            →   Informational (not a gate)
rackingAisleWidthFt          →   Informational (not a gate)
shiftsPerDay × hoursPerShift →   Operating hours (fleet model)
requiredThroughputPerHour    →   Fleet sizing input (Step 3)
operatorsPerShift            →   Labor offset (Step 4 ROM)
fullyBurdenedRateUsdPerYear  →   Labor savings calc (Step 4)
roiTargetYears               →   Payback framing (Step 4)
certifications               →   Cert gate (Step 2)
temperatureEnvironment       →   Temp gate (Step 2)
```
