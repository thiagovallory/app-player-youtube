import { describe, expect, it } from 'vitest'
import { createCompactController, type CompactWindow } from './compactMode'

function fakeWindow() {
  const w = {
    destroyed: false,
    bounds: { x: 100, y: 50, width: 440, height: 620 },
    min: [360, 480] as [number, number],
    frame: [0, 32] as [number, number],
    isDestroyed: () => w.destroyed,
    getBounds: () => ({ ...w.bounds }),
    getMinimumSize: () => [...w.min] as [number, number],
    getSize: () => [w.bounds.width, w.bounds.height] as [number, number],
    getContentSize: () => [w.bounds.width - w.frame[0], w.bounds.height - w.frame[1]] as [number, number],
    setMinimumSize: (a: number, b: number) => void (w.min = [a, b]),
    setContentSize: (a: number, b: number) => void (w.bounds = { ...w.bounds, width: a + w.frame[0], height: b + w.frame[1] }),
    setBounds: (b: { x: number; y: number; width: number; height: number }) => void (w.bounds = { ...b }),
  }
  return w
}

describe('createCompactController', () => {
  it('adds the frame height to the minimum size and sizes the content', () => {
    const w = fakeWindow()
    const c = createCompactController(() => w as CompactWindow)
    c.apply({ compact: true, height: 180 })
    expect(w.min).toEqual([320, 212])
    expect(w.getContentSize()).toEqual([440, 180])
  })
  it('restores size and minimum but keeps the current position', () => {
    const w = fakeWindow()
    const c = createCompactController(() => w as CompactWindow)
    c.apply({ compact: true, height: 180 })
    w.bounds = { ...w.bounds, x: 300, y: 10 }
    c.apply({ compact: false })
    expect(w.bounds).toEqual({ x: 300, y: 10, width: 440, height: 620 })
    expect(w.min).toEqual([360, 480])
  })
  it('keeps the first normal state when entering twice', () => {
    const w = fakeWindow()
    const c = createCompactController(() => w as CompactWindow)
    c.apply({ compact: true, height: 180 })
    c.apply({ compact: true, height: 220 })
    c.apply({ compact: false })
    expect(w.bounds).toEqual({ x: 100, y: 50, width: 440, height: 620 })
    expect(w.min).toEqual([360, 480])
  })
  it('does nothing when leaving without entering, or on a destroyed/missing window', () => {
    const w = fakeWindow()
    const c = createCompactController(() => w as CompactWindow)
    c.apply({ compact: false })
    expect(w.bounds).toEqual({ x: 100, y: 50, width: 440, height: 620 })
    w.destroyed = true
    c.apply({ compact: true, height: 180 })
    expect(w.min).toEqual([360, 480])
    createCompactController(() => null).apply({ compact: true, height: 180 })
  })
  it('reset forgets the saved state', () => {
    const w = fakeWindow()
    const c = createCompactController(() => w as CompactWindow)
    c.apply({ compact: true, height: 180 })
    c.reset()
    w.min = [320, 212]
    c.apply({ compact: false })
    expect(w.min).toEqual([320, 212])
  })
})
