import { describe, expect, it } from 'vitest'
import type { DisplayInfo } from '../shared/types'
import { findSaved, pickDisplay, toDisplayInfos, toSavedDisplay } from './displays'

const d = (id: number, x: number, isPrimary = false): DisplayInfo => ({
  id,
  label: `Monitor ${id}`,
  x,
  y: 0,
  width: 1920,
  height: 1080,
  isPrimary,
})

describe('toDisplayInfos', () => {
  it('numbers monitors and appends the system label when present', () => {
    const result = toDisplayInfos(
      [
        { id: 10, label: '', bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        { id: 20, label: 'DELL U2720Q', bounds: { x: 1440, y: 0, width: 2560, height: 1440 } },
      ],
      10,
    )
    expect(result).toEqual([
      { id: 10, label: 'Monitor 1', x: 0, y: 0, width: 1440, height: 900, isPrimary: true },
      { id: 20, label: 'Monitor 2 — DELL U2720Q', x: 1440, y: 0, width: 2560, height: 1440, isPrimary: false },
    ])
  })
})

describe('pickDisplay', () => {
  const displays = [d(1, 0, true), d(2, 1920), d(3, 3840)]

  it('uses the saved display when its id still exists', () => {
    expect(pickDisplay(toSavedDisplay(displays[2]), displays).id).toBe(3)
  })

  it('matches by bounds when the id changed', () => {
    const saved = { id: 99, x: 1920, y: 0, width: 1920, height: 1080 }
    expect(pickDisplay(saved, displays).id).toBe(2)
  })

  it('defaults to the first non-primary display with nothing saved', () => {
    expect(pickDisplay(undefined, displays).id).toBe(2)
  })

  it('falls back to the first non-primary display when the saved one is gone', () => {
    const saved = { id: 99, x: 9999, y: 0, width: 800, height: 600 }
    expect(pickDisplay(saved, displays).id).toBe(2)
  })

  it('falls back to the primary display when it is the only one', () => {
    expect(pickDisplay(undefined, [d(1, 0, true)]).id).toBe(1)
  })
})

describe('findSaved', () => {
  it('returns undefined when nothing matches', () => {
    expect(findSaved({ id: 99, x: 5, y: 5, width: 1, height: 1 }, [d(1, 0, true)])).toBeUndefined()
  })

  it('returns undefined when nothing is saved', () => {
    expect(findSaved(undefined, [d(1, 0, true)])).toBeUndefined()
  })
})
