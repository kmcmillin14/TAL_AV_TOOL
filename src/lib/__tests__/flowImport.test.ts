import { describe, it, expect } from 'vitest'
import { parseFlowImport } from '../flowImport'

describe('parseFlowImport', () => {
  it('parses TSV with a header row (synonyms, any order)', () => {
    const text = 'From\tTo\tDist (ft)\tMoves/hr\tLift height\nDock A\tStorage 1\t300\t55\t18\nDock B\tStorage 2\t450\t20\t0'
    const r = parseFlowImport(text)
    expect(r.headerDetected).toBe(true)
    expect(r.rows).toEqual([
      { origin: 'Dock A', destination: 'Storage 1', distanceFt: 300, thruPerHr: 55, liftHeightFt: 18 },
      { origin: 'Dock B', destination: 'Storage 2', distanceFt: 450, thruPerHr: 20, liftHeightFt: 0 },
    ])
    expect(r.skipped).toEqual([])
  })

  it('headerless CSV assumes origin, destination, distance, thru[, lift] order', () => {
    const r = parseFlowImport('Dock A,Rack 1,300,55\nDock B,Rack 2,120,10,4')
    expect(r.headerDetected).toBe(false)
    expect(r.rows[0]).toEqual({ origin: 'Dock A', destination: 'Rack 1', distanceFt: 300, thruPerHr: 55, liftHeightFt: 0 })
    expect(r.rows[1].liftHeightFt).toBe(4)
  })

  it('converts meters to feet when the distance header says (m)', () => {
    const r = parseFlowImport('origin\tdest\tdistance (m)\trate\nA\tB\t100\t10')
    expect(r.metersConverted).toBe(true)
    expect(r.rows[0].distanceFt).toBeCloseTo(328.1, 1)
  })

  it('skips bad rows with a line number and reason, keeps good ones', () => {
    const r = parseFlowImport('A,B,300,55\n,,100,5\nC,D,abc,5')
    expect(r.rows).toHaveLength(1)
    expect(r.skipped).toEqual([
      { line: 2, reason: 'no origin or destination' },
      { line: 3, reason: 'distance is not a number' },
    ])
  })

  it('handles thousands separators and quoted CSV cells', () => {
    const r = parseFlowImport('"Dock, North",Rack 1,"1,200",55')
    expect(r.rows[0]).toEqual({ origin: 'Dock, North', destination: 'Rack 1', distanceFt: 1200, thruPerHr: 55, liftHeightFt: 0 })
  })

  it('blank numeric cells default to 0; blank/whitespace input yields nothing', () => {
    expect(parseFlowImport('A,B,,').rows[0]).toEqual({ origin: 'A', destination: 'B', distanceFt: 0, thruPerHr: 0, liftHeightFt: 0 })
    expect(parseFlowImport('  \n \n').rows).toEqual([])
  })
})
