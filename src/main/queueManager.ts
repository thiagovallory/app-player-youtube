import { parseYoutubeUrl } from '../shared/parseYoutubeUrl'
import type { PlayerState, PlayerStatus, QueueState, QueueVideo, SavedQueue } from '../shared/types'
import { MAX_QUEUE_ITEMS, isVideoId } from '../shared/validate'
import { PlaybackQueue, type QueueAction } from './queue'

export interface QueueManagerDeps {
  expandPlaylist(listId: string): Promise<string[]>
  fetchTitles(videoIds: string[], onTitle: (videoId: string, title: string) => void): Promise<void>
  playVideo(videoId: string, uid: string): void
  stopPlayer(): void
  addHistory(url: string): void
  confirmDuplicates(info: { duplicates: number; total: number }): Promise<boolean>
  saved: {
    list(): SavedQueue[]
    names(): string[]
    save(name: string, items: QueueVideo[]): boolean
    delete(name: string): void
  }
  publish(state: QueueState): void
  notify(message: string): void
  isPlayerOpen(): boolean
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
      saved: this.deps.saved.names(),
    }
  }

  add(url: string, playNow: boolean): Promise<void> {
    const job = this.chain.then(() => this.doAdd(url, playNow))
    this.chain = job.catch(() => undefined)
    return job
  }

  remove(uid: string): void {
    const wasCurrent = this.queue.snapshot().currentUid === uid
    const action = this.queue.remove(uid)
    if (wasCurrent && !this.deps.isPlayerOpen()) {
      this.publish()
      return
    }
    this.apply(action)
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
      this.deps.notify('Não foi possível salvar a fila (nome inválido, fila vazia, mais de 200 itens ou limite de filas atingido).')
      return
    }
    this.publish()
  }

  loadSaved(name: string, mode: 'append' | 'replace'): Promise<void> {
    const job = this.chain.then(() => this.doLoadSaved(name, mode))
    this.chain = job.catch(() => undefined)
    return job
  }

  deleteSaved(name: string): void {
    this.deps.saved.delete(name)
    this.publish()
  }

  onPlayerClosed(): void {
    this.lastStatus = 'idle'
  }

  onPlayerState(state: PlayerState): void {
    const advancing = state.status === 'ended' || (state.status === 'error' && state.skip === true)
    if (advancing && state.uid !== undefined && state.uid !== this.queue.snapshot().currentUid) return
    const previous = this.lastStatus
    this.lastStatus = state.status
    const ended = state.status === 'ended' && previous !== 'ended'
    const skip = state.status === 'error' && state.skip === true && previous !== 'error'
    if (!ended && !skip) return
    const action = this.queue.next(true)
    if (skip && action && 'play' in action) {
      this.deps.notify(`Pulando vídeo: ${state.error ?? 'erro desconhecido'}`)
    }
    this.apply(action)
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

    const single: QueueVideo[] | null =
      target.type === 'video' ? [{ videoId: target.id, title: target.id }] : null
    let videos: QueueVideo[]
    let startVideoId: string | undefined
    if (single && !target.listId) {
      videos = single
    } else {
      const listId = target.listId
      if (!listId) return
      let ids: string[] = []
      let failure: string | null = null
      this.expanding++
      this.publish()
      try {
        ids = (await this.deps.expandPlaylist(listId)).filter(isVideoId)
        if (ids.length === 0) failure = 'A playlist está vazia ou indisponível.'
      } catch (err) {
        failure = `Não foi possível ler a playlist: ${err instanceof Error ? err.message : String(err)}`
      } finally {
        this.expanding--
        this.publish()
      }
      if (failure !== null) {
        if (!single) {
          this.deps.notify(failure)
          return
        }
        this.deps.notify('Não foi possível ler a playlist; adicionando só o vídeo.')
        videos = single
      } else {
        if (ids.length > MAX_QUEUE_ITEMS) {
          ids = ids.slice(0, MAX_QUEUE_ITEMS)
          this.deps.notify(`Playlist cortada nos primeiros ${MAX_QUEUE_ITEMS} vídeos.`)
        }
        videos = ids.map((videoId) => ({ videoId, title: videoId }))
        if (target.type === 'video') startVideoId = target.id
      }
    }

    if (!playNow && !(await this.confirmNoDuplicates(videos))) return

    this.apply(playNow ? this.queue.replace(videos, startVideoId, true) : this.queue.add(videos))
    this.fetchTitlesFor(videos.map((v) => v.videoId))
  }

  private async doLoadSaved(name: string, mode: 'append' | 'replace'): Promise<void> {
    const saved = this.deps.saved.list().find((q) => q.name === name)
    if (!saved) {
      this.deps.notify('Fila salva não encontrada.')
      return
    }
    const items = saved.items.map(({ videoId, title }) => ({ videoId, title }))
    if (mode === 'append') {
      if (!(await this.confirmNoDuplicates(items))) return
      this.apply(this.queue.add(items))
    } else {
      this.apply(this.queue.replace(items, undefined, false))
    }
    this.fetchTitlesFor(items.filter((i) => i.title === i.videoId).map((i) => i.videoId))
  }

  private async confirmNoDuplicates(videos: QueueVideo[]): Promise<boolean> {
    const present = new Set(this.queue.snapshot().items.map((i) => i.videoId))
    const duplicates = videos.filter((v) => present.has(v.videoId)).length
    return duplicates === 0 || (await this.deps.confirmDuplicates({ duplicates, total: videos.length }))
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
      this.deps.playVideo(action.play.videoId, action.play.uid)
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
