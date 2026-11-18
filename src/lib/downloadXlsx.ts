// The internal-model download, shared by the header's Export menu and 06 Export. The workbook builder is
// loaded on demand so the page bundle stays small; a failure is reported once, the same way everywhere.

import { fetchVehiclesCached } from './vehicleCache'
import { reportError } from './notify'
import type { StoredProject } from './storage'

export async function downloadXlsx(project: StoredProject): Promise<void> {
  try {
    const [{ downloadProjectXlsx }, vehicles] = await Promise.all([import('./xlsxExport'), fetchVehiclesCached()])
    await downloadProjectXlsx(project, vehicles)
  } catch (err) {
    reportError('export:xlsx', err, 'Could not generate the workbook. Please retry; if it persists, export a JSON backup.')
  }
}
