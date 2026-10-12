import { parseYoutubeUrl } from '../shared/parseYoutubeUrl'
import type { PlayerState, PlayerStatus, QueueState, QueueVideo, SavedQueue } from '../shared/types'
import { MAX_QUEUE_ITEMS, isVideoId } from '../shared/validate'
import { PlaybackQueue, type QueueAction } from './queue'

export interface QueueManagerDeps {
  expandPlaylist(listId: string): Promise<string[]>
  fetchTitles(videoIds: string[], onTitle: (videoId: string, title: string) => void): Promise<void>
  playVideo(videoId: string): void
  stopPlayer(): void
  addHistory(url: string): void
  saved: {
    list(): SavedQueue[]
    save(name: string, items: QueueVideo[]): boolean
    delete(name: string): void
  }
  publish(state: QueueState): void
  notify(message: string): void
}

export class QueueManager {
  private chain: Promise<void> = Promise.resolve()
  private expanding = 0
  private lastStatus: PlayerStatus = 'idle'
  private readonly titleJobs = new Set<Promise<void>>()

  constructor(
    private readonly deps: QueueManagerDeps,
    private readonly queue: PlaybackQueue = new PlaybackQueue(),
  ) {}

  state(): QueueState {
    const { items, currentUid } = this.queue.snapshot()
    return {
      items,
      currentUid,
      expanding: this.expanding > 0,
      saved: this.deps.saved.list().map((q) => q.name),
    }
  }

  add(url: string, playNow: boolean): Promise<void> {
    const job = this.chain.then(() => this.doAdd(url, playNow))
    this.chain = job.catch(() => undefined)
    return job
  }

  remove(uid: string): void {
    this.apply(this.queue.remove(uid))
  }

  move(uid: string, toIndex: number): void {
    if (this.queue.move(uid, toIndex)) this.publish()
  }

  clear(): void {
    this.apply(this.queue.clear())
  }

  playAt(uid: string): void {
    this.apply(this.queue.playAt(uid))
  }

  next(): void {
    this.apply(this.queue.next(false))
  }

  prev(): void {
    this.apply(this.queue.prev())
  }

  save(name: string): void {
    const items = this.queue.snapshot().items.map(({ videoId, title }) => ({ videoId, title }))
    if (!this.deps.saved.save(name, items)) {
      this.deps.notify('Não foi possível salvar a fila (nome inválido, fila vazia ou limite de filas atingido).')
      return
    }
    this.publish()
  }

  loadSaved(name: string): void {
    const saved = this.deps.saved.list().find((q) => q.name === name)
    if (!saved) {
      this.deps.notify('Fila salva não encontrada.')
      return
    }
    this.apply(this.queue.replace(saved.items))
  }

  deleteSaved(name: string): void {
    this.deps.saved.delete(name)
    this.publish()
  }

  onPlayerState(state: PlayerState): void {
    const previous = this.lastStatus
    this.lastStatus = state.status
    const ended = state.status === 'ended' && previous !== 'ended'
    const skip = state.status === 'error' && state.skip === true && previous !== 'error'
    if (skip) this.deps.notify(`Pulando vídeo: ${state.error ?? 'erro desconhecido'}`)
    if (ended || skip) this.apply(this.queue.next(true))
  }

  async settled(): Promise<void> {
    while (this.titleJobs.size > 0) await Promise.allSettled([...this.titleJobs])
  }

  private async doAdd(url: string, playNow: boolean): Promise<void> {
    const target = parseYoutubeUrl(url)
    if (!target) {
      this.deps.notify('Link inválido. Cole um link de vídeo ou playlist do YouTube.')
      return
    }
    this.deps.addHistory(url.trim())

    let videos: QueueVideo[]
    let startVideoId: string | undefined
    if (target.type === 'video' && !target.listId) {
      videos = [{ videoId: target.id, title: target.id }]
    } else {
      const listId = target.listId
      if (!listId) return
      let ids: string[]
      this.expanding++
      this.publish()
      try {
        ids = await this.deps.expandPlaylist(listId)
      } catch (err) {
        this.deps.notify(`Não foi possível ler a playlist: ${err instanceof Error ? err.message : String(err)}`)
        return
      } finally {
        this.expanding--
        this.publish()
      }
      ids = ids.filter(isVideoId)
      if (ids.length === 0) {
        this.deps.notify('A playlist está vazia ou indisponível.')
        return
      }
      if (ids.length > MAX_QUEUE_ITEMS) {
        ids = ids.slice(0, MAX_QUEUE_ITEMS)
        this.deps.notify(`Playlist cortada nos primeiros ${MAX_QUEUE_ITEMS} vídeos.`)
      }
      videos = ids.map((videoId) => ({ videoId, title: videoId }))
      if (target.type === 'video') startVideoId = target.id
    }

    this.apply(playNow ? this.queue.replace(videos, startVideoId) : this.queue.add(videos))
    this.fetchTitlesFor(videos.map((v) => v.videoId))
  }

  private fetchTitlesFor(videoIds: string[]): void {
    const job: Promise<void> = this.deps
      .fetchTitles(videoIds, (videoId, title) => {
        if (this.queue.setTitleByVideoId(videoId, title)) this.publish()
      })
      .catch(() => undefined)
      .finally(() => this.titleJobs.delete(job))
    this.titleJobs.add(job)
  }

  private apply(action: QueueAction): void {
    if (action && 'play' in action) {
      this.lastStatus = 'idle'
      this.deps.playVideo(action.play.videoId)
    } else if (action) {
      this.lastStatus = 'idle'
      this.deps.stopPlayer()
    }
    this.publish()
  }

  private publish(): void {
    this.deps.publish(this.state())
  }
}
