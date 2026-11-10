import type { StoredProject } from './storage'

/** What the persistent header shows about a project. */
export interface HeaderData {
  id: string
  projectName: string
  customerName: string
  facilityLocation?: string | null
  versionNumber: string
  bastianRep?: string | null
  opportunityNumber?: string | null
  opportunityType?: 'opp' | 'lead'
  createdAt?: string
  step1Complete: boolean
  step2Complete: boolean
}

/** The header's view of a stored project — one mapping for every page that shows the header. */
export function headerFromProject(project: StoredProject): HeaderData {
  return {
    id: project.id,
    projectName: project.projectName ?? '',
    customerName: project.customerName ?? '',
    facilityLocation: project.facilityLocation,
    versionNumber: project.versionNumber,
    bastianRep: project.bastianRep,
    opportunityNumber: project.opportunityNumber,
    opportunityType: project.opportunityType,
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }
}
