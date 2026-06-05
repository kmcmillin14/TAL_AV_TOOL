import type { ChargeMethod, ChargeRegime, Flow } from '@/src/calc/types'

/** The atomic patch the Fleet Engine persists — flows/groups (Flows tab) plus
 *  charging + buffer settings (Charging/Fleet tabs). All keys map to schema
 *  fields, so a partial patch is safe (see updateProject). */
export interface EnginePatch {
  flows?: Flow[]
  flowGroups?: string[]
  flowGroupColors?: Record<string, string>
  chargeRegime?: ChargeRegime
  bufferPct?: number
  chargeMethods?: Record<string, ChargeMethod>
}
