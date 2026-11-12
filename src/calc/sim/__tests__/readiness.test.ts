import { describe, expect, it } from 'vitest'
import { readinessChecks } from '../readiness'
import { LIBRARY, corridor } from './fixtures'

const ok = { id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }
type Input = Parameters<typeof readinessChecks>[0]
/** What blocks Run (the "bad" checks), with no fleet to place. */
const blocked = (i: Omit<Input, 'vehicles' | 'fleetNeeded'>) => readinessChecks({ ...i, vehicles: LIBRARY, fleetNeeded: 0 }).filter(c => c.level === 'bad').map(c => c.text)
const ready = (flows: object[], layout = corridor(100)) => blocked({ layout, flows: flows as never })
const NO_FLOW = expect.arrayContaining([expect.stringMatching(/^No flow runs yet/)])

describe('Run is blocked until a flow can run (acceptance 1: no layout → Run disabled)', () => {
  it('no layout, or a layout without routes, asks for routes first', () => {
    expect(blocked({})).toEqual([expect.stringMatching(/^Draw routes/)])
    expect(ready([ok], { points: corridor(100).points, segments: [] })).toEqual([expect.stringMatching(/^Draw routes/)])
  })

  it('a loaded drawing must be scaled before running', () => {
    const layout = { ...corridor(100), background: {} }
    expect(blocked({ layout, flows: [ok] })).toEqual([expect.stringMatching(/not scaled/)])
    expect(blocked({ layout: { ...layout, background: { scale: {} } }, flows: [ok] })).toEqual([])
  })

  it('a flow the engine can run enables Run', () => {
    expect(ready([ok])).toEqual([])
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
    expect(ready(flows)).toEqual(NO_FLOW)
  })

  it('points with no route between them do not count', () => {
    const layout = corridor(100)
    layout.points.push({ id: 'D', x: 500, y: 500, type: 'stand', role: 'drop' })
    expect(ready([{ ...ok, toPointId: 'D' }], layout)).toEqual(NO_FLOW)
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

  it('points each check at what it is about and the tool that fixes it (validation)', () => {
    const layout = corridor(100)
    layout.points.push({ id: 'D', x: 500, y: 500, type: 'stand', role: 'drop', name: 'Far' }, { id: 'E', x: 600, y: 500, type: 'stand', role: 'drop', name: 'Farther' })
    const checks = run([ok, { ...ok, id: 'g', toPointId: 'D' }, { id: 'typed' }], { layout })
    const of = (re: RegExp) => checks.find(c => re.test(c.text))
    // one row per loose point
    expect(checks.filter(c => c.text.startsWith('Not connected')).map(c => c.target)).toEqual([{ kind: 'point', id: 'D' }, { kind: 'point', id: 'E' }])
    expect(of(/not on the layout/)).toMatchObject({ fix: 'flows' })
    expect(of(/no route/)).toMatchObject({ level: 'bad', target: { kind: 'flow', id: 'g' }, fix: 'route' })
    expect(readinessChecks({ vehicles: LIBRARY, fleetNeeded: 1 })[0]).toMatchObject({ fix: 'route' })
  })
})
