# Fila de Reprodução Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma fila de reprodução editável (adicionar vídeo/playlist, reordenar, remover, limpar) com filas salvas por nome, sobre o app Electron existente.

**Architecture:** O main process passa a ter uma fila (`PlaybackQueue`, pura) orquestrada por um `QueueManager` (com dependências injetadas, testável sem Electron). O player toca um vídeo por vez (`play-video`) e avisa ao terminar; o manager avança. Playlists são expandidas por uma janela oculta (`probe`) que lê `getPlaylist()`, e os títulos vêm do oEmbed. O controle ganha a UI da fila e das filas salvas.

**Tech Stack:** Electron, electron-vite, TypeScript (strict), Vitest, YouTube IFrame API. Sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-10-07-fila-de-reproducao-design.md` (estende `docs/superpowers/specs/2026-10-05-app-player-youtube-design.md`).

## Global Constraints

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e travamento de `will-navigate` / `window.open` (`lockDown`) em toda `BrowserWindow`, inclusive a `probe`.
- Todo payload `queue:*` é validado no main (uid, videoId, índice inteiro dentro do intervalo, nome de fila com trim e máximo de 100 caracteres, URL com máximo de 2048 caracteres) e o sender deve ser a janela de controle.
- Expansão de playlist: máximo de 200 itens; timeout de 15 s; sem chave de API; títulos via `https://www.youtube.com/oembed?url=<watch url>&format=json`, 5 requisições em paralelo, falha mantém o `videoId` como título.
- Filas salvas: nome máximo de 100 caracteres, máximo de 50 filas, fila vazia não pode ser salva; salvar com nome existente sobrescreve; a fila ativa NÃO persiste entre sessões.
- Fim da fila: para, sem loop. `stop` fecha a janela do player e mantém a fila.
- Títulos vindos do oEmbed são exibidos somente via `textContent` (nunca `innerHTML`).
- Textos de interface em português. Estilo do código: aspas simples, sem ponto e vírgula (exceto `src/main/windows.ts`, que já usa aspas duplas e ponto e vírgula: siga o estilo do arquivo).
- Sem `"type": "module"` no `package.json` (preloads CJS). Preloads só podem fazer `require('electron')`.
- Desvios deliberados da spec (decididos neste plano): `QueueState` ganha `saved: string[]` (nomes das filas salvas, empurrados no mesmo estado); `PlaybackQueue` usa `setTitleByVideoId` (em vez de `setTitle(uid)`); `PlayerState` ganha `skip?: boolean`; ▶ com o player parado/terminado e item atual selecionado toca o item atual; Excluir fila salva pede confirmação.
- Nenhum subagent tem tela: passos de verificação manual (GUI) ficam para o usuário (Task 9).

## File Structure

```
src/shared/types.ts            + QueueVideo, QueueItem, SavedQueue, QueueState, ProbeResult, PlayerState.skip, play-video (depois: remove load, Settings.queues)
src/shared/ipc.ts              + canais QUEUE_* e PROBE_RESULT
src/shared/api.ts              + ProbeApi (depois: ControlApi da fila)
src/shared/validate.ts         validadores puros e limites
src/main/queue.ts              PlaybackQueue (pura)
src/main/concurrency.ts        mapWithConcurrency
src/main/oembed.ts             fetchVideoTitle, fetchTitles
src/main/queueManager.ts       QueueManager (orquestra fila, expansão, títulos, salvas, avanço automático)
src/main/playlistExpander.ts   expandPlaylist via janela probe
src/main/settingsStore.ts      + queues, saveQueue, deleteQueue
src/main/windows.ts            + createProbeWindow
src/main/playerController.ts   lastLoad -> lastPlay, load -> play-video
src/main/index.ts              fiação do QueueManager e dos canais IPC
src/preload/probe.ts           expõe window.probe
src/preload/control.ts         + métodos da fila
src/renderer/probe/{index.html,main.ts}
src/renderer/env.d.ts          + probe
src/renderer/player/main.ts    toca 1 vídeo por vez, sem playlist nativa
src/renderer/control/{index.html,style.css,playback.ts,queue.ts,main.ts}
electron.vite.config.ts        + entradas probe
README.md                      uso da fila
```

Testes ao lado do código: `src/**/*.test.ts`.

---

### Task 1: Contratos compartilhados e validadores

Só adiciona (não remove nada), então o typecheck continua verde.

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/api.ts`
- Create: `src/shared/validate.ts`
- Test: `src/shared/validate.test.ts`

**Interfaces:**
- Produces:
  - Tipos: `QueueVideo { videoId: string; title: string }`, `QueueItem extends QueueVideo { uid: string }`, `SavedQueue { name: string; items: QueueVideo[] }`, `QueueState { items: QueueItem[]; currentUid: string | null; expanding: boolean; saved: string[] }`, `ProbeResult = { ok: true; ids: string[] } | { ok: false; error: string }`, `PlayerState.skip?: boolean`, `PlayerCommand` ganha `{ type: 'play-video'; videoId: string }`.
  - Canais: `QUEUE_GET`, `QUEUE_ADD`, `QUEUE_REMOVE`, `QUEUE_MOVE`, `QUEUE_CLEAR`, `QUEUE_PLAY_AT`, `QUEUE_SAVE`, `QUEUE_LOAD_SAVED`, `QUEUE_DELETE_SAVED`, `QUEUE_STATE`, `PROBE_RESULT`.
  - `ProbeApi { report(result: ProbeResult): void }`.
  - `validate.ts`: `MAX_QUEUE_NAME = 100`, `MAX_SAVED_QUEUES = 50`, `MAX_QUEUE_ITEMS = 200`, `isVideoId(v: unknown): v is string`, `isListId(v: unknown): v is string`, `isUid(v: unknown): v is string`, `parseQueueName(v: unknown): string | null`, `isMoveIndex(v: unknown, length: number): v is number`, `isUrlText(v: unknown): v is string`.

- [ ] **Step 1: Escrever o teste que falha** — `src/shared/validate.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_QUEUE_NAME,
  isListId,
  isMoveIndex,
  isUid,
  isUrlText,
  isVideoId,
  parseQueueName,
} from './validate'

describe('isVideoId', () => {
  it('accepts an 11-character id', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true)
  })

  it.each(['', 'short', 'dQw4w9WgXcQ1', 'dQw4w9WgXc!', 42, null, undefined])('rejects %j', (value) => {
    expect(isVideoId(value)).toBe(false)
  })
})

describe('isListId', () => {
  it('accepts a playlist id', () => {
    expect(isListId('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe(true)
  })

  it.each(['', 'abc', 'PLrAXtmErZgOeiKm4sgN&x=1', 7, null])('rejects %j', (value) => {
    expect(isListId(value)).toBe(false)
  })
})

describe('isUid', () => {
  it('accepts uuid-like ids', () => {
    expect(isUid('a1b2-c3')).toBe(true)
    expect(isUid('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
  })

  it.each(['', 'a b', 'x'.repeat(65), 5, null])('rejects %j', (value) => {
    expect(isUid(value)).toBe(false)
  })
})

describe('parseQueueName', () => {
  it('trims the name', () => {
    expect(parseQueueName('  Rock  ')).toBe('Rock')
  })

  it('accepts exactly the maximum length', () => {
    expect(parseQueueName('a'.repeat(MAX_QUEUE_NAME))).toBe('a'.repeat(MAX_QUEUE_NAME))
  })

  it.each(['', '   ', 'a'.repeat(MAX_QUEUE_NAME + 1), 5, null, undefined])('rejects %j', (value) => {
    expect(parseQueueName(value)).toBeNull()
  })
})

describe('isMoveIndex', () => {
  it('accepts integers inside the range', () => {
    expect(isMoveIndex(0, 3)).toBe(true)
    expect(isMoveIndex(2, 3)).toBe(true)
  })

  it.each([3, -1, 1.5, '1', null, Number.NaN])('rejects %j for length 3', (value) => {
    expect(isMoveIndex(value, 3)).toBe(false)
  })
})

describe('isUrlText', () => {
  it('accepts non-empty strings up to 2048 characters', () => {
    expect(isUrlText('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isUrlText('a'.repeat(2048))).toBe(true)
  })

  it.each(['', 'a'.repeat(2049), 5, null])('rejects %j', (value) => {
    expect(isUrlText(value)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/shared/validate.test.ts`
Expected: FAIL (módulo `./validate` não existe).

- [ ] **Step 3: Implementar `src/shared/validate.ts`**

```ts
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{10,}$/
const UID = /^[A-Za-z0-9-]{1,64}$/
const MAX_URL_LENGTH = 2048

export const MAX_QUEUE_NAME = 100
export const MAX_SAVED_QUEUES = 50
export const MAX_QUEUE_ITEMS = 200

export const isVideoId = (v: unknown): v is string => typeof v === 'string' && VIDEO_ID.test(v)

export const isListId = (v: unknown): v is string => typeof v === 'string' && LIST_ID.test(v)

export const isUid = (v: unknown): v is string => typeof v === 'string' && UID.test(v)

export function parseQueueName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  return name.length > 0 && name.length <= MAX_QUEUE_NAME ? name : null
}

export const isMoveIndex = (v: unknown, length: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length

export const isUrlText = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_URL_LENGTH
```

- [ ] **Step 4: Adicionar tipos, canais e `ProbeApi`**

`src/shared/types.ts` — trocar

```ts
export type PlayerCommand =
  | { type: 'load'; target: YoutubeTarget; url: string }
```

por

```ts
export type PlayerCommand =
  | { type: 'load'; target: YoutubeTarget; url: string }
  | { type: 'play-video'; videoId: string }
```

`src/shared/types.ts` — trocar

```ts
  duration: number
  error?: string
}
```

por

```ts
  duration: number
  error?: string
  skip?: boolean
}
```

`src/shared/types.ts` — acrescentar ao final do arquivo:

```ts

export interface QueueVideo {
  videoId: string
  title: string
}

export interface QueueItem extends QueueVideo {
  uid: string
}

export interface SavedQueue {
  name: string
  items: QueueVideo[]
}

export interface QueueState {
  items: QueueItem[]
  currentUid: string | null
  expanding: boolean
  saved: string[]
}

export type ProbeResult = { ok: true; ids: string[] } | { ok: false; error: string }
```

`src/shared/ipc.ts` — acrescentar ao final:

```ts
export const QUEUE_GET = 'queue:get'
export const QUEUE_ADD = 'queue:add'
export const QUEUE_REMOVE = 'queue:remove'
export const QUEUE_MOVE = 'queue:move'
export const QUEUE_CLEAR = 'queue:clear'
export const QUEUE_PLAY_AT = 'queue:play-at'
export const QUEUE_SAVE = 'queue:save'
export const QUEUE_LOAD_SAVED = 'queue:load-saved'
export const QUEUE_DELETE_SAVED = 'queue:delete-saved'
export const QUEUE_STATE = 'queue:state'
export const PROBE_RESULT = 'probe:result'
```

`src/shared/api.ts` — trocar a primeira linha

```ts
import type { DisplaysSnapshot, PlayerCommand, PlayerState, Settings } from './types'
```

por

```ts
import type { DisplaysSnapshot, PlayerCommand, PlayerState, ProbeResult, Settings } from './types'
```

e acrescentar ao final:

```ts

export interface ProbeApi {
  report(result: ProbeResult): void
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/shared/validate.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/shared/validate.ts src/shared/validate.test.ts src/shared/types.ts src/shared/ipc.ts src/shared/api.ts
git commit -m "feat: add queue contracts and payload validators"
```

---

### Task 2: PlaybackQueue

**Files:**
- Create: `src/main/queue.ts`
- Test: `src/main/queue.test.ts`

**Interfaces:**
- Consumes: `QueueItem`, `QueueVideo` de `../shared/types`
- Produces:
  - `type QueueAction = { play: QueueItem } | { stop: true } | null`
  - `class PlaybackQueue { constructor(newUid?: () => string); snapshot(): { items: QueueItem[]; currentUid: string | null }; add(videos: QueueVideo[]): QueueAction; replace(videos: QueueVideo[], startVideoId?: string): QueueAction; remove(uid: string): QueueAction; move(uid: string, toIndex: number): boolean; clear(): QueueAction; playAt(uid: string): QueueAction; next(auto?: boolean): QueueAction; prev(): QueueAction; setTitleByVideoId(videoId: string, title: string): boolean }`

Regras: `add` toca o primeiro item adicionado se a fila estava vazia ou se terminou automaticamente (`next(true)` no último). `next(false)` no último não faz nada; `next(true)` no último marca "terminou" e devolve `null`. Remover o item atual toca o item que ocupa o mesmo índice; se não houver, devolve `{ stop: true }` e zera o atual. `move(uid, toIndex)`: remove o item e o reinsere em `toIndex` (índice no array resultante).

- [ ] **Step 1: Escrever o teste que falha** — `src/main/queue.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { PlaybackQueue } from './queue'

const v = (videoId: string, title = videoId) => ({ videoId, title })

function make() {
  let n = 0
  return new PlaybackQueue(() => `u${++n}`)
}

const ids = (q: PlaybackQueue) => q.snapshot().items.map((i) => i.videoId)

describe('add', () => {
  it('plays the first added item when the queue was empty', () => {
    const q = make()
    const action = q.add([v('a'), v('b')])
    expect(action).toEqual({ play: { uid: 'u1', videoId: 'a', title: 'a' } })
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('appends without playing when something is already queued', () => {
    const q = make()
    q.add([v('a')])
    expect(q.add([v('b')])).toBeNull()
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('plays the first new item after the queue ended automatically', () => {
    const q = make()
    q.add([v('a')])
    expect(q.next(true)).toBeNull()
    expect(q.add([v('b')])).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('does nothing for an empty list', () => {
    const q = make()
    expect(q.add([])).toBeNull()
    expect(ids(q)).toEqual([])
  })
})

describe('replace', () => {
  it('replaces the queue and plays the first item', () => {
    const q = make()
    q.add([v('x')])
    const action = q.replace([v('a'), v('b')])
    expect(ids(q)).toEqual(['a', 'b'])
    expect(action).toEqual({ play: { uid: 'u2', videoId: 'a', title: 'a' } })
  })

  it('starts at the requested video when it is present', () => {
    const q = make()
    const action = q.replace([v('a'), v('b'), v('c')], 'b')
    expect(action).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
  })

  it('falls back to the first item when the start video is missing', () => {
    const q = make()
    const action = q.replace([v('a'), v('b')], 'zzz')
    expect(action).toEqual({ play: { uid: 'u1', videoId: 'a', title: 'a' } })
  })

  it('stops when replaced by nothing', () => {
    const q = make()
    q.add([v('a')])
    expect(q.replace([])).toEqual({ stop: true })
    expect(q.snapshot()).toEqual({ items: [], currentUid: null })
  })
})

describe('remove', () => {
  it('keeps the current item when removing another one', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.remove('u3')).toBeNull()
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('plays the next item when the current one is removed', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.remove('u1')).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(ids(q)).toEqual(['b', 'c'])
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('stops when the current and last item is removed', () => {
    const q = make()
    q.add([v('a'), v('b')])
    q.playAt('u2')
    expect(q.remove('u2')).toEqual({ stop: true })
    expect(q.snapshot().currentUid).toBeNull()
    expect(ids(q)).toEqual(['a'])
  })

  it('ignores unknown uids', () => {
    const q = make()
    q.add([v('a')])
    expect(q.remove('nope')).toBeNull()
    expect(ids(q)).toEqual(['a'])
  })
})

describe('move', () => {
  it('moves an item forward and backward', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.move('u1', 2)).toBe(true)
    expect(ids(q)).toEqual(['b', 'c', 'a'])
    expect(q.move('u3', 0)).toBe(true)
    expect(ids(q)).toEqual(['c', 'b', 'a'])
  })

  it('does not change the current item', () => {
    const q = make()
    q.add([v('a'), v('b')])
    q.move('u1', 1)
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('rejects unknown uids and invalid indexes', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.move('nope', 0)).toBe(false)
    expect(q.move('u1', 2)).toBe(false)
    expect(q.move('u1', -1)).toBe(false)
    expect(q.move('u1', 0.5)).toBe(false)
    expect(ids(q)).toEqual(['a', 'b'])
  })
})

describe('clear and playAt', () => {
  it('clear empties the queue and stops', () => {
    const q = make()
    q.add([v('a')])
    expect(q.clear()).toEqual({ stop: true })
    expect(q.snapshot()).toEqual({ items: [], currentUid: null })
  })

  it('playAt selects an item and ignores unknown uids', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.playAt('u2')).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(q.snapshot().currentUid).toBe('u2')
    expect(q.playAt('nope')).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
  })
})

describe('next and prev', () => {
  it('moves forward and backward', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.next()).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(q.prev()).toEqual({ play: { uid: 'u1', videoId: 'a', title: 'a' } })
  })

  it('does nothing at the edges for manual navigation', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.prev()).toBeNull()
    q.playAt('u2')
    expect(q.next()).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('manual next on the last item does not mark the queue as ended', () => {
    const q = make()
    q.add([v('a')])
    q.next()
    expect(q.add([v('b')])).toBeNull()
  })

  it('does nothing without a current item', () => {
    const q = make()
    expect(q.next()).toBeNull()
    expect(q.prev()).toBeNull()
  })
})

describe('setTitleByVideoId', () => {
  it('updates only provisional titles of matching videos', () => {
    const q = make()
    q.add([v('a'), v('a', 'Custom'), v('b')])
    expect(q.setTitleByVideoId('a', 'Real title')).toBe(true)
    expect(q.snapshot().items.map((i) => i.title)).toEqual(['Real title', 'Custom', 'b'])
    expect(q.setTitleByVideoId('a', 'Other')).toBe(false)
  })
})

describe('snapshot', () => {
  it('returns copies that do not leak mutations', () => {
    const q = make()
    q.add([v('a')])
    const snap = q.snapshot()
    snap.items[0].title = 'hacked'
    snap.items.pop()
    expect(q.snapshot().items).toEqual([{ uid: 'u1', videoId: 'a', title: 'a' }])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/queue.test.ts`
Expected: FAIL (módulo `./queue` não existe).

- [ ] **Step 3: Implementar `src/main/queue.ts`**

```ts
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
    const startFresh = this.items.length === 0 || this.atEnd
    this.items.push(...created)
    return startFresh ? this.play(created[0]) : null
  }

  replace(videos: QueueVideo[], startVideoId?: string): QueueAction {
    this.items = this.make(videos)
    this.atEnd = false
    if (this.items.length === 0) {
      this.currentUid = null
      return { stop: true }
    }
    const start = (startVideoId && this.items.find((i) => i.videoId === startVideoId)) || this.items[0]
    return this.play(start)
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/queue.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/main/queue.ts src/main/queue.test.ts
git commit -m "feat: add PlaybackQueue"
```

---

### Task 3: Concorrência limitada e oEmbed

**Files:**
- Create: `src/main/concurrency.ts`, `src/main/oembed.ts`
- Test: `src/main/concurrency.test.ts`, `src/main/oembed.test.ts`

**Interfaces:**
- Produces:
  - `mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]>`
  - `type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>`
  - `fetchVideoTitle(videoId: string, fetchImpl: FetchLike, timeoutMs?: number): Promise<string | null>`
  - `fetchTitles(videoIds: string[], onTitle: (videoId: string, title: string) => void, fetchImpl: FetchLike, limit?: number): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

`src/main/concurrency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

describe('mapWithConcurrency', () => {
  it('keeps results in input order', async () => {
    const results = await mapWithConcurrency([30, 5, 15], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })
    expect(results).toEqual([
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 5 },
      { status: 'fulfilled', value: 15 },
    ])
  })

  it('never runs more than the limit at once', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
    })
    expect(peak).toBe(3)
  })

  it('isolates rejections', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1].status).toBe('rejected')
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
  })
})
```

`src/main/oembed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fetchTitles, fetchVideoTitle, type FetchLike } from './oembed'

const ok = (body: unknown): FetchLike => async () => ({ ok: true, json: async () => body })

describe('fetchVideoTitle', () => {
  it('returns the trimmed title and queries the oEmbed endpoint', async () => {
    let requested = ''
    const fetchImpl: FetchLike = async (url) => {
      requested = url
      return { ok: true, json: async () => ({ title: '  Never Gonna Give You Up  ' }) }
    }
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBe('Never Gonna Give You Up')
    expect(requested).toBe(
      `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}&format=json`,
    )
  })

  it('returns null for non-ok responses', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, json: async () => ({}) })
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBeNull()
  })

  it('returns null when the request throws', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('offline')
    }
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBeNull()
  })

  it.each([{}, { title: 5 }, { title: '   ' }, null])('returns null for body %j', async (body) => {
    expect(await fetchVideoTitle('dQw4w9WgXcQ', ok(body))).toBeNull()
  })

  it('aborts and returns null after the timeout', async () => {
    const fetchImpl: FetchLike = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl, 10)).toBeNull()
  })
})

describe('fetchTitles', () => {
  it('reports titles for unique ids and skips failures', async () => {
    const seen: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url)
      if (url.includes('bbbbbbbbbbb')) return { ok: false, json: async () => ({}) }
      return { ok: true, json: async () => ({ title: 'T' }) }
    }
    const titles: Record<string, string> = {}
    await fetchTitles(
      ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa'],
      (id, title) => {
        titles[id] = title
      },
      fetchImpl,
    )
    expect(seen).toHaveLength(2)
    expect(titles).toEqual({ aaaaaaaaaaa: 'T' })
  })

  it('respects the concurrency limit', async () => {
    let active = 0
    let peak = 0
    const fetchImpl: FetchLike = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return { ok: true, json: async () => ({ title: 'T' }) }
    }
    const ids = Array.from({ length: 7 }, (_, i) => String(i).padStart(11, 'x'))
    await fetchTitles(ids, () => {}, fetchImpl, 2)
    expect(peak).toBe(2)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/concurrency.test.ts src/main/oembed.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`src/main/concurrency.ts`:

```ts
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
```

`src/main/oembed.ts`:

```ts
import { mapWithConcurrency } from './concurrency'

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>

export async function fetchVideoTitle(
  videoId: string,
  fetchImpl: FetchLike,
  timeoutMs = 8000,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) return null
    const body = (await response.json()) as { title?: unknown } | null
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    return title || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchTitles(
  videoIds: string[],
  onTitle: (videoId: string, title: string) => void,
  fetchImpl: FetchLike,
  limit = 5,
): Promise<void> {
  const unique = [...new Set(videoIds)]
  await mapWithConcurrency(unique, limit, async (id) => {
    const title = await fetchVideoTitle(id, fetchImpl)
    if (title) onTitle(id, title)
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/concurrency.test.ts src/main/oembed.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/main/concurrency.ts src/main/concurrency.test.ts src/main/oembed.ts src/main/oembed.test.ts
git commit -m "feat: add oEmbed title fetching with bounded concurrency"
```

---

### Task 4: Filas salvas no SettingsStore

**Files:**
- Modify: `src/shared/types.ts` (Settings), `src/main/settingsStore.ts`, `src/main/settingsStore.test.ts`

**Interfaces:**
- Consumes: `MAX_SAVED_QUEUES`, `isVideoId`, `parseQueueName` de `../shared/validate`; `QueueVideo`, `SavedQueue` de `../shared/types`
- Produces: `Settings.queues: SavedQueue[]`; `SettingsStore.saveQueue(name: string, items: QueueVideo[]): boolean` (false se nome inválido, itens vazios/inválidos ou limite de 50 filas atingido para nome novo; sobrescrever mantém a posição); `SettingsStore.deleteQueue(name: string): void`; `get()` devolve cópias profundas de `queues`.

- [ ] **Step 1: Atualizar e ampliar os testes (devem falhar)**

Em `src/main/settingsStore.test.ts`, os quatro `toEqual` que comparam o objeto inteiro passam a incluir `queues`:

- `expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [] })` aparece 2 vezes (testes "returns defaults when the file does not exist" e "falls back to defaults on corrupt JSON"): trocar ambas por `expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [], queues: [] })`.
- No teste "persists display, volume and history across instances", trocar

```ts
      history: ['https://youtu.be/dQw4w9WgXcQ'],
    })
```

por

```ts
      history: ['https://youtu.be/dQw4w9WgXcQ'],
      queues: [],
    })
```

- No teste "drops invalid field types", trocar `.toEqual({ volume: 100, history: ['ok'] })` por `.toEqual({ volume: 100, history: ['ok'], queues: [] })`.

Acrescentar ao final do arquivo (antes do último `})` do `describe` não é necessário: crie um segundo `describe`):

```ts

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'

describe('SettingsStore saved queues', () => {
  it('saves a queue and persists it', () => {
    const store = new SettingsStore(file)
    expect(store.saveQueue('  Rock  ', [{ videoId: A, title: 'Song A' }])).toBe(true)
    expect(new SettingsStore(file).get().queues).toEqual([
      { name: 'Rock', items: [{ videoId: A, title: 'Song A' }] },
    ])
  })

  it('overwrites an existing name keeping its position', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    store.saveQueue('Two', [{ videoId: A, title: 'A' }])
    expect(store.saveQueue('One', [{ videoId: B, title: 'B' }])).toBe(true)
    expect(store.get().queues.map((q) => q.name)).toEqual(['One', 'Two'])
    expect(store.get().queues[0].items).toEqual([{ videoId: B, title: 'B' }])
  })

  it('rejects invalid names, empty queues and invalid items', () => {
    const store = new SettingsStore(file)
    expect(store.saveQueue('   ', [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('x'.repeat(101), [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('Empty', [])).toBe(false)
    expect(store.saveQueue('Bad', [{ videoId: 'nope', title: 'A' }])).toBe(false)
    expect(store.get().queues).toEqual([])
  })

  it('refuses new names beyond 50 queues but still allows overwriting', () => {
    const store = new SettingsStore(file)
    for (let i = 0; i < 50; i++) expect(store.saveQueue(`q${i}`, [{ videoId: A, title: 'A' }])).toBe(true)
    expect(store.saveQueue('one-more', [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('q0', [{ videoId: B, title: 'B' }])).toBe(true)
    expect(store.get().queues).toHaveLength(50)
  })

  it('deletes a queue', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    store.deleteQueue('One')
    store.deleteQueue('missing')
    expect(new SettingsStore(file).get().queues).toEqual([])
  })

  it('drops invalid saved queues on read', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(
      file,
      JSON.stringify({
        queues: [
          { name: 'Good', items: [{ videoId: A, title: 'A' }] },
          { name: '', items: [{ videoId: A, title: 'A' }] },
          { name: 'NoItems', items: [] },
          { name: 'BadId', items: [{ videoId: 'x', title: 'A' }] },
          'garbage',
        ],
      }),
    )
    expect(new SettingsStore(file).get().queues).toEqual([{ name: 'Good', items: [{ videoId: A, title: 'A' }] }])
  })

  it('get returns deep copies', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    const copy = store.get()
    copy.queues[0].items[0].title = 'hacked'
    copy.queues.pop()
    expect(store.get().queues[0].items[0].title).toBe('A')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/settingsStore.test.ts`
Expected: FAIL (`saveQueue is not a function` e `queues` ausente).

- [ ] **Step 3: Implementar**

`src/shared/types.ts` — trocar

```ts
export interface Settings {
  display?: SavedDisplay
  volume: number
  history: string[]
}
```

por

```ts
export interface Settings {
  display?: SavedDisplay
  volume: number
  history: string[]
  queues: SavedQueue[]
}
```

`src/main/settingsStore.ts` — trocar as linhas 1-15 (imports, `MAX_HISTORY`, `clampVolume`, `isSavedDisplay`) por:

```ts
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
```

`src/main/settingsStore.ts` — trocar o método `get()` por:

```ts
  get(): Settings {
    return { ...this.data, history: [...this.data.history], queues: this.data.queues.map(copyQueue) }
  }
```

`src/main/settingsStore.ts` — acrescentar antes de `private read()`:

```ts
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

```

`src/main/settingsStore.ts` — em `read()`, trocar

```ts
        display: isSavedDisplay(raw.display) ? raw.display : undefined,
      }
    } catch {
      return { volume: 100, history: [] }
    }
```

por

```ts
        display: isSavedDisplay(raw.display) ? raw.display : undefined,
        queues: Array.isArray(raw.queues) ? raw.queues.filter(isSavedQueue).slice(0, MAX_SAVED_QUEUES).map(copyQueue) : [],
      }
    } catch {
      return { volume: 100, history: [], queues: [] }
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: todos os testes passam (os existentes + os novos) e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/settingsStore.ts src/main/settingsStore.test.ts
git commit -m "feat: persist named saved queues"
```

---

### Task 5: QueueManager

**Files:**
- Create: `src/main/queueManager.ts`
- Test: `src/main/queueManager.test.ts`

**Interfaces:**
- Consumes: `PlaybackQueue`, `QueueAction` de `./queue`; `parseYoutubeUrl` de `../shared/parseYoutubeUrl`; `MAX_QUEUE_ITEMS`, `isVideoId` de `../shared/validate`; tipos `PlayerState`, `PlayerStatus`, `QueueState`, `QueueVideo`, `SavedQueue` de `../shared/types`
- Produces:
  - `interface QueueManagerDeps { expandPlaylist(listId: string): Promise<string[]>; fetchTitles(videoIds: string[], onTitle: (videoId: string, title: string) => void): Promise<void>; playVideo(videoId: string): void; stopPlayer(): void; addHistory(url: string): void; saved: { list(): SavedQueue[]; save(name: string, items: QueueVideo[]): boolean; delete(name: string): void }; publish(state: QueueState): void; notify(message: string): void }`
  - `class QueueManager { constructor(deps: QueueManagerDeps, queue?: PlaybackQueue); state(): QueueState; add(url: string, playNow: boolean): Promise<void>; remove(uid: string): void; move(uid: string, toIndex: number): void; clear(): void; playAt(uid: string): void; next(): void; prev(): void; save(name: string): void; loadSaved(name: string): void; deleteSaved(name: string): void; onPlayerState(state: PlayerState): void; settled(): Promise<void> }`

Comportamento: `add` é serializado (as chamadas executam em ordem de pedido, mesmo com expansão pendente); o player é parado (`stopPlayer`) em `{ stop: true }`; `onPlayerState` avança (via `queue.next(true)`) só na transição para `ended`, ou para `error` com `skip === true` (neste caso com `notify('Pulando vídeo: <erro>')`); `lastStatus` volta a `idle` toda vez que um vídeo é iniciado ou o player é parado; `settled()` espera os jobs de título pendentes.

- [ ] **Step 1: Escrever o teste que falha** — `src/main/queueManager.test.ts`

```ts
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
  const saved: SavedQueue[] = []
  const played: string[] = []
  const published: QueueState[] = []
  const notices: string[] = []
  const history: string[] = []
  const titles: Record<string, string> = {}
  const deps: QueueManagerDeps = {
    expandPlaylist: async () => [V1, V2, V3],
    fetchTitles: async (ids, onTitle) => {
      for (const id of ids) if (titles[id]) onTitle(id, titles[id])
    },
    playVideo: (id) => {
      played.push(id)
    },
    stopPlayer: () => {
      stops++
    },
    addHistory: (u) => {
      history.push(u)
    },
    saved: {
      list: () => saved,
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
    publish: (state) => {
      published.push(state)
    },
    notify: (message) => {
      notices.push(message)
    },
    ...overrides,
  }
  const manager = new QueueManager(deps, new PlaybackQueue(() => `u${++n}`))
  return { manager, played, published, notices, history, titles, saved, stops: () => stops }
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

describe('QueueManager editing', () => {
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
    expect(t.notices).toHaveLength(1)
  })

  it('loads a saved queue, replacing the current one and playing it', async () => {
    const t = setup()
    t.saved.push({ name: 'Mix', items: [{ videoId: V2, title: 'Two' }, { videoId: V3, title: 'Three' }] })
    await t.manager.add(url(V1), false)
    t.manager.loadSaved('Mix')
    expect(t.manager.state().items.map((i) => i.title)).toEqual(['Two', 'Three'])
    expect(t.played).toEqual([V1, V2])
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/queueManager.test.ts`
Expected: FAIL (módulo `./queueManager` não existe).

- [ ] **Step 3: Implementar `src/main/queueManager.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/queueManager.test.ts && npm test && npm run typecheck`
Expected: PASS, suíte inteira verde, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/main/queueManager.ts src/main/queueManager.test.ts
git commit -m "feat: add QueueManager orchestrating queue, expansion and saved queues"
```

---

### Task 6: Janela probe e expansão de playlist

Sem GUI não há teste automatizado (depende do YouTube real); a verificação é typecheck + build.

**Files:**
- Create: `src/renderer/probe/index.html`, `src/renderer/probe/main.ts`, `src/preload/probe.ts`, `src/main/playlistExpander.ts`
- Modify: `src/main/windows.ts`, `src/renderer/env.d.ts`, `electron.vite.config.ts`

**Interfaces:**
- Consumes: `PROBE_RESULT` de `../shared/ipc`; `ProbeApi` de `../shared/api`; `ProbeResult` de `../shared/types`; `isListId`, `isVideoId` de `../shared/validate`; `describeYtError` de `../shared/playerErrors`
- Produces: `createProbeWindow(baseUrl: string, listId: string): BrowserWindow` (oculta, `lockDown`, preload `probe`); `expandPlaylist(baseUrl: string, listId: string, timeoutMs?: number): Promise<string[]>` (rejeita com `Error` e mensagem em português em caso de id inválido, erro do player, timeout ou janela fechada; sempre destrói a janela); `window.probe: ProbeApi`.

- [ ] **Step 1: Página e renderer da probe**

`src/renderer/probe/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Probe</title>
  </head>
  <body>
    <div id="yt"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/probe/main.ts`:

```ts
import { describeYtError } from '../../shared/playerErrors'
import type { ProbeResult } from '../../shared/types'

interface ProbePlayer {
  getPlaylist(): string[] | null
  mute(): void
}

interface ProbeWindow {
  YT: { Player: new (element: string, options: unknown) => ProbePlayer }
  onYouTubeIframeAPIReady: () => void
}

const w = window as unknown as ProbeWindow
const listId = location.hash.slice(1)
let poll: ReturnType<typeof setInterval> | undefined
let done = false

function finish(result: ProbeResult): void {
  if (done) return
  done = true
  if (poll) clearInterval(poll)
  window.probe.report(result)
}

function start(): void {
  const player: ProbePlayer = new w.YT.Player('yt', {
    width: '320',
    height: '180',
    playerVars: { listType: 'playlist', list: listId, autoplay: 0, controls: 0, origin: location.origin },
    events: {
      onReady: () => {
        player.mute()
        poll = setInterval(() => {
          const ids = player.getPlaylist()
          if (ids && ids.length > 0) finish({ ok: true, ids: [...ids] })
        }, 300)
      },
      onError: (event: { data: number }) => finish({ ok: false, error: describeYtError(event.data).message }),
    },
  })
}

w.onYouTubeIframeAPIReady = start
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
script.onerror = () => finish({ ok: false, error: 'Não foi possível carregar o player do YouTube.' })
document.head.append(script)
```

`src/preload/probe.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ProbeApi } from '../shared/api'
import { PROBE_RESULT } from '../shared/ipc'

const api: ProbeApi = {
  report: (result) => ipcRenderer.send(PROBE_RESULT, result),
}

contextBridge.exposeInMainWorld('probe', api)
```

`src/renderer/env.d.ts` — substituir o arquivo por:

```ts
import type { ControlApi, PlayerApi, ProbeApi } from '../shared/api'

declare global {
  interface Window {
    control: ControlApi
    player: PlayerApi
    probe: ProbeApi
  }
}

export {}
```

- [ ] **Step 2: Janela probe**

`src/main/windows.ts` — acrescentar ao final do arquivo (estilo do arquivo: aspas duplas e ponto e vírgula):

```ts

export function createProbeWindow(baseUrl: string, listId: string): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 270,
    webPreferences: { ...webPreferences("probe"), backgroundThrottling: false },
  });
  lockDown(win);
  void win.loadURL(`${baseUrl}/probe/index.html#${listId}`);
  return win;
}
```

- [ ] **Step 3: Expansor** — `src/main/playlistExpander.ts`

```ts
import { ipcMain, type IpcMainEvent } from 'electron'
import { PROBE_RESULT } from '../shared/ipc'
import type { ProbeResult } from '../shared/types'
import { isListId, isVideoId } from '../shared/validate'
import { createProbeWindow } from './windows'

export function expandPlaylist(baseUrl: string, listId: string, timeoutMs = 15000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!isListId(listId)) {
      reject(new Error('Id de playlist inválido.'))
      return
    }
    const win = createProbeWindow(baseUrl, listId)
    let settled = false

    const finish = (error: Error | null, ids: string[] = []) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener(PROBE_RESULT, onResult)
      if (!win.isDestroyed()) win.destroy()
      if (error) reject(error)
      else resolve(ids)
    }

    const onResult = (event: IpcMainEvent, result: ProbeResult) => {
      if (event.sender !== win.webContents) return
      if (result && result.ok === true && Array.isArray(result.ids)) {
        finish(null, result.ids.filter(isVideoId))
      } else {
        const message = result && result.ok === false && typeof result.error === 'string' ? result.error : 'Resposta inválida do player.'
        finish(new Error(message))
      }
    }

    const timer = setTimeout(
      () => finish(new Error('Tempo esgotado (playlist privada, indisponível ou vazia).')),
      timeoutMs,
    )
    ipcMain.on(PROBE_RESULT, onResult)
    win.on('closed', () => finish(new Error('Janela de leitura da playlist foi fechada.')))
  })
}
```

- [ ] **Step 4: Configuração de build**

`electron.vite.config.ts` — trocar

```ts
          player: resolve('src/preload/player.ts'),
        },
```

por

```ts
          player: resolve('src/preload/player.ts'),
          probe: resolve('src/preload/probe.ts'),
        },
```

e trocar

```ts
          identify: resolve('src/renderer/identify/index.html'),
```

por

```ts
          identify: resolve('src/renderer/identify/index.html'),
          probe: resolve('src/renderer/probe/index.html'),
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run build && ls out/preload out/renderer/probe`
Expected: typecheck limpo; build ok; `out/preload` contém `control.js`, `player.js`, `probe.js` (sem pasta `chunks`); `out/renderer/probe/index.html` existe.

Run: `grep -o "require([^)]*)" out/preload/probe.js | sort -u`
Expected: somente `require("electron")`.

Run: `npm test`
Expected: suíte verde.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/probe src/preload/probe.ts src/main/playlistExpander.ts src/main/windows.ts src/renderer/env.d.ts electron.vite.config.ts
git commit -m "feat: add hidden probe window to expand playlists"
```

---

### Task 7: Fiação do backend (player por vídeo, IPC da fila, preload do controle)

Troca o modelo de reprodução: o player toca um vídeo por vez e o main avança a fila. Ao fim da task o app compila e a fila funciona por IPC, com os dois botões de adicionar já na UI (a lista da fila vem na Task 8).

**Files:**
- Modify: `src/shared/types.ts` (remove `load`), `src/shared/api.ts` (substituir), `src/preload/control.ts` (substituir), `src/main/playerController.ts` (substituir), `src/main/index.ts` (substituir), `src/renderer/player/main.ts` (substituir), `src/renderer/control/index.html`, `src/renderer/control/playback.ts`, `src/renderer/control/style.css`

**Interfaces:**
- Consumes: tudo das Tasks 1–6.
- Produces: `ControlApi` com `queueGet(): Promise<QueueState | null>`, `queueAdd(url: string, playNow: boolean): void`, `queueRemove(uid: string): void`, `queueMove(uid: string, toIndex: number): void`, `queueClear(): void`, `queuePlayAt(uid: string): void`, `queueSave(name: string): void`, `queueLoadSaved(name: string): void`, `queueDeleteSaved(name: string): void`, `onQueueState(cb: (state: QueueState) => void): Unsubscribe`; `PlayerCommand` sem `load`; comandos `next`/`prev` enviados pelo controle são tratados pelo `QueueManager` e nunca chegam ao player.

- [ ] **Step 1: Remover `load` de `PlayerCommand`**

`src/shared/types.ts` — trocar

```ts
  | { type: 'load'; target: YoutubeTarget; url: string }
  | { type: 'play-video'; videoId: string }
```

por

```ts
  | { type: 'play-video'; videoId: string }
```

- [ ] **Step 2: `src/shared/api.ts` (arquivo inteiro)**

```ts
import type { DisplaysSnapshot, PlayerCommand, PlayerState, ProbeResult, QueueState, Settings } from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  getDisplays(): Promise<DisplaysSnapshot>
  selectDisplay(id: number): Promise<DisplaysSnapshot>
  identifyDisplays(): Promise<void>
  getSettings(): Promise<Settings>
  sendCommand(cmd: PlayerCommand): void
  queueGet(): Promise<QueueState | null>
  queueAdd(url: string, playNow: boolean): void
  queueRemove(uid: string): void
  queueMove(uid: string, toIndex: number): void
  queueClear(): void
  queuePlayAt(uid: string): void
  queueSave(name: string): void
  queueLoadSaved(name: string): void
  queueDeleteSaved(name: string): void
  onState(cb: (state: PlayerState) => void): Unsubscribe
  onQueueState(cb: (state: QueueState) => void): Unsubscribe
  onDisplaysChanged(cb: (snapshot: DisplaysSnapshot) => void): Unsubscribe
  onNotice(cb: (message: string) => void): Unsubscribe
}

export interface PlayerApi {
  ready(): void
  report(state: PlayerState): void
  onCommand(cb: (cmd: PlayerCommand) => void): Unsubscribe
}

export interface ProbeApi {
  report(result: ProbeResult): void
}
```

- [ ] **Step 3: `src/preload/control.ts` (arquivo inteiro)**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ControlApi, Unsubscribe } from '../shared/api'
import {
  CMD_FROM_CONTROL,
  DISPLAYS_CHANGED,
  DISPLAYS_IDENTIFY,
  DISPLAYS_LIST,
  DISPLAYS_SELECT,
  NOTICE,
  QUEUE_ADD,
  QUEUE_CLEAR,
  QUEUE_DELETE_SAVED,
  QUEUE_GET,
  QUEUE_LOAD_SAVED,
  QUEUE_MOVE,
  QUEUE_PLAY_AT,
  QUEUE_REMOVE,
  QUEUE_SAVE,
  QUEUE_STATE,
  SETTINGS_GET,
  STATE_TO_CONTROL,
} from '../shared/ipc'

function subscribe<T>(channel: string, cb: (value: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ControlApi = {
  getDisplays: () => ipcRenderer.invoke(DISPLAYS_LIST),
  selectDisplay: (id) => ipcRenderer.invoke(DISPLAYS_SELECT, id),
  identifyDisplays: () => ipcRenderer.invoke(DISPLAYS_IDENTIFY),
  getSettings: () => ipcRenderer.invoke(SETTINGS_GET),
  sendCommand: (cmd) => ipcRenderer.send(CMD_FROM_CONTROL, cmd),
  queueGet: () => ipcRenderer.invoke(QUEUE_GET),
  queueAdd: (url, playNow) => ipcRenderer.send(QUEUE_ADD, { url, playNow }),
  queueRemove: (uid) => ipcRenderer.send(QUEUE_REMOVE, uid),
  queueMove: (uid, toIndex) => ipcRenderer.send(QUEUE_MOVE, { uid, toIndex }),
  queueClear: () => ipcRenderer.send(QUEUE_CLEAR),
  queuePlayAt: (uid) => ipcRenderer.send(QUEUE_PLAY_AT, uid),
  queueSave: (name) => ipcRenderer.send(QUEUE_SAVE, name),
  queueLoadSaved: (name) => ipcRenderer.send(QUEUE_LOAD_SAVED, name),
  queueDeleteSaved: (name) => ipcRenderer.send(QUEUE_DELETE_SAVED, name),
  onState: (cb) => subscribe(STATE_TO_CONTROL, cb),
  onQueueState: (cb) => subscribe(QUEUE_STATE, cb),
  onDisplaysChanged: (cb) => subscribe(DISPLAYS_CHANGED, cb),
  onNotice: (cb) => subscribe(NOTICE, cb),
}

contextBridge.exposeInMainWorld('control', api)
```

- [ ] **Step 4: `src/main/playerController.ts` (arquivo inteiro)**

```ts
import type { BrowserWindow, WebContents } from 'electron'
import { CMD_TO_PLAYER } from '../shared/ipc'
import type { DisplayInfo, PlayerCommand } from '../shared/types'
import { CommandQueue } from './commandQueue'
import { createPlayerWindow } from './windows'

export interface PlayerTarget {
  display: DisplayInfo
  windowed: boolean
}

type Mode = 'screen' | 'window'

export class PlayerController {
  private win: BrowserWindow | null = null
  private mode: Mode = 'screen'
  private lastPlay: PlayerCommand | null = null
  private lastVolume: PlayerCommand | null = null
  private readonly queue = new CommandQueue<PlayerCommand>((cmd) =>
    this.win?.webContents.send(CMD_TO_PLAYER, cmd),
  )

  constructor(
    private readonly baseUrl: string,
    private readonly onClosed: () => void,
  ) {}

  isOpen(): boolean {
    return this.win !== null
  }

  owns(sender: WebContents): boolean {
    return this.win !== null && this.win.webContents === sender
  }

  markReady(): void {
    this.queue.markReady()
  }

  send(cmd: PlayerCommand, target: PlayerTarget): void {
    if (cmd.type === 'stop') {
      this.close()
      return
    }
    if (!this.win && cmd.type !== 'play-video') return
    if (cmd.type === 'play-video') {
      const replay = this.lastPlay
      this.lastPlay = cmd
      this.place(target, replay)
    } else if (cmd.type === 'volume') {
      this.lastVolume = cmd
    }
    this.queue.push(cmd)
  }

  reposition(target: PlayerTarget): void {
    if (this.win) this.place(target, this.lastPlay)
  }

  close(): void {
    if (!this.win) return
    this.destroy()
    this.lastPlay = null
    this.lastVolume = null
    this.onClosed()
  }

  private place(target: PlayerTarget, replay: PlayerCommand | null): void {
    const mode: Mode = target.windowed ? 'window' : 'screen'
    if (this.win && this.mode !== mode) this.destroy()
    if (!this.win) {
      this.open(target, mode)
      if (replay) {
        this.queue.push(replay)
        if (this.lastVolume) this.queue.push(this.lastVolume)
      }
    } else if (mode === 'screen') {
      const { x, y, width, height } = target.display
      this.win.setBounds({ x, y, width, height })
    }
  }

  private open(target: PlayerTarget, mode: Mode): void {
    const win = createPlayerWindow(this.baseUrl, target.display, target.windowed)
    this.win = win
    this.mode = mode
    this.queue.reset()
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.lastPlay = null
      this.lastVolume = null
      this.queue.reset()
      this.onClosed()
    })
  }

  private destroy(): void {
    const win = this.win
    this.win = null
    this.queue.reset()
    if (win && !win.isDestroyed()) win.destroy()
  }
}
```

- [ ] **Step 5: `src/main/index.ts` (arquivo inteiro)**

```ts
import { join } from 'node:path'
import { app, dialog, ipcMain, net, screen, type BrowserWindow, type WebContents } from 'electron'
import {
  CMD_FROM_CONTROL,
  DISPLAYS_CHANGED,
  DISPLAYS_IDENTIFY,
  DISPLAYS_LIST,
  DISPLAYS_SELECT,
  NOTICE,
  PLAYER_READY,
  QUEUE_ADD,
  QUEUE_CLEAR,
  QUEUE_DELETE_SAVED,
  QUEUE_GET,
  QUEUE_LOAD_SAVED,
  QUEUE_MOVE,
  QUEUE_PLAY_AT,
  QUEUE_REMOVE,
  QUEUE_SAVE,
  QUEUE_STATE,
  SETTINGS_GET,
  STATE_FROM_PLAYER,
  STATE_TO_CONTROL,
} from '../shared/ipc'
import { IDLE_STATE, type DisplaysSnapshot, type PlayerCommand, type PlayerState } from '../shared/types'
import { isMoveIndex, isUid, isUrlText, parseQueueName } from '../shared/validate'
import { findSaved, pickDisplay, shouldWindow, toDisplayInfos, toSavedDisplay } from './displays'
import { fetchTitles } from './oembed'
import { PlayerController, type PlayerTarget } from './playerController'
import { expandPlaylist } from './playlistExpander'
import { QueueManager } from './queueManager'
import { SettingsStore } from './settingsStore'
import { startStaticServer } from './staticServer'
import { createControlWindow, identifyDisplays } from './windows'

async function main(): Promise<void> {
  await app.whenReady()

  const baseUrl =
    process.env['ELECTRON_RENDERER_URL'] ?? (await startStaticServer(join(__dirname, '../renderer'))).url
  const store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  let controlWin: BrowserWindow | null = null

  const resolveDisplays = () => {
    const displays = toDisplayInfos(screen.getAllDisplays(), screen.getPrimaryDisplay().id)
    return { displays, selected: pickDisplay(store.get().display, displays) }
  }
  const snapshot = (): DisplaysSnapshot => {
    const { displays, selected } = resolveDisplays()
    return { displays, selectedId: selected.id }
  }
  const target = (): PlayerTarget => {
    const { displays, selected } = resolveDisplays()
    const controlDisplayId =
      controlWin && !controlWin.isDestroyed()
        ? screen.getDisplayMatching(controlWin.getBounds()).id
        : undefined
    return { display: selected, windowed: shouldWindow(displays, selected, controlDisplayId) }
  }
  const toControl = (channel: string, payload: unknown) => {
    if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(channel, payload)
  }
  const isControl = (sender: WebContents) =>
    controlWin !== null && !controlWin.isDestroyed() && sender === controlWin.webContents

  const controller = new PlayerController(baseUrl, () => toControl(STATE_TO_CONTROL, IDLE_STATE))

  const manager = new QueueManager({
    expandPlaylist: (listId) => expandPlaylist(baseUrl, listId),
    fetchTitles: (ids, onTitle) => fetchTitles(ids, onTitle, (url, init) => net.fetch(url, init)),
    playVideo: (videoId) => {
      controller.send({ type: 'play-video', videoId }, target())
      controller.send({ type: 'volume', value: store.get().volume }, target())
    },
    stopPlayer: () => controller.close(),
    addHistory: (url) => store.addHistory(url),
    saved: {
      list: () => store.get().queues,
      save: (name, items) => store.saveQueue(name, items),
      delete: (name) => store.deleteQueue(name),
    },
    publish: (state) => toControl(QUEUE_STATE, state),
    notify: (message) => toControl(NOTICE, message),
  })

  ipcMain.handle(DISPLAYS_LIST, () => snapshot())
  ipcMain.handle(DISPLAYS_SELECT, (_event, id: number) => {
    const chosen = resolveDisplays().displays.find((d) => d.id === id)
    if (chosen) {
      store.setDisplay(toSavedDisplay(chosen))
      controller.reposition(target())
    }
    return snapshot()
  })
  ipcMain.handle(DISPLAYS_IDENTIFY, () => identifyDisplays(baseUrl, resolveDisplays().displays))
  ipcMain.handle(SETTINGS_GET, () => store.get())

  ipcMain.handle(QUEUE_GET, (event) => (isControl(event.sender) ? manager.state() : null))
  ipcMain.on(QUEUE_ADD, (event, payload: unknown) => {
    const { url, playNow } = (payload ?? {}) as { url?: unknown; playNow?: unknown }
    if (!isControl(event.sender) || !isUrlText(url)) return
    manager.add(url, playNow === true).catch((err) => toControl(NOTICE, String(err)))
  })
  ipcMain.on(QUEUE_REMOVE, (event, uid: unknown) => {
    if (isControl(event.sender) && isUid(uid)) manager.remove(uid)
  })
  ipcMain.on(QUEUE_MOVE, (event, payload: unknown) => {
    const { uid, toIndex } = (payload ?? {}) as { uid?: unknown; toIndex?: unknown }
    if (isControl(event.sender) && isUid(uid) && isMoveIndex(toIndex, manager.state().items.length)) {
      manager.move(uid, toIndex)
    }
  })
  ipcMain.on(QUEUE_CLEAR, (event) => {
    if (isControl(event.sender)) manager.clear()
  })
  ipcMain.on(QUEUE_PLAY_AT, (event, uid: unknown) => {
    if (isControl(event.sender) && isUid(uid)) manager.playAt(uid)
  })
  ipcMain.on(QUEUE_SAVE, (event, name: unknown) => {
    if (!isControl(event.sender)) return
    const clean = parseQueueName(name)
    if (clean) manager.save(clean)
    else toControl(NOTICE, 'Nome de fila inválido (use de 1 a 100 caracteres).')
  })
  ipcMain.on(QUEUE_LOAD_SAVED, (event, name: unknown) => {
    const clean = parseQueueName(name)
    if (isControl(event.sender) && clean) manager.loadSaved(clean)
  })
  ipcMain.on(QUEUE_DELETE_SAVED, (event, name: unknown) => {
    const clean = parseQueueName(name)
    if (isControl(event.sender) && clean) manager.deleteSaved(clean)
  })

  ipcMain.on(CMD_FROM_CONTROL, (event, cmd: PlayerCommand) => {
    if (!isControl(event.sender)) return
    switch (cmd.type) {
      case 'next':
        manager.next()
        return
      case 'prev':
        manager.prev()
        return
      case 'play-video':
        return
      case 'volume':
        store.setVolume(cmd.value)
        break
      case 'seek':
        if (!Number.isFinite(cmd.seconds)) return
        break
    }
    controller.send(cmd, target())
  })
  ipcMain.on(PLAYER_READY, (event) => {
    if (controller.owns(event.sender)) controller.markReady()
  })
  ipcMain.on(STATE_FROM_PLAYER, (event, state: PlayerState) => {
    if (!controller.owns(event.sender)) return
    toControl(STATE_TO_CONTROL, state)
    manager.onPlayerState(state)
  })

  const onDisplaysChanged = () => {
    const { displays } = resolveDisplays()
    if (controller.isOpen() && store.get().display && !findSaved(store.get().display, displays)) {
      toControl(NOTICE, 'Monitor desconectado — o player foi movido para outro monitor.')
    }
    controller.reposition(target())
    toControl(DISPLAYS_CHANGED, snapshot())
  }
  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)
  screen.on('display-metrics-changed', onDisplaysChanged)

  controlWin = createControlWindow(baseUrl)
  controlWin.on('closed', () => {
    controlWin = null
    app.quit()
  })
}

main().catch((err) => {
  dialog.showErrorBox('Erro ao iniciar', String(err))
  app.quit()
})
```

- [ ] **Step 6: `src/renderer/player/main.ts` (arquivo inteiro)**

```ts
import { describeYtError } from '../../shared/playerErrors'
import { IDLE_STATE, type PlayerCommand, type PlayerState } from '../../shared/types'

interface YTPlayer {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title: string }
}

declare global {
  interface Window {
    YT: { Player: new (element: string, options: unknown) => YTPlayer }
    onYouTubeIframeAPIReady: () => void
  }
}

const STATUS_BY_YT_STATE: Record<number, PlayerState['status']> = {
  [-1]: 'buffering',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'paused',
}

const api = window.player
let yt: YTPlayer | null = null
let playerReady = false
const backlog: PlayerCommand[] = []
let state: PlayerState = { ...IDLE_STATE }

function report(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch }
  api.report(state)
}

function build(): void {
  yt = new window.YT.Player('yt', {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        playerReady = true
        while (backlog.length) exec(backlog.shift()!)
        api.ready()
      },
      onStateChange: (event: { data: number }) => {
        const status = STATUS_BY_YT_STATE[event.data]
        if (!status || !yt) return
        report({ status, title: yt.getVideoData().title || state.title, duration: yt.getDuration() })
      },
      onError: (event: { data: number }) => {
        const info = describeYtError(event.data)
        report({ status: 'error', error: info.message, skip: info.skippable })
      },
    },
  })
}

function exec(cmd: PlayerCommand): void {
  if (!yt) return
  switch (cmd.type) {
    case 'play-video':
      report({
        status: 'buffering',
        title: '',
        currentTime: 0,
        duration: 0,
        error: undefined,
        skip: undefined,
      })
      yt.loadVideoById(cmd.videoId)
      break
    case 'play':
      yt.playVideo()
      break
    case 'pause':
      yt.pauseVideo()
      break
    case 'volume':
      yt.setVolume(cmd.value)
      break
    case 'seek':
      yt.seekTo(cmd.seconds, true)
      break
    case 'next':
    case 'prev':
    case 'stop':
      break
  }
}

api.onCommand((cmd) => {
  if (playerReady) exec(cmd)
  else backlog.push(cmd)
})

setInterval(() => {
  if (yt && playerReady && state.status === 'playing') {
    report({ currentTime: yt.getCurrentTime(), duration: yt.getDuration() })
  }
}, 500)

window.onYouTubeIframeAPIReady = build
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
document.head.append(script)
```

- [ ] **Step 7: Botões "Adicionar à fila" e "Tocar agora"**

`src/renderer/control/index.html` — trocar

```html
          <button id="play-url" type="button">Tocar</button>
```

por

```html
          <button id="add-url" type="button">Adicionar à fila</button>
          <button id="play-now" type="button">Tocar agora</button>
```

`src/renderer/control/style.css` — trocar a linha

```css
#stop, #identify { background: #3a3a3a; }
```

por

```css
#stop, #identify, #play-now { background: #3a3a3a; }
```

`src/renderer/control/playback.ts` — trocar o bloco

```ts
  const playFromUrl = () => {
    notice.hidden = true
    const target = parseYoutubeUrl(url.value)
    if (!target) {
      urlError.textContent = 'Link inválido. Cole um link de vídeo ou playlist do YouTube.'
      urlError.hidden = false
      return
    }
    urlError.hidden = true
    const value = url.value.trim()
    addHistoryOption(value)
    window.control.sendCommand({ type: 'load', target, url: value })
  }

  byId('play-url').addEventListener('click', playFromUrl)
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playFromUrl()
  })
```

por

```ts
  const submit = (playNow: boolean) => {
    notice.hidden = true
    if (!parseYoutubeUrl(url.value)) {
      urlError.textContent = 'Link inválido. Cole um link de vídeo ou playlist do YouTube.'
      urlError.hidden = false
      return
    }
    urlError.hidden = true
    const value = url.value.trim()
    addHistoryOption(value)
    window.control.queueAdd(value, playNow)
    url.value = ''
  }

  byId('add-url').addEventListener('click', () => submit(false))
  byId('play-now').addEventListener('click', () => submit(true))
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit(false)
  })
```

- [ ] **Step 8: Verificar**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck limpo; build ok com `out/preload/{control,player,probe}.js` (sem `chunks/`); todos os testes passam.

Run: `grep -rn "type: 'load'\|lastLoad" src || true`
Expected: nenhuma ocorrência.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/preload/control.ts src/main/playerController.ts src/main/index.ts src/renderer/player/main.ts src/renderer/control/index.html src/renderer/control/style.css src/renderer/control/playback.ts
git commit -m "feat: drive playback from the queue manager"
```

---

### Task 8: UI da fila e das filas salvas

**Files:**
- Create: `src/renderer/control/queue.ts`
- Modify: `src/renderer/control/index.html`, `src/renderer/control/style.css`, `src/renderer/control/main.ts`, `src/renderer/control/playback.ts`

**Interfaces:**
- Consumes: `window.control` (`queueGet`, `queueRemove`, `queueMove`, `queueClear`, `queuePlayAt`, `queueSave`, `queueLoadSaved`, `queueDeleteSaved`, `onQueueState`), tipos `QueueItem`, `QueueState`.
- Produces: `initQueue(): Promise<void>`; `getCurrentUid(): string | null` (usado por `playback.ts`).

- [ ] **Step 1: HTML** — `src/renderer/control/index.html`: inserir, logo depois do fechamento da `<section class="now">...</section>` e antes de `<p id="notice" ...>`, o bloco:

```html

      <section class="queue">
        <div class="row space">
          <span class="label">Fila de reprodução</span>
          <button id="queue-clear" type="button">Limpar</button>
        </div>
        <p id="queue-status" class="muted" hidden>Carregando playlist…</p>
        <p id="queue-empty" class="muted">A fila está vazia. Adicione um link acima.</p>
        <ul id="queue" aria-label="Fila de reprodução"></ul>
      </section>

      <section>
        <label for="queue-name">Salvar fila</label>
        <div class="row">
          <input id="queue-name" type="text" maxlength="100" placeholder="Nome da fila" autocomplete="off" />
          <button id="queue-save" type="button">Salvar</button>
        </div>
        <label for="saved-queues">Filas salvas</label>
        <div class="row">
          <select id="saved-queues"></select>
          <button id="saved-load" type="button">Carregar</button>
          <button id="saved-delete" type="button">Excluir</button>
        </div>
      </section>
```

- [ ] **Step 2: CSS** — acrescentar ao final de `src/renderer/control/style.css`:

```css
.row.space { justify-content: space-between; }
.label { font-weight: 600; }
button:disabled { opacity: 0.5; cursor: default; }
#queue { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 260px; overflow-y: auto; }
#queue li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #1e1e1e; border: 1px solid #333; border-radius: 6px; cursor: grab; }
#queue li.current { border-color: #2d6cdf; background: #1a2740; }
#queue li.drop-target { border-color: #f0c040; }
.handle { color: #777; user-select: none; }
.queue-title { flex: 1; min-width: 0; text-align: left; background: transparent; padding: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-title:hover { background: #2a2a2a; }
.queue-remove { background: transparent; color: #aaa; padding: 4px 8px; }
.queue-remove:hover { background: #4a2020; color: #fff; }
```

- [ ] **Step 3: `src/renderer/control/queue.ts`**

```ts
import type { QueueItem, QueueState } from '../../shared/types'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let currentUid: string | null = null

export const getCurrentUid = (): string | null => currentUid

export async function initQueue(): Promise<void> {
  const list = byId<HTMLUListElement>('queue')
  const empty = byId<HTMLElement>('queue-empty')
  const status = byId<HTMLElement>('queue-status')
  const clear = byId<HTMLButtonElement>('queue-clear')
  const nameInput = byId<HTMLInputElement>('queue-name')
  const save = byId<HTMLButtonElement>('queue-save')
  const saved = byId<HTMLSelectElement>('saved-queues')
  const load = byId<HTMLButtonElement>('saved-load')
  const del = byId<HTMLButtonElement>('saved-delete')

  let dragUid: string | null = null
  let state: QueueState = { items: [], currentUid: null, expanding: false, saved: [] }

  const row = (item: QueueItem, index: number): HTMLLIElement => {
    const li = document.createElement('li')
    li.draggable = true
    li.classList.toggle('current', item.uid === state.currentUid)

    const handle = document.createElement('span')
    handle.className = 'handle'
    handle.textContent = '⠿'

    const title = document.createElement('button')
    title.type = 'button'
    title.className = 'queue-title'
    title.textContent = item.title
    title.title = item.title
    title.addEventListener('click', () => window.control.queuePlayAt(item.uid))

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'queue-remove'
    remove.textContent = '✕'
    remove.setAttribute('aria-label', `Remover ${item.title}`)
    remove.addEventListener('click', () => window.control.queueRemove(item.uid))

    li.append(handle, title, remove)

    li.addEventListener('dragstart', (e) => {
      dragUid = item.uid
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', item.uid)
        e.dataTransfer.effectAllowed = 'move'
      }
    })
    li.addEventListener('dragover', (e) => {
      if (dragUid && dragUid !== item.uid) {
        e.preventDefault()
        li.classList.add('drop-target')
      }
    })
    li.addEventListener('dragleave', () => li.classList.remove('drop-target'))
    li.addEventListener('drop', (e) => {
      e.preventDefault()
      li.classList.remove('drop-target')
      if (dragUid && dragUid !== item.uid) window.control.queueMove(dragUid, index)
      dragUid = null
    })
    li.addEventListener('dragend', () => {
      dragUid = null
      list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'))
    })
    return li
  }

  const render = (next: QueueState) => {
    state = next
    currentUid = next.currentUid
    empty.hidden = next.items.length > 0
    status.hidden = !next.expanding
    clear.disabled = next.items.length === 0
    save.disabled = next.items.length === 0
    list.replaceChildren(...next.items.map(row))

    const previous = saved.value
    saved.replaceChildren(
      ...next.saved.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })),
    )
    if (next.saved.includes(previous)) saved.value = previous
    load.disabled = next.saved.length === 0
    del.disabled = next.saved.length === 0
  }

  const saveCurrent = () => {
    const name = nameInput.value.trim()
    if (!name) {
      nameInput.focus()
      return
    }
    window.control.queueSave(name)
  }

  clear.addEventListener('click', () => window.control.queueClear())
  save.addEventListener('click', saveCurrent)
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrent()
  })
  load.addEventListener('click', () => {
    if (saved.value) window.control.queueLoadSaved(saved.value)
  })
  del.addEventListener('click', () => {
    if (saved.value && confirm(`Excluir a fila "${saved.value}"?`)) window.control.queueDeleteSaved(saved.value)
  })

  window.control.onQueueState(render)
  const initial = await window.control.queueGet()
  if (initial) render(initial)
  else render(state)
}
```

- [ ] **Step 4: Ligar na janela de controle**

`src/renderer/control/main.ts` (arquivo inteiro):

```ts
import { initDisplays } from './displays'
import { initPlayback } from './playback'
import { initQueue } from './queue'

void initDisplays()
void initPlayback()
void initQueue()
```

`src/renderer/control/playback.ts` — acrescentar o import (logo depois dos imports existentes):

```ts
import { getCurrentUid } from './queue'
```

e trocar

```ts
  toggle.addEventListener('click', () =>
    window.control.sendCommand({ type: status === 'playing' ? 'pause' : 'play' }),
  )
```

por

```ts
  toggle.addEventListener('click', () => {
    const uid = getCurrentUid()
    if (uid && (status === 'idle' || status === 'ended')) window.control.queuePlayAt(uid)
    else window.control.sendCommand({ type: status === 'playing' ? 'pause' : 'play' })
  })
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck limpo, build ok com `out/renderer/control/index.html`, suíte verde.

Run: `grep -n "innerHTML" src/renderer/control/queue.ts || echo "sem innerHTML"`
Expected: `sem innerHTML`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/control
git commit -m "feat: queue list, drag reorder and saved queues UI"
```

---

### Task 9: README e checklist de QA manual

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Atualizar o README** — substituir a seção `## Uso` (até o título `## Limitações`) por:

```markdown
## Uso

1. Cole o link de um vídeo ou playlist e clique em **Adicionar à fila** (ou Enter). Se a fila estava vazia, começa a tocar. **Tocar agora** substitui a fila inteira pelo link.
2. Playlists entram com todos os vídeos (até 200); os títulos aparecem aos poucos.
3. Na fila: arraste para reordenar, ✕ remove, clique no título para tocar aquele item, **Limpar** esvazia.
4. Escolha o monitor em "Monitor de reprodução" (**Identificar** mostra o número em cada tela).
5. Use play/pause, anterior/próximo, seek e volume. **Parar** fecha o player e mantém a fila.
6. **Salvar fila** guarda a fila atual com um nome; em "Filas salvas", **Carregar** substitui a fila atual e **Excluir** apaga a salva. A fila ativa não é restaurada ao abrir o app.
```

- [ ] **Step 2: Checklist manual (usuário, com `npm run dev`)**

- [ ] Colar um vídeo e **Adicionar à fila**: aparece na fila e começa a tocar no monitor escolhido.
- [ ] Adicionar um segundo vídeo: entra no fim sem interromper o primeiro; ao terminar o primeiro, o segundo toca sozinho.
- [ ] Colar uma playlist pública: aparece "Carregando playlist…" e depois todos os vídeos, com títulos preenchidos aos poucos.
- [ ] Colar `watch?v=X&list=Y` com **Tocar agora**: a fila vira a playlist inteira e toca a partir do vídeo X.
- [ ] Playlist privada ou id inexistente: aviso amarelo em até ~15 s, fila inalterada.
- [ ] Arrastar um item para outra posição: a ordem muda e o item atual continua marcado.
- [ ] Remover o item que está tocando: toca o seguinte; remover o último item tocando: o player fecha.
- [ ] **Limpar**: fila vazia e player fechado.
- [ ] **Parar** e depois ▶: toca o item atual de novo.
- [ ] Vídeo bloqueado para embed no meio da fila: aviso "Pulando vídeo…" e o próximo toca.
- [ ] Último vídeo termina: o player não fecha; adicionar um novo vídeo depois começa a tocá-lo.
- [ ] **Salvar fila** com nome, fechar e reabrir o app: a fila começa vazia e a salva aparece em "Filas salvas"; **Carregar** restaura e toca; salvar com o mesmo nome sobrescreve; **Excluir** pede confirmação.
- [ ] Playlist grande (mais de 200): aviso de corte nos primeiros 200.

Se o `probe` não devolver IDs com o player oculto (timeout em playlist pública), testar `show: true` temporariamente em `createProbeWindow` para ver o que o YouTube retorna, e reportar o comportamento.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the playback queue"
```
