import { describe, expect, it } from 'vitest'
import { applyRows, diffRows, joinSteps } from '../editHistory'

type F = { id: string; thruPerHr: number; vehicleId?: string; fromPointId?: string }
const f1: F = { id: 'f1', thruPerHr: 10, vehicleId: 'cb18' }

describe('layout editor undo steps', () => {
  it('undo puts back only the fields the step changed — a Sizing edit made meanwhile survives', () => {
    const linked: F = { ...f1, fromPointId: 'p1' }
    const step = diffRows([f1], [linked])                         // the step linked the flow
    const meanwhile: F[] = [{ ...linked, thruPerHr: 25 }]          // Sizing (another tab) changed moves/h
    expect(applyRows(meanwhile, step, 'before')).toEqual([{ ...f1, thruPerHr: 25, fromPointId: undefined }])
  })

  it('undo removes a flow the step created; redo brings it back', () => {
    const made: F = { id: 'f2', thruPerHr: 0, fromPointId: 'p1' }
    const step = diffRows([f1], [f1, made])
    expect(applyRows([f1, made], step, 'before')).toEqual([f1])
    expect(applyRows([f1], step, 'after')).toEqual([f1, made])
  })

  it('typing in one field joins into one step with the first before and the last after', () => {
    const a = { before: 'L0', after: 'L1', flows: diffRows([f1], [{ ...f1, thruPerHr: 1 }]) }
    const b = { before: 'L1', after: 'L2', flows: diffRows([{ ...f1, thruPerHr: 1 }], [{ ...f1, thruPerHr: 12 }]) }
    const j = joinSteps(a, b)
    expect(j.before).toBe('L0'); expect(j.after).toBe('L2')
    expect(applyRows([{ ...f1, thruPerHr: 12 }], j.flows, 'before')).toEqual([f1])
  })
})
