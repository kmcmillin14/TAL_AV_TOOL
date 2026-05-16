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

function readAll(): StoredProject[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(projects: StoredProject[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function listProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
  const updated: StoredProject = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: meta?.createdAt ?? existing.createdAt,
    updatedAt: new Date().toISOString(),
    versionNumber: meta?.versionNumber ?? existing.versionNumber,
  }
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
