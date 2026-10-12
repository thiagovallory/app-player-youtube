import { randomUUID } from 'node:crypto'
import type { QueueItem, QueueVideo } from '../shared/types'

export type QueueAction = { play: QueueItem } | { stop: true } | null

export class PlaybackQueue {
  private items: QueueItem[] = []
  private currentUid: string | null = null
  private atEnd = false

  constructor(private readonly newUid: () => string = randomUUID) {}

  snapshot(): { items: QueueItem[]; currentUid: string | null } {
    return { items: this.items.map((item) => ({ ...item })), currentUid: this.currentUid }
  }

  add(videos: QueueVideo[]): QueueAction {
    if (videos.length === 0) return null
    const created = this.make(videos)
    const startFresh = this.items.length === 0 || this.atEnd || this.currentUid === null
    this.items.push(...created)
    if (startFresh) {
      this.currentUid = created[0].uid
      this.atEnd = false
    }
    return null
  }

  replace(videos: QueueVideo[], startVideoId?: string, autoplay = true): QueueAction {
    this.items = this.make(videos)
    this.atEnd = false
    if (this.items.length === 0) {
      this.currentUid = null
      return { stop: true }
    }
    const start = (startVideoId && this.items.find((i) => i.videoId === startVideoId)) || this.items[0]
    if (autoplay) return this.play(start)
    this.currentUid = start.uid
    return { stop: true }
  }

  remove(uid: string): QueueAction {
    const index = this.items.findIndex((i) => i.uid === uid)
    if (index === -1) return null
    const wasCurrent = uid === this.currentUid
    this.items.splice(index, 1)
    if (!wasCurrent) return null
    const next = this.items[index]
    if (next) return this.play(next)
    this.currentUid = null
    this.atEnd = false
    return { stop: true }
  }

  move(uid: string, toIndex: number): boolean {
    const from = this.items.findIndex((i) => i.uid === uid)
    if (from === -1 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.items.length) return false
    const [item] = this.items.splice(from, 1)
    this.items.splice(toIndex, 0, item)
    return true
  }

  clear(): QueueAction {
    this.items = []
    this.currentUid = null
    this.atEnd = false
    return { stop: true }
  }

  playAt(uid: string): QueueAction {
    const item = this.items.find((i) => i.uid === uid)
    return item ? this.play(item) : null
  }

  next(auto = false): QueueAction {
    const index = this.currentIndex()
    if (index === -1) return null
    const next = this.items[index + 1]
    if (next) return this.play(next)
    if (auto) this.atEnd = true
    return null
  }

  prev(): QueueAction {
    const index = this.currentIndex()
    if (index <= 0) return null
    return this.play(this.items[index - 1])
  }

  setTitleByVideoId(videoId: string, title: string): boolean {
    let changed = false
    for (const item of this.items) {
      if (item.videoId === videoId && item.title === videoId) {
        item.title = title
        changed = true
      }
    }
    return changed
  }

  private currentIndex(): number {
    return this.currentUid === null ? -1 : this.items.findIndex((i) => i.uid === this.currentUid)
  }

  private make(videos: QueueVideo[]): QueueItem[] {
    return videos.map((video) => ({ uid: this.newUid(), videoId: video.videoId, title: video.title }))
  }

  private play(item: QueueItem): QueueAction {
    this.currentUid = item.uid
    this.atEnd = false
    return { play: { ...item } }
  }
}
