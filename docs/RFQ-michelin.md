# Customer RFQ — Michelin North America (team exercise)

A realistic request-for-quote to work cold. **No field-by-field guide** — read the RFQ, then capture
it in the AV Questionnaire the way you'd scope any opportunity, export the PDF, import it on Step 00,
and size the fleet. The point is to feel how the tool flows from a real (slightly messy) customer ask.

- **AV Questionnaire:** `https://REPLACE-ME-questionnaire.vercel.app/questionnaire`
- **App:** `https://REPLACE-ME-app.vercel.app`

---

## REQUEST FOR QUOTE

**Michelin North America — Distribution Operations**
**RFQ No.:** MNA-DC-2026-0147
**Issued:** June 15, 2026  **Responses due:** July 31, 2026
**Decision target:** September 30, 2026  **Desired go-live:** Spring 2027 (target April 1, 2027)
**Buyer contact:** Dana Whitfield, Distribution Operations Manager — dana.whitfield@example.com · (864) 555-0142
**Site:** Michelin Greenville Distribution Center, 1 Parkway South, Greenville, SC

### 1. Background
Michelin is evaluating automated vehicles to relieve labor pressure at our Greenville passenger/
light-truck tire DC. We run a long-standing Toyota lift-truck fleet (roughly 15 sit-down
counterbalance trucks and 6 reach trucks) but have **no AGVs/AMRs in production** today. An AS/RS
operates in an adjacent building and is **out of scope** for this request.

### 2. Scope of work
Automate a **single move: unload inbound trailers and put the pallets away into reserve racking**
("trailer → rack"). **Out of scope:** outbound trailer loading, pick-face replenishment, and order
picking — those remain manual for this phase. We may extend scope later if the pilot pays off.

### 3. What we move
Palletized passenger and light-truck tires on standard GMA pallets (48 × 40 in), stacked to roughly
65 in tall. A loaded pallet weighs **up to about 2,200 lb**. Loads are stable and shrink-wrapped.

### 4. Operation & volumes
Vehicles take pallets directly from the **inbound trailer** at the dock and deposit them into
**reserve racking**, with the top storage beam at about **18 ft**. A typical one-way travel from dock
to the reserve aisles is on the order of **300 ft**. During normal operation we move roughly **55
pallets per hour**; in peak receiving (spring and fall) bursts approach **80 pallets per hour**.

### 5. Facility & environment
~480,000 sq ft, 32 dock doors. Indoor, ambient (about 55–90 °F), smooth sealed-concrete floor.
Reserve aisles are **11 ft** wide. Building WiFi coverage is in place and IT will support
integration; a site walkthrough can be arranged on request.

### 6. Schedule
Three 8-hour shifts, **Monday through Saturday**, two 20-minute breaks per shift.

### 7. Integration & safety
The solution must interface with our **Manhattan Associates WMS**. The dock area has high-speed doors
and takeaway conveyors the vehicles will operate around (interlocks required). Equipment must meet
**ANSI B56.5**.

### 8. Commercial
Budgetary range for this phase is **$1.5M–$3M** (budgeting stage; not yet firm). Please include a
ROM fleet size, budgetary price range, and simple payback.

### 9. Drivers
Primary motivations: **labor availability**, **throughput / capacity** during peaks, and **safety**.

### 10. Response requested
Proposed vehicle type(s), recommended fleet size, ROM pricing range, and estimated payback for the
trailer → rack phase.

---

*Facilitator note: a filled reference version of this scenario is saved at
`samples/michelin-questionnaire.json` — keep it as an answer key; don't hand it out with the RFQ.*
