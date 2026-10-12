import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { QueueVideo, SavedDisplay, SavedQueue, Settings } from '../shared/types'
import { MAX_SAVED_QUEUES, isVideoId, parseQueueName } from '../shared/validate'

const MAX_HISTORY = 10

function clampVolume(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

function isSavedDisplay(v: unknown): v is SavedDisplay {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return ['id', 'x', 'y', 'width', 'height'].every((k) => typeof d[k] === 'number')
}

function isQueueVideo(v: unknown): v is QueueVideo {
  if (typeof v !== 'object' || v === null) return false
  const item = v as Record<string, unknown>
  return isVideoId(item.videoId) && typeof item.title === 'string'
}

function isSavedQueue(v: unknown): v is SavedQueue {
  if (typeof v !== 'object' || v === null) return false
  const q = v as Record<string, unknown>
  return (
    parseQueueName(q.name) === q.name &&
    Array.isArray(q.items) &&
    q.items.length > 0 &&
    q.items.every(isQueueVideo)
  )
}

const copyQueue = (q: SavedQueue): SavedQueue => ({
  name: q.name,
  items: q.items.map((item) => ({ videoId: item.videoId, title: item.title })),
})

export class SettingsStore {
  private data: Settings

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  get(): Settings {
    return { ...this.data, history: [...this.data.history], queues: this.data.queues.map(copyQueue) }
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

  saveQueue(name: string, items: QueueVideo[]): boolean {
    const clean = parseQueueName(name)
    if (!clean || items.length === 0 || !items.every(isQueueVideo)) return false
    const saved = copyQueue({ name: clean, items })
    const index = this.data.queues.findIndex((q) => q.name === clean)
    if (index >= 0) {
      this.data.queues[index] = saved
    } else {
      if (this.data.queues.length >= MAX_SAVED_QUEUES) return false
      this.data.queues.push(saved)
    }
    this.save()
    return true
  }

  deleteQueue(name: string): void {
    const queues = this.data.queues.filter((q) => q.name !== name)
    if (queues.length === this.data.queues.length) return
    this.data.queues = queues
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
        queues: Array.isArray(raw.queues) ? raw.queues.filter(isSavedQueue).slice(0, MAX_SAVED_QUEUES).map(copyQueue) : [],
      }
    } catch {
      return { volume: 100, history: [], queues: [] }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
  }
}
