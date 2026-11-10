import type { SimPointType, SimRole } from '@/src/calc/sim/types'

/** Point types as the editor names them (spec v2 §5.2). */
export const POINT_LABEL: Record<SimPointType, string> = {
  junction: 'Junction', stand: 'Stand', conveyor: 'Conveyor', machine: 'Line / machine', dock: 'Dock door',
  charger: 'Charger', parking: 'Parking',
}
export const ROLE_OPTIONS: { id: SimRole; label: string }[] = [
  { id: 'pick', label: 'Pick' }, { id: 'drop', label: 'Drop' }, { id: 'pickDrop', label: 'Pick & drop' },
]
