import { describe, expect, it } from 'vitest'
import { readinessChecks, runBlocker } from '../readiness'
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

describe('readinessChecks ("Ready to run?")', () => {
  const run = (flows: object[], over: { fleetNeeded?: number; layout?: ReturnType<typeof corridor> } = {}) =>
    readinessChecks({ layout: over.layout ?? corridor(100), flows: flows as never, vehicles: LIBRARY, fleetNeeded: over.fleetNeeded ?? 2 })

  it('a complete layout has nothing to report', () => {
    expect(run([ok])).toEqual([])
  })

  it('asks for routes first, and for a scale on a loaded drawing', () => {
    expect(readinessChecks({ vehicles: LIBRARY, fleetNeeded: 1 })[0]).toMatchObject({ level: 'bad', text: expect.stringContaining('Draw routes') })
    expect(run([ok], { layout: { ...corridor(100), background: {} } as never })[0]).toMatchObject({ level: 'bad', text: expect.stringContaining('not scaled') })
  })

  it('needs a home for every vehicle and says when chargers are fewer than vehicles', () => {
    expect(run([ok], { fleetNeeded: 3 }).map(c => c.level)).toEqual(['bad', 'info'])
  })

  it('lists flows left off the layout, points not connected, and flows with no route', () => {
    const layout = corridor(100)
    layout.points.push({ id: 'D', x: 500, y: 500, type: 'stand', role: 'drop', name: 'Far' })
    const checks = run([ok, { ...ok, id: 'g', toPointId: 'D' }, { id: 'typed' }], { layout })
    expect(checks.map(c => c.text).join(' | ')).toMatch(/Not connected: Far.*1 Sizing flow is not on the layout.*no route/)
  })
})
