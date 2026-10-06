import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SavedDisplay, Settings } from '../shared/types'

const MAX_HISTORY = 10

function clampVolume(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

function isSavedDisplay(v: unknown): v is SavedDisplay {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return ['id', 'x', 'y', 'width', 'height'].every((k) => typeof d[k] === 'number')
}

export class SettingsStore {
  private data: Settings

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  get(): Settings {
    return { ...this.data, history: [...this.data.history] }
  }

  setDisplay(display: SavedDisplay): void {
    this.data.display = display
    this.save()
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return
    this.data.volume = clampVolume(volume)
    this.save()
  }

  addHistory(url: string): void {
    this.data.history = [url, ...this.data.history.filter((h) => h !== url)].slice(0, MAX_HISTORY)
    this.save()
  }

  private read(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Settings>
      return {
        volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? clampVolume(raw.volume) : 100,
        history: Array.isArray(raw.history)
          ? raw.history.filter((h): h is string => typeof h === 'string').slice(0, MAX_HISTORY)
          : [],
        display: isSavedDisplay(raw.display) ? raw.display : undefined,
      }
    } catch {
      return { volume: 100, history: [] }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
  }
}
