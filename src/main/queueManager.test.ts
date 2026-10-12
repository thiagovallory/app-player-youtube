import { describe, expect, it } from 'vitest'
import type { PlayerState, QueueState, SavedQueue } from '../shared/types'
import { PlaybackQueue } from './queue'
import { QueueManager, type QueueManagerDeps } from './queueManager'

const V1 = 'aaaaaaaaaaa'
const V2 = 'bbbbbbbbbbb'
const V3 = 'ccccccccccc'
const LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
const url = (id: string) => `https://www.youtube.com/watch?v=${id}`
const playlistUrl = `https://www.youtube.com/playlist?list=${LIST}`

function setup(overrides: Partial<QueueManagerDeps> = {}) {
  let n = 0
  let stops = 0
  const player = { open: true }
  const saved: SavedQueue[] = []
  const played: string[] = []
  const playedUids: string[] = []
  const published: QueueState[] = []
  const notices: string[] = []
  const history: string[] = []
  const confirms: { duplicates: number; total: number }[] = []
  const answer = { value: true }
  const titles: Record<string, string> = {}
  const deps: QueueManagerDeps = {
    expandPlaylist: async () => [V1, V2, V3],
    fetchTitles: async (ids, onTitle) => {
      for (const id of ids) if (titles[id]) onTitle(id, titles[id])
    },
    playVideo: (id, uid) => {
      played.push(id)
      playedUids.push(uid)
    },
    stopPlayer: () => {
      stops++
    },
    addHistory: (u) => {
      history.push(u)
    },
    saved: {
      list: () => saved,
      names: () => saved.map((q) => q.name),
      save: (name, items) => {
        if (!name || items.length === 0) return false
        const index = saved.findIndex((q) => q.name === name)
        if (index >= 0) saved[index] = { name, items }
        else saved.push({ name, items })
        return true
      },
      delete: (name) => {
        const index = saved.findIndex((q) => q.name === name)
        if (index >= 0) saved.splice(index, 1)
      },
    },
    confirmDuplicates: async (info) => {
      confirms.push(info)
      return answer.value
    },
    publish: (state) => {
      published.push(state)
    },
    notify: (message) => {
      notices.push(message)
    },
    isPlayerOpen: () => player.open,
    ...overrides,
  }
  const manager = new QueueManager(deps, new PlaybackQueue(() => `u${++n}`))
  return { manager, player, played, playedUids, published, notices, history, titles, saved, confirms, answer, stops: () => stops }
}

const ids = (m: QueueManager) => m.state().items.map((i) => i.videoId)
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const state = (status: PlayerState['status'], extra: Partial<PlayerState> = {}): PlayerState => ({
  status,
  title: '',
  currentTime: 0,
  duration: 0,
  ...extra,
})

describe('QueueManager.add', () => {
  it('adds a video, records history and starts playing when the queue was empty', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    expect(ids(t.manager)).toEqual([V1])
    expect(t.played).toEqual([V1])
    expect(t.history).toEqual([url(V1)])
    expect(t.manager.state().currentUid).toBe('u1')
  })

  it('appends later videos without interrupting playback', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    expect(ids(t.manager)).toEqual([V1, V2])
    expect(t.played).toEqual([V1])
  })

  it('rejects invalid links with a notice and no history', async () => {
    const t = setup()
    await t.manager.add('not a link', false)
    expect(t.notices).toHaveLength(1)
    expect(t.history).toEqual([])
    expect(ids(t.manager)).toEqual([])
  })

  it('fills real titles asynchronously and republishes', async () => {
    const t = setup()
    t.titles[V1] = 'Never Gonna'
    await t.manager.add(url(V1), false)
    await t.manager.settled()
    expect(t.manager.state().items[0].title).toBe('Never Gonna')
    expect(t.published.at(-1)?.items[0].title).toBe('Never Gonna')
  })

  it('expands a playlist link into all videos and plays the first', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    expect(ids(t.manager)).toEqual([V1, V2, V3])
    expect(t.played).toEqual([V1])
  })

  it('flags expanding while the playlist loads', async () => {
    let release!: (ids: string[]) => void
    const t = setup({
      expandPlaylist: () =>
        new Promise<string[]>((resolve) => {
          release = resolve
        }),
    })
    const pending = t.manager.add(playlistUrl, false)
    await flush()
    expect(t.manager.state().expanding).toBe(true)
    release([V1])
    await pending
    expect(t.manager.state().expanding).toBe(false)
    expect(ids(t.manager)).toEqual([V1])
  })

  it('play now replaces the whole queue', async () => {
    const t = setup()
    await t.manager.add(url(V3), false)
    await t.manager.add(playlistUrl, true)
    expect(ids(t.manager)).toEqual([V1, V2, V3])
    expect(t.played).toEqual([V3, V1])
  })

  it('play now on a video+list link starts at the linked video', async () => {
    const t = setup()
    await t.manager.add(`${url(V2)}&list=${LIST}`, true)
    expect(ids(t.manager)).toEqual([V1, V2, V3])
    expect(t.played).toEqual([V2])
  })

  it('notifies and leaves the queue unchanged when the expansion fails', async () => {
    const t = setup({
      expandPlaylist: async () => {
        throw new Error('boom')
      },
    })
    await t.manager.add(playlistUrl, false)
    expect(t.notices[0]).toContain('boom')
    expect(ids(t.manager)).toEqual([])
    expect(t.manager.state().expanding).toBe(false)
  })

  it('notifies for an empty playlist', async () => {
    const t = setup({ expandPlaylist: async () => [] })
    await t.manager.add(playlistUrl, false)
    expect(t.notices).toHaveLength(1)
    expect(ids(t.manager)).toEqual([])
  })

  it('drops invalid ids and truncates at 200 items with a notice', async () => {
    const many = Array.from({ length: 205 }, (_, i) => String(i).padStart(11, 'x'))
    const t = setup({ expandPlaylist: async () => ['bad!', ...many] })
    await t.manager.add(playlistUrl, false)
    expect(ids(t.manager)).toHaveLength(200)
    expect(t.notices.some((m) => m.includes('200'))).toBe(true)
  })

  it('keeps request order when adds overlap', async () => {
    let release!: (ids: string[]) => void
    const t = setup({
      expandPlaylist: () =>
        new Promise<string[]>((resolve) => {
          release = resolve
        }),
    })
    const first = t.manager.add(playlistUrl, false)
    const second = t.manager.add(url(V3), false)
    await flush()
    expect(ids(t.manager)).toEqual([])
    release([V1, V2])
    await Promise.all([first, second])
    expect(ids(t.manager)).toEqual([V1, V2, V3])
  })
})

describe('QueueManager duplicate confirmation', () => {
  it('asks before adding a video already in the queue', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V1), false)
    expect(t.confirms).toEqual([{ duplicates: 1, total: 1 }])
    expect(ids(t.manager)).toEqual([V1, V1])
  })

  it('adds nothing when the user declines', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.answer.value = false
    await t.manager.add(url(V1), false)
    expect(ids(t.manager)).toEqual([V1])
    expect(t.played).toEqual([V1])
  })

  it('does not fetch titles when declined', async () => {
    let fetched = 0
    const t = setup({
      fetchTitles: async () => {
        fetched++
      },
    })
    await t.manager.add(url(V1), false)
    t.answer.value = false
    await t.manager.add(url(V1), false)
    await t.manager.settled()
    expect(fetched).toBe(1)
  })

  it('asks once for a playlist, counting the duplicates', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(`${url(V2)}`, false)
    await t.manager.add(playlistUrl, false)
    expect(t.confirms).toEqual([{ duplicates: 2, total: 3 }])
    expect(ids(t.manager)).toEqual([V1, V2, V1, V2, V3])
  })

  it('never asks for play now', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V1), true)
    expect(t.confirms).toEqual([])
  })

  it('never asks without duplicates', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    expect(t.confirms).toEqual([])
  })

  it('keeps request order while a confirmation is pending', async () => {
    let release!: (ok: boolean) => void
    const t = setup({
      confirmDuplicates: () =>
        new Promise<boolean>((resolve) => {
          release = resolve
        }),
    })
    await t.manager.add(url(V1), false)
    const dup = t.manager.add(url(V1), false)
    const other = t.manager.add(url(V2), false)
    await flush()
    expect(ids(t.manager)).toEqual([V1])
    release(true)
    await Promise.all([dup, other])
    expect(ids(t.manager)).toEqual([V1, V1, V2])
  })
})

describe('QueueManager.onPlayerState', () => {
  it('advances once when a video ends', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    t.manager.onPlayerState(state('ended'))
    t.manager.onPlayerState(state('ended'))
    expect(t.played).toEqual([V1, V2])
  })

  it('treats each started video as a fresh status', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.onPlayerState(state('ended'))
    t.manager.onPlayerState(state('ended'))
    expect(t.played).toEqual([V1, V2, V3])
  })

  it('does nothing when the last video ends, and the next add starts playing', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.manager.onPlayerState(state('ended'))
    expect(t.played).toEqual([V1])
    await t.manager.add(url(V2), false)
    expect(t.played).toEqual([V1, V2])
  })

  it('skips a skippable error with a notice', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    t.manager.onPlayerState(state('error', { skip: true, error: 'Vídeo removido ou privado.' }))
    expect(t.played).toEqual([V1, V2])
    expect(t.notices.some((m) => m.includes('Vídeo removido ou privado.'))).toBe(true)
  })

  it('does not advance on a non-skippable error', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    t.manager.onPlayerState(state('error', { skip: false, error: 'x' }))
    expect(t.played).toEqual([V1])
  })
})

describe('QueueManager stale player reports', () => {
  it('ignores an ended report for a previous video after the user advanced', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.next()
    t.manager.onPlayerState(state('ended', { uid: 'u1' }))
    expect(t.played).toEqual([V1, V2])
    t.manager.onPlayerState(state('ended', { uid: 'u2' }))
    expect(t.played).toEqual([V1, V2, V3])
  })

  it('ignores a stale skippable error', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.next()
    t.manager.onPlayerState(state('error', { uid: 'u1', skip: true, error: 'x' }))
    expect(t.played).toEqual([V1, V2])
    expect(t.notices).toEqual([])
  })

  it('tells apart the same video in two consecutive items by uid', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.answer.value = true
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    t.manager.next()
    expect(t.playedUids).toEqual(['u1', 'u2'])
    t.manager.onPlayerState(state('ended', { uid: 'u1' }))
    expect(t.played).toEqual([V1, V1])
    t.manager.onPlayerState(state('ended', { uid: 'u2' }))
    expect(t.played).toEqual([V1, V1, V2])
  })

  it('does not announce a skip when there is no next item', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.manager.onPlayerState(state('error', { skip: true, error: 'x' }))
    expect(t.notices).toEqual([])
    expect(t.played).toEqual([V1])
  })
})

describe('QueueManager.onPlayerClosed', () => {
  it('resets the last seen status', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.manager.onPlayerState(state('ended'))
    expect(t.manager['lastStatus']).toBe('ended')
    t.manager.onPlayerClosed()
    expect(t.manager['lastStatus']).toBe('idle')
  })
})

describe('QueueManager playlist fallback', () => {
  const linked = `${url(V2)}&list=${LIST}`

  for (const [label, expand] of [
    ['an error', async () => Promise.reject(new Error('boom'))],
    ['an empty list', async () => []],
  ] as const) {
    for (const playNow of [false, true]) {
      it(`falls back to the single video on ${label} (playNow=${playNow})`, async () => {
        const t = setup({ expandPlaylist: expand })
        await t.manager.add(linked, playNow)
        expect(ids(t.manager)).toEqual([V2])
        expect(t.played).toEqual([V2])
        expect(t.notices).toEqual(['Não foi possível ler a playlist; adicionando só o vídeo.'])
        expect(t.manager.state().expanding).toBe(false)
      })
    }
  }

  it('still fails for a playlist-only link', async () => {
    const t = setup({ expandPlaylist: async () => Promise.reject(new Error('boom')) })
    await t.manager.add(playlistUrl, false)
    expect(ids(t.manager)).toEqual([])
    expect(t.notices[0]).toContain('boom')
  })
})

describe('QueueManager editing', () => {
  it('adding after removing the last current item starts playing', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    await t.manager.add(url(V2), false)
    t.manager.next()
    t.manager.remove('u2')
    await t.manager.add(url(V3), false)
    expect(t.played).toEqual([V1, V2, V3])
  })

  it('removing the current item with the player closed does not reopen it', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.player.open = false
    t.manager.remove('u1')
    expect(t.played).toEqual([V1])
    expect(t.manager.state().currentUid).toBe('u2')
    t.manager.remove('u2')
    t.manager.remove('u3')
    expect(t.stops()).toBe(0)
  })

  it('manual next and prev move through the queue and ignore the edges', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.prev()
    t.manager.next()
    t.manager.next()
    t.manager.next()
    t.manager.prev()
    expect(t.played).toEqual([V1, V2, V3, V2])
  })

  it('removing the current item plays the next one; clearing stops the player', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.remove('u1')
    expect(t.played).toEqual([V1, V2])
    t.manager.clear()
    expect(t.stops()).toBe(1)
    expect(ids(t.manager)).toEqual([])
  })

  it('removing the last current item stops the player', async () => {
    const t = setup()
    await t.manager.add(url(V1), false)
    t.manager.remove('u1')
    expect(t.stops()).toBe(1)
  })

  it('moves and plays items and publishes after each change', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    const before = t.published.length
    t.manager.move('u1', 2)
    expect(ids(t.manager)).toEqual([V2, V3, V1])
    t.manager.playAt('u3')
    expect(t.played).toEqual([V1, V3])
    expect(t.published.length).toBeGreaterThan(before)
  })
})

describe('QueueManager saved queues', () => {
  it('saves the current queue and exposes the names', async () => {
    const t = setup()
    await t.manager.add(playlistUrl, false)
    t.manager.save('Rock')
    expect(t.saved).toEqual([
      {
        name: 'Rock',
        items: [
          { videoId: V1, title: V1 },
          { videoId: V2, title: V2 },
          { videoId: V3, title: V3 },
        ],
      },
    ])
    expect(t.manager.state().saved).toEqual(['Rock'])
  })

  it('notifies when saving fails', () => {
    const t = setup()
    t.manager.save('Empty')
    expect(t.notices).toEqual([
      'Não foi possível salvar a fila (nome inválido, fila vazia, mais de 200 itens ou limite de filas atingido).',
    ])
  })

  it('builds state from names without listing the saved queues', async () => {
    const t = setup({
      saved: {
        list: () => {
          throw new Error('should not copy all queues')
        },
        names: () => ['A', 'B'],
        save: () => true,
        delete: () => undefined,
      },
    })
    expect(t.manager.state().saved).toEqual(['A', 'B'])
  })

  it('loads a saved queue, replacing the current one and playing it', async () => {
    const t = setup()
    t.saved.push({ name: 'Mix', items: [{ videoId: V2, title: 'Two' }, { videoId: V3, title: 'Three' }] })
    await t.manager.add(url(V1), false)
    t.manager.loadSaved('Mix')
    expect(t.manager.state().items.map((i) => i.title)).toEqual(['Two', 'Three'])
    expect(t.played).toEqual([V1, V2])
  })

  it('fetches titles for provisional items after loading a saved queue', async () => {
    const t = setup()
    t.titles[V2] = 'Two Real'
    t.saved.push({ name: 'Mix', items: [{ videoId: V2, title: V2 }, { videoId: V3, title: 'Three' }] })
    t.manager.loadSaved('Mix')
    await t.manager.settled()
    expect(t.manager.state().items.map((i) => i.title)).toEqual(['Two Real', 'Three'])
  })

  it('notifies for an unknown saved queue and deletes saved queues', () => {
    const t = setup()
    t.manager.loadSaved('Nope')
    expect(t.notices).toHaveLength(1)
    t.saved.push({ name: 'Mix', items: [{ videoId: V2, title: 'Two' }] })
    t.manager.deleteSaved('Mix')
    expect(t.manager.state().saved).toEqual([])
  })
})
