import type { DisplayInfo, SavedDisplay } from '../shared/types'

export interface RawDisplay {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
}

export function toDisplayInfos(displays: RawDisplay[], primaryId: number): DisplayInfo[] {
  return displays.map((display, index) => ({
    id: display.id,
    label: display.label ? `Monitor ${index + 1} — ${display.label}` : `Monitor ${index + 1}`,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    isPrimary: display.id === primaryId,
  }))
}

export function findSaved(
  saved: SavedDisplay | undefined,
  displays: DisplayInfo[],
): DisplayInfo | undefined {
  if (!saved) return undefined
  return (
    displays.find((d) => d.id === saved.id) ??
    displays.find(
      (d) => d.x === saved.x && d.y === saved.y && d.width === saved.width && d.height === saved.height,
    )
  )
}

export function pickDisplay(saved: SavedDisplay | undefined, displays: DisplayInfo[]): DisplayInfo {
  return (
    findSaved(saved, displays) ??
    displays.find((d) => !d.isPrimary) ??
    displays.find((d) => d.isPrimary) ??
    displays[0]
  )
}

export function toSavedDisplay(d: DisplayInfo): SavedDisplay {
  return { id: d.id, x: d.x, y: d.y, width: d.width, height: d.height }
}
