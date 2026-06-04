import { partialProjectSchema, type PartialProjectFormData } from './validations/schemas'

const STORAGE_KEY = 'tal:projects'

/** Embedded JSON payload schema version. Bump when the project shape changes. */
export const SCHEMA_VERSION = 1

export interface StoredProject extends PartialProjectFormData {
  id: string
  createdAt: string
  updatedAt: string
  versionNumber: string
  step1Complete: boolean
  step2Complete: boolean
  step3Complete: boolean
  step4Complete: boolean
  step5Complete: boolean
  /** Snapshot of the project as it was BEFORE the most recent updateProject call. Single-level undo. */
  _undoSnapshot?: Omit<StoredProject, '_undoSnapshot'>
}

const defaultFields = (): Omit<StoredProject, 'id' | 'createdAt' | 'updatedAt'> => ({
  projectName: '',
  customerName: '',
  facilityLocation: undefined,
  bastianRep: undefined,
  opportunityNumber: undefined,
  opportunityType: 'opp',
  versionNumber: '',
  step1Complete: false,
  step2Complete: false,
  step3Complete: false,
  step4Complete: false,
  step5Complete: false,
  maxLoadWeightLbs: 0,
  typicalUnitType: '',
  palletBottomBoard: undefined,
  customPalletDescription: undefined,
  otherUnitTypeDescription: undefined,
  loadLengthIn: undefined,
  loadWidthIn: undefined,
  loadHeightIn: undefined,
  transferMethod: '',
  deliveryPattern: '',
  maxLiftHeightFt: undefined,
  minAisleWidthFt: 0,
  floorCondition: '',
  shiftsPerDay: 1,
  hoursPerShift: 8,
  operatingDaysPattern: '',
  operatingDaysCustom: undefined,
  breaksPerShift: 0,
  breakDurationMin: 0,
  requiredThroughputPerHour: 0,
  avgDistanceFt: 0,
  distanceType: 'one_way',
  operatorsPerShift: 0,
  rampDistanceFt: 0,
  maxRampGrade: 0,
  oemDealer: undefined,
  dealershipName: undefined,
  dealerRep: undefined,
  certifications: [],
  interlocks: [],
  flows: [],
  flowGroups: [],
  flowGroupColors: {},
  otherAGVs: false,
  otherAGVVendor: undefined,
  tempMinF: undefined,
  tempMaxF: undefined,
  outdoorRequired: false,
  freezerCapable: false,
  dustMoisture: undefined,
  wmsRequired: false,
  wmsVendor: undefined,
  projectNotes: undefined,
})

function generateId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// In-memory cache of the parsed projects array. Parsing the whole localStorage
// blob on every read — and the per-second `canUndo` poll in PersistentHeader —
// was a primary source of UI lag. We parse once, keep the array in module
// memory as the session's source of truth, and coalesce disk writes.
let cache: StoredProject[] | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

type ProjectsListener = () => void
const listeners = new Set<ProjectsListener>()

/** Subscribe to project mutations (fires after every create/update/delete/undo/
 *  clear/import, and on cross-tab storage changes). Returns an unsubscribe fn.
 *  Lets the UI refresh derived state (e.g. undo availability) without polling. */
export function subscribeProjects(cb: ProjectsListener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function notify(): void {
  for (const cb of listeners) cb()
}

function readAll(): StoredProject[] {
  if (cache) return cache
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    cache = []
  }
  return cache
}

function flush(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (!dirty || cache == null || typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)) } catch { /* quota */ }
  dirty = false
}

// Updates the in-memory cache immediately (so the current session reads live
// data with no re-parse — including step-to-step client navigation, which keeps
// this module loaded) and coalesces the localStorage write on a short timer.
function writeAll(projects: StoredProject[]): void {
  cache = projects
  dirty = true
  notify()
  if (typeof window === 'undefined') return
  if (!flushTimer) flushTimer = setTimeout(flush, 300)
}

/** Drop the in-memory cache so the next read re-parses localStorage. Used by
 *  tests (the module-level cache otherwise leaks across cases) and available for
 *  any forced re-sync. */
export function resetProjectsCache(): void {
  cache = null
}

if (typeof window !== 'undefined') {
  // The coalesced write may still be pending when the tab closes/reloads.
  window.addEventListener('beforeunload', flush)
  window.addEventListener('pagehide', flush)
  // Another tab wrote storage → drop our cache so the next read re-syncs.
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cache = null
      notify()
    }
  })
}

export function listProjects(): StoredProject[] {
  return [...readAll()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getProject(id: string): StoredProject | null {
  return readAll().find(p => p.id === id) ?? null
}

export function findOrCreateEntryProject(): StoredProject {
  const all = readAll()
  const empty = all.find(p =>
    !p.projectName &&
    !p.customerName &&
    !p.facilityLocation &&
    !p.bastianRep
  )
  if (empty) return empty
  return createProject({})
}

export function createProject(input: PartialProjectFormData): StoredProject {
  const data = partialProjectSchema.parse(input)
  const now = new Date().toISOString()
  const project: StoredProject = {
    ...defaultFields(),
    ...data,
    projectName: data.projectName ?? '',
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }
  const all = readAll()
  all.push(project)
  writeAll(all)
  return project
}

export interface MetaOverrides {
  versionNumber?: string
  createdAt?: string
}

export function updateProject(
  id: string,
  input: PartialProjectFormData,
  meta?: MetaOverrides,
): StoredProject | null {
  const data = partialProjectSchema.parse(input)
  const all = readAll()
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) return null
  const existing = all[idx]
  // Capture the pre-change state for single-level undo.
  const { _undoSnapshot: _ignore, ...snapshot } = existing
  void _ignore
  // Apply ONLY the fields the caller actually passed. Zod v4 `.partial()` does
  // not strip `.default()`, so `data` re-injects defaults (flows: [], flowGroups: [],
  // certifications: []…) for absent keys; spreading `...data` would clobber the
  // existing stored values. Use the raw `input` keys to pick the validated values.
  const updated: StoredProject = { ...existing }
  const validated = data as Record<string, unknown>
  const target = updated as unknown as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key in validated) target[key] = validated[key]
  }
  updated._undoSnapshot = snapshot
  updated.id = existing.id
  updated.createdAt = meta?.createdAt ?? existing.createdAt
  updated.updatedAt = new Date().toISOString()
  updated.versionNumber = meta?.versionNumber ?? existing.versionNumber
  all[idx] = updated
  writeAll(all)
  return updated
}

export function deleteProject(id: string): boolean {
  const all = readAll()
  const next = all.filter(p => p.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

/** Whether the given project has an undo snapshot available. */
export function canUndo(id: string): boolean {
  const project = getProject(id)
  return !!project?._undoSnapshot
}

/**
 * Revert the project to its state before the last updateProject call.
 * Returns the restored project, or null if there's nothing to undo.
 */
export function undoLastChange(id: string): StoredProject | null {
  const all = readAll()
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) return null
  const existing = all[idx]
  if (!existing._undoSnapshot) return null
  const restored: StoredProject = {
    ...existing._undoSnapshot,
    updatedAt: new Date().toISOString(),
    // After undo, there's no further snapshot to revert to (single-level).
    _undoSnapshot: undefined,
  }
  all[idx] = restored
  writeAll(all)
  return restored
}

/**
 * Reset every data field on the project to defaults while keeping its
 * id and createdAt. Captures an undo snapshot first so the user can
 * recover from a misclick on the Clear All confirm.
 */
export function clearProject(id: string): StoredProject | null {
  const all = readAll()
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) return null
  const existing = all[idx]
  const { _undoSnapshot: _ignore, ...snapshot } = existing
  void _ignore
  const cleared: StoredProject = {
    ...defaultFields(),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    _undoSnapshot: snapshot,
  }
  all[idx] = cleared
  writeAll(all)
  return cleared
}

export function exportProjectJson(id: string): string | null {
  const project = getProject(id)
  if (!project) return null
  return JSON.stringify(project, null, 2)
}

export function downloadProject(id: string): void {
  const project = getProject(id)
  if (!project) return
  const filename = `${(project.projectName || 'project').replace(/[^a-z0-9-_]+/gi, '_')}_${project.versionNumber}.json`
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importProjectFromJson(json: string): StoredProject {
  const parsed = JSON.parse(json)

  // Detect wrapped envelope: { schemaVersion, exportedAt?, project }
  const isWrapped =
    parsed != null &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>).schemaVersion === 'number' &&
    (parsed as Record<string, unknown>).project != null &&
    typeof (parsed as Record<string, unknown>).project === 'object'

  let rawProject: Record<string, unknown>
  if (isWrapped) {
    const version = (parsed as Record<string, number>).schemaVersion
    if (version > SCHEMA_VERSION) {
      throw new Error(
        'This file was created with a newer version of the calculator. Update the app to import it.',
      )
    }
    // Future: run migrations forward when version < SCHEMA_VERSION
    rawProject = (parsed as Record<string, Record<string, unknown>>).project
  } else {
    rawProject = parsed as Record<string, unknown>
  }

  const data = partialProjectSchema.parse(rawProject)
  const now = new Date().toISOString()
  const imported: StoredProject = {
    ...defaultFields(),
    ...data,
    step1Complete: Boolean(rawProject.step1Complete),
    step2Complete: Boolean(rawProject.step2Complete),
    step3Complete: Boolean(rawProject.step3Complete),
    step4Complete: Boolean(rawProject.step4Complete),
    step5Complete: Boolean(rawProject.step5Complete),
    versionNumber: typeof rawProject.versionNumber === 'string'
      ? rawProject.versionNumber
      : '',
    projectName: data.projectName ?? '',
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }
  const all = readAll()
  all.push(imported)
  writeAll(all)
  return imported
}
