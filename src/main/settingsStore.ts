import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { QueueVideo, SavedDisplay, SavedQueue, Settings, ThemePref, VideoPrefs } from '../shared/types'
import {
  MAX_QUEUE_ITEMS,
  MAX_SAVED_QUEUES,
  isCaptionLang,
  isPlaybackRate,
  isThemePref,
  isVideoId,
  parseQueueName,
  parseVideoPrefsUpdate,
} from '../shared/validate'

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
    q.items.length <= MAX_QUEUE_ITEMS &&
    q.items.every(isQueueVideo)
  )
}

const copyQueue = (q: SavedQueue): SavedQueue => ({
  name: q.name,
  items: q.items.map((item) => ({ videoId: item.videoId, title: item.title })),
})

function readVideoPrefs(v: unknown): VideoPrefs {
  const raw = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return {
    captions: raw.captions === true,
    captionLang: isCaptionLang(raw.captionLang) ? raw.captionLang : null,
    captionTranslate: isCaptionLang(raw.captionTranslate) ? raw.captionTranslate : null,
    playbackRate: isPlaybackRate(raw.playbackRate) ? raw.playbackRate : 1,
  }
}

export class SettingsStore {
  private data: Settings

  constructor(private readonly file: string) {
    this.data = this.read()
  }

  get(): Settings {
    return {
      ...this.data,
      history: [...this.data.history],
      queues: this.data.queues.map(copyQueue),
      videoPrefs: { ...this.data.videoPrefs },
    }
  }

  queueNames(): string[] {
    return this.data.queues.map((q) => q.name)
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

  setVideoPrefs(update: Partial<VideoPrefs>): void {
    const clean = parseVideoPrefsUpdate(update)
    if (!clean) return
    this.data.videoPrefs = { ...this.data.videoPrefs, ...clean }
    this.save()
  }

  setTheme(theme: ThemePref): void {
    if (!isThemePref(theme)) return
    this.data.theme = theme
    this.save()
  }

  addHistory(url: string): void {
    this.data.history = [url, ...this.data.history.filter((h) => h !== url)].slice(0, MAX_HISTORY)
    this.save()
  }

  saveQueue(name: string, items: QueueVideo[]): boolean {
    const clean = parseQueueName(name)
    if (!clean || items.length === 0 || items.length > MAX_QUEUE_ITEMS || !items.every(isQueueVideo)) return false
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
        videoPrefs: readVideoPrefs(raw.videoPrefs),
        theme: isThemePref(raw.theme) ? raw.theme : 'system',
      }
    } catch {
      return { volume: 100, history: [], queues: [], videoPrefs: readVideoPrefs(null), theme: 'system' }
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    } catch (err) {
      console.error('Failed to save settings', err)
    }
  }
}
