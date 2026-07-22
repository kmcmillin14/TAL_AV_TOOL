// Legacy Excel fleet-sizing method — a FAITHFUL port of "Example Fleet Calcs.xlsx"
// (sheet "(01) Fleet Calculation"), reverse-engineered 2026-07-22. PURE.
//
// This REPLACES the earlier stated-hand-rule placeholder. The workbook is the
// authoritative legacy model; every constant/rule below is traced to a cell.
//
// ── Per-mission chain (rows 21–46) ────────────────────────────────────────────
//   C = roundtrip distance in metres  (input col P is ROUNDTRIP, in ft → ÷ ...)   TRUNC 2dp
//   D = velocity: C ≤ 100 m ? avgSpeed : avgSpeed × 1.2   (the ">100 m" bump)      TRUNC 2dp
//   E = mission time = C / D  (sec)                                                TRUNC 2dp
//   F = travel-time allowance = 0.2 × E                                            TRUNC 2dp
//   G = transfer time (sec) — per vehicle (CB18/ML2 derived from config; see below)
//   H = ROUNDUP(G + F + E, 0)                       route time, ceil per mission
//   I = H × frequency(occ/hr)
//   J = ROUNDUP(I / 3600, 3)                        vehicles for this mission
// ── Fleet total (rows 48–52) ──────────────────────────────────────────────────
//   raw      = Σ J                                  (J48)
//   charging = raw × chargeMult(shifts, hours)      (J49 = V13 schedule table)
//   buffer   = (raw + charging) × 0.20              (J50)
//   fleet    = ROUNDUP(raw + charging + buffer, 0)  (J51 — the ONLY final ceiling)

/** Truncate toward zero at `dp` decimals — Excel TRUNC. */
const trunc = (x: number, dp = 0) => Math.trunc(x * 10 ** dp) / 10 ** dp
/** Round UP at `dp` decimals — Excel ROUNDUP (ceil away from zero). */
const roundup = (x: number, dp = 0) => Math.ceil(x * 10 ** dp) / 10 ** dp

const FT_TO_M = 0.3048
const SPEED_BUMP_OVER_100M = 1.2
const TRAVEL_ALLOWANCE = 0.2
const BUFFER = 0.20

/** VehicleSpecs table (U20:X34) — the 5 vehicles under test. `avgSpeedMs` is the
 *  legacy single average speed; `transferSec` is the per-move transfer time.
 *  CB18 & ML2 transfer are workbook-DEFAULT-config derived (documented), because
 *  the sheet computes them from pick/drop type (CB18) and conveyor geometry (ML2):
 *   - CB18 75 s  = Conveyor pick (30) + Pallet-Rack drop (45)  [AC31, default config]
 *   - ML2  13.25 s = conveyor topper: 60 FPM, 36" zone, 3 zones [AH22, default config]
 *  8TB50A→"Tugger (4540kg)", 8HBC40A→"Pallet Truck (2725kg)" (owner-confirmed map). */
export interface LegacyVehicleSpec { avgSpeedMs: number; transferSec: number }
export const LEGACY_VEHICLE_SPECS: Record<string, LegacyVehicleSpec> = {
  cb18:    { avgSpeedMs: 1.3,               transferSec: 75 },
  ml2:     { avgSpeedMs: 1.1,               transferSec: 13.25 },
  m10:     { avgSpeedMs: 0.58,              transferSec: 30 },
  '8tb50a':{ avgSpeedMs: 1.0166666666666666, transferSec: 40 },
  '8hbc40a':{ avgSpeedMs: 1.0166666666666666, transferSec: 25 },
}

/** One mission's fractional vehicle demand (col J). Distance is ROUNDTRIP, feet. */
export function legacyMissionVehicles(
  roundtripFt: number, freqPerHr: number, spec: LegacyVehicleSpec,
): number {
  const distM = trunc(roundtripFt * FT_TO_M, 2)                        // C
  if (distM <= 0 || freqPerHr <= 0) return 0
  const speed = trunc(distM <= 100 ? spec.avgSpeedMs : spec.avgSpeedMs * SPEED_BUMP_OVER_100M, 2) // D
  if (speed <= 0) return 0
  const missionSec = trunc(distM / speed, 2)                          // E
  const allowance = trunc(TRAVEL_ALLOWANCE * missionSec, 2)           // F
  const routeSec = roundup(spec.transferSec + allowance + missionSec, 0) // H
  return roundup((routeSec * freqPerHr) / 3600, 3)                     // J
}

/** Charging multiplier on raw demand — the V13 schedule table (shifts × hours).
 *  Unknown combos → 0 (Excel IF chain falls through to FALSE). Note: legacy keys
 *  ONLY on shifts+hours, ignoring operating DAYS (no weekend credit — a known
 *  divergence from the app's v3 schedule-aware model). */
export function legacyChargingMultiplier(shifts: number, hours: number): number {
  const table: Record<string, number> = {
    '1x8': 0, '1x10': 0.15, '1x12': 0.2,
    '2x8': 0.15, '2x10': 0.2, '2x12': 0.3,
    '3x8': 0.3, '3x10': 0.3, '3x12': 0.3,
  }
  return table[`${shifts}x${hours}`] ?? 0
}

export interface LegacyMission { roundtripFt: number; freqPerHr: number }
export interface LegacySizing {
  raw: number; charging: number; buffer: number; fleet: number; utilization: number
}

/** Full legacy fleet size for a set of missions on one vehicle type + schedule. */
export function legacyFleetSize(
  missions: LegacyMission[], spec: LegacyVehicleSpec, shifts: number, hours: number,
): LegacySizing {
  const raw = missions.reduce((s, m) => s + legacyMissionVehicles(m.roundtripFt, m.freqPerHr, spec), 0)
  const charging = raw * legacyChargingMultiplier(shifts, hours)      // J49
  const buffer = (raw + charging) * BUFFER                            // J50
  const fleet = roundup(raw + charging + buffer, 0)                   // J51
  const utilization = fleet > 0 ? (raw + charging) / fleet : 0        // J52
  return { raw, charging, buffer, fleet, utilization }
}
