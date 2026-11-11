// Fleet Simulation project data (spec v2 §4.5). Every field is optional and nothing has a
// default, so a project without a simulation parses — and round-trips — exactly as before.
// Units: feet, seconds, ft/s, degrees. Rack/lane areas arrive with Milestone 7, with the code that
// reads them.
import { z } from 'zod'

const xy = z.object({ x: z.number(), y: z.number() })

export const simPointSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  type: z.enum(['junction', 'stand', 'conveyor', 'machine', 'dock', 'charger', 'parking']),
  role: z.enum(['pick', 'drop', 'pickDrop']).optional(),
  name: z.string().max(80).optional(),
  heightFt: z.number().min(0).max(100).optional(),
  /** Equipment footprint, ft (width across the approach × length along it). */
  footprintFt: z.object({ w: z.number().positive(), l: z.number().positive() }).optional(),
  /** Direction a vehicle travels into the position, degrees; absent → along its route. */
  approachHeadingDeg: z.number().optional(),
  handshakeSec: z.number().min(0).max(3600).optional(),
})

export const simSegmentSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  dir: z.enum(['two', 'ab', 'ba']),
  lane: z.enum(['single', 'two']).optional(),
  speedLimitFps: z.number().positive().optional(),
  curve: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('arc'), mid: xy }),
    z.object({ kind: z.literal('bezier'), c1: xy, c2: xy }),
  ]).optional(),
})

/** A fixed object (wall, column, rack face…), a rectangle in feet — what clearances are measured to. */
export const simObjectSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive().max(5000),
  h: z.number().positive().max(5000),
  rotationDeg: z.number().optional(),
  name: z.string().max(80).optional(),
})

/** The background drawing. The image itself (`data`) only ever travels in an exported revision
 *  file — browser storage keeps the rest (D-4); see `src/lib/storage.ts`. */
export const simBackgroundSchema = z.object({
  kind: z.enum(['pdf', 'image']),
  fileName: z.string().max(260),
  /** PDF page number (1-based). */
  page: z.number().int().min(1).optional(),
  /** Fingerprint of the source file, to recognise it when re-selected after a reload. */
  fingerprint: z.string().max(128),
  widthPx: z.number().positive().optional(),
  heightPx: z.number().positive().optional(),
  /** Feet per pixel to show an unscaled drawing at — carried over when a scaled drawing is replaced,
   *  so the new one appears at about the right size until its scale is set. */
  unscaledFtPerPx: z.number().positive().optional(),
  /** The layout already held routes when this drawing was loaded: they are in true feet, so setting
   *  this drawing's first scale does not resize them. */
  layoutPredates: z.boolean().optional(),
  /** Two clicked points (drawing pixels) and the real length between them. */
  scale: z.object({ a: xy, b: xy, lengthFt: z.number().positive() }).optional(),
  /** data: URL of the rendered page or image — export files only. */
  data: z.string().max(7_000_000).optional(),
})

export const simLayoutSchema = z.object({
  points: z.array(simPointSchema).max(2000),
  segments: z.array(simSegmentSchema).max(5000),
  objects: z.array(simObjectSchema).max(2000).optional(),
  background: simBackgroundSchema.optional(),
})

export const simSettingsSchema = z.object({
  /** Vehicles per vehicle id. */
  fleet: z.record(z.string(), z.number().int().min(0).max(500)).optional(),
  demandPct: z.number().min(1).max(500).optional(),
  seed: z.number().int().min(1).optional(),
  replications: z.number().int().min(1).max(50).optional(),
  /** Run assumptions (Run → Assumptions): pace as % of rated speed (D-3 default 70), the following
   *  gap beyond the envelope, ft, and how orders arrive. */
  pacePct: z.number().min(10).max(100).optional(),
  safetyFt: z.number().min(0).max(30).optional(),
  arrivals: z.enum(['regular', 'random']).optional(),
  /** Inspector overrides in one place: `vehicleId.field` / `pointId.field` → value (source chip "Override"). */
  overrides: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
  /** ANSI/ITSDF B56.5 clearance rule (D-2): 6 in per side below 1.2 m/s, 0.5 m at or above,
   *  shared between two vehicles on a two-way segment. */
  clearance: z.object({
    thresholdFps: z.number().positive(),
    lowSpeedIn: z.number().min(0),
    fullSpeedIn: z.number().min(0).nullable(),
    sharedBetweenVehicles: z.boolean(),
    edition: z.string().optional(),
  }).optional(),
})

export type SimLayoutData = z.infer<typeof simLayoutSchema>
export type SimSettingsData = z.infer<typeof simSettingsSchema>
