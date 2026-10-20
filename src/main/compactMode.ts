import type { CompactRequest } from '../shared/validate'

type Bounds = { x: number; y: number; width: number; height: number }

// The subset of BrowserWindow used here (kept structural so it can be tested without electron).
export interface CompactWindow {
  isDestroyed(): boolean
  getBounds(): Bounds
  getMinimumSize(): number[]
  getSize(): number[]
  getContentSize(): number[]
  setMinimumSize(width: number, height: number): void
  setContentSize(width: number, height: number): void
  setBounds(bounds: Bounds): void
}

const COMPACT_MIN_WIDTH = 320

// Compact mode only shrinks the control window; the normal size and minimum are kept in
// memory and restored on exit (nothing is persisted).
export function createCompactController(getWindow: () => CompactWindow | null) {
  let normal: { win: CompactWindow; width: number; height: number; min: number[] } | null = null
  return {
    apply(request: CompactRequest): void {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      if (request.compact) {
        if (!normal || normal.win !== win) {
          const b = win.getBounds()
          normal = { win, width: b.width, height: b.height, min: win.getMinimumSize() }
        }
        const [outerW, outerH] = win.getSize()
        const [contentW, contentH] = win.getContentSize()
        win.setMinimumSize(COMPACT_MIN_WIDTH + (outerW - contentW), request.height + (outerH - contentH))
        win.setContentSize(contentW, request.height)
      } else if (normal && normal.win === win) {
        const saved = normal
        normal = null
        win.setMinimumSize(saved.min[0], saved.min[1])
        const { x, y } = win.getBounds()
        win.setBounds({ x, y, width: saved.width, height: saved.height })
      }
    },
    reset(): void {
      normal = null
    },
  }
}
