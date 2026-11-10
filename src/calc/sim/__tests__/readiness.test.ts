import { describe, expect, it } from 'vitest'
import { runBlocker } from '../readiness'
import { LIBRARY, corridor } from './fixtures'

const ok = { id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }
const ready = (flows: object[], layout = corridor(100)) => runBlocker({ layout, flows: flows as never, vehicles: LIBRARY })

describe('runBlocker (acceptance 1: no layout → Run disabled)', () => {
  it('no layout, or a layout without routes, asks for routes first', () => {
    expect(runBlocker({ vehicles: LIBRARY })).toBe('noRoutes')
    expect(ready([ok], { points: corridor(100).points, segments: [] })).toBe('noRoutes')
  })

  it('a loaded drawing must be scaled before running', () => {
    const layout = { ...corridor(100), background: {} }
    expect(runBlocker({ layout, flows: [ok], vehicles: LIBRARY })).toBe('unscaled')
    expect(runBlocker({ layout: { ...layout, background: { scale: {} } }, flows: [ok], vehicles: LIBRARY })).toBeNull()
  })

  it('a flow the engine can run enables Run', () => {
    expect(ready([ok])).toBeNull()
  })

  it.each([
    ['no flows', []],
    ['not linked', [{ ...ok, toPointId: undefined }]],
    ['a point that is gone', [{ ...ok, toPointId: 'gone' }]],
    ['Drop → Pick', [{ ...ok, fromPointId: 'B', toPointId: 'A' }]],
    ['a charger as the drop', [{ ...ok, toPointId: 'C1' }]],
    ['no moves per hour', [{ ...ok, thruPerHr: 0 }]],
    ['no vehicle', [{ ...ok, vehicleId: undefined }]],
  ])('the engine would skip it (%s) → still blocked', (_why, flows) => {
    expect(ready(flows)).toBe('noFlows')
  })

  it('points with no route between them do not count', () => {
    const layout = corridor(100)
    layout.points.push({ id: 'D', x: 500, y: 500, type: 'stand', role: 'drop' })
    expect(ready([{ ...ok, toPointId: 'D' }], layout)).toBe('noFlows')
  })
})
