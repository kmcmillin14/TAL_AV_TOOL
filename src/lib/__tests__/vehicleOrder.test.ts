import { describe, it, expect } from 'vitest'
import { sortByQualification, statusRank } from '../vehicleOrder'
import type { Vehicle } from '../vehicleLibrary'

const veh = (id: string) => ({ id, name: id.toUpperCase() } as unknown as Vehicle)

describe('sortByQualification', () => {
  it('orders GREEN, YELLOW, INCOMPLETE, RED; unknown status last; stable within a band', () => {
    const vehicles = [veh('a'), veh('b'), veh('c'), veh('d'), veh('e')]
    const status = new Map([
      ['a', 'RED'], ['b', 'GREEN'], ['c', 'INCOMPLETE'], ['d', 'YELLOW'],
    ] as const)
    const sorted = sortByQualification(vehicles, status as never)
    expect(sorted.map(v => v.id)).toEqual(['b', 'd', 'c', 'a', 'e'])
  })
  it('statusRank covers all four statuses', () => {
    expect(statusRank('GREEN')).toBeLessThan(statusRank('YELLOW'))
    expect(statusRank('YELLOW')).toBeLessThan(statusRank('INCOMPLETE'))
    expect(statusRank('INCOMPLETE')).toBeLessThan(statusRank('RED'))
  })
})
