# App Player YouTube Multi-Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App desktop Electron que carrega vídeo/playlist do YouTube e toca no monitor secundário/terciário escolhido, controlado por uma janela de controle na tela principal.

**Architecture:** Main process (Electron) cria uma janela de controle e uma janela de player sem borda posicionada nos bounds do monitor escolhido. O player renderiza a YouTube IFrame API; comandos fluem controle → main → player e estado player → main → controle via IPC tipado (`contextBridge`). Lógica pura (parser de URL, escolha de display, store, fila de comandos, mapa de erros) vive em módulos testáveis sem Electron.

**Tech Stack:** Electron, electron-vite (Vite), TypeScript (strict), Vitest, YouTube IFrame API. Sem dependências de runtime além do Electron.

**Spec:** `docs/superpowers/specs/2026-10-05-app-player-youtube-design.md`

## Global Constraints

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` em toda `BrowserWindow`.
- Reprodução somente via YouTube IFrame API (sem yt-dlp, sem abrir youtube.com direto).
- Persistência: último monitor, volume e histórico recente de URLs (máx. 10), em JSON no `userData`.
- Monitor único: player abre em janela comum 960×540 com aviso no controle.
- Monitor removido com player aberto: player move para outro monitor e controle exibe aviso.
- Erros 100/101/150/5 do YouTube: aviso no controle e, em playlist, avança para o próximo item.
- Fora de escopo: busca no YouTube, login, download, bloqueio de anúncios, múltiplos players.
- Adição ao spec (necessária): comando `stop` + botão "Parar" no controle, pois a janela do player é sem borda e sempre no topo e não teria como ser fechada.
- Package manager: npm. Sem `"type": "module"` no `package.json` (preload e main precisam sair em CJS `.js`).

## File Structure

```
package.json
tsconfig.json
electron.vite.config.ts
vitest.config.ts
.gitignore
README.md
src/shared/types.ts            tipos de domínio + IDLE_STATE
src/shared/ipc.ts              nomes de canais IPC
src/shared/api.ts              interfaces ControlApi / PlayerApi (window.control / window.player)
src/shared/parseYoutubeUrl.ts  URL -> YoutubeTarget | null
src/shared/playerErrors.ts     código de erro YT -> mensagem + skippable
src/main/displays.ts           toDisplayInfos, pickDisplay, toSavedDisplay (puro)
src/main/settingsStore.ts      store JSON (monitor, volume, histórico)
src/main/commandQueue.ts       fila de comandos até o player ficar pronto
src/main/staticServer.ts       servidor HTTP local p/ renderers em produção
src/main/windows.ts            createControlWindow, createPlayerWindow, identifyDisplays
src/main/playerController.ts   ciclo de vida da janela player + fila + reposicionamento
src/main/index.ts              bootstrap, IPC, eventos de display
src/preload/control.ts         expõe window.control
src/preload/player.ts          expõe window.player
src/renderer/env.d.ts          tipos globais de window.control / window.player
src/renderer/control/{index.html,style.css,main.ts,displays.ts,playback.ts}
src/renderer/player/{index.html,main.ts}
src/renderer/identify/{index.html,main.ts}
```

Testes ao lado do código: `src/**/*.test.ts`.

---

### Task 1: Scaffold e contratos compartilhados

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/api.ts`

**Interfaces:**
- Produces: tipos `YoutubeTarget`, `PlayerCommand`, `PlayerStatus`, `PlayerState`, `DisplayInfo`, `SavedDisplay`, `DisplaysSnapshot`, `Settings`, const `IDLE_STATE`; constantes de canal em `ipc.ts`; interfaces `ControlApi`, `PlayerApi`, `Unsubscribe`.

- [ ] **Step 1: Inicializar git e package.json**

```bash
cd app-player-youtube
git init
```

Criar `package.json`:

```json
{
  "name": "app-player-youtube",
  "version": "0.1.0",
  "private": true,
  "description": "Player de YouTube que toca em monitor secundário",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
npm i -D electron electron-vite vite typescript vitest @types/node
```

Se o npm reclamar de peer dependency do `vite`, instale a versão de `vite` que o `electron-vite` pede.

- [ ] **Step 3: Criar configs**

`.gitignore`:

```
node_modules
out
dist
.DS_Store
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
```

`electron.vite.config.ts`:

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          control: resolve('src/preload/control.ts'),
          player: resolve('src/preload/player.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          control: resolve('src/renderer/control/index.html'),
          player: resolve('src/renderer/player/index.html'),
          identify: resolve('src/renderer/identify/index.html'),
        },
      },
    },
  },
})
```

- [ ] **Step 4: Criar contratos compartilhados**

`src/shared/types.ts`:

```ts
export type YoutubeTarget =
  | { type: 'video'; id: string; listId?: string }
  | { type: 'playlist'; listId: string }

export type PlayerCommand =
  | { type: 'load'; target: YoutubeTarget; url: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'volume'; value: number }
  | { type: 'seek'; seconds: number }
  | { type: 'stop' }

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

export interface PlayerState {
  status: PlayerStatus
  title: string
  currentTime: number
  duration: number
  error?: string
}

export const IDLE_STATE: PlayerState = { status: 'idle', title: '', currentTime: 0, duration: 0 }

export interface DisplayInfo {
  id: number
  label: string
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
}

export interface SavedDisplay {
  id: number
  x: number
  y: number
  width: number
  height: number
}

export interface DisplaysSnapshot {
  displays: DisplayInfo[]
  selectedId: number
}

export interface Settings {
  display?: SavedDisplay
  volume: number
  history: string[]
}
```

`src/shared/ipc.ts`:

```ts
export const CMD_FROM_CONTROL = 'control:command'
export const STATE_TO_CONTROL = 'control:state'
export const DISPLAYS_LIST = 'displays:list'
export const DISPLAYS_SELECT = 'displays:select'
export const DISPLAYS_IDENTIFY = 'displays:identify'
export const DISPLAYS_CHANGED = 'displays:changed'
export const SETTINGS_GET = 'settings:get'
export const NOTICE = 'app:notice'
export const CMD_TO_PLAYER = 'player:exec'
export const STATE_FROM_PLAYER = 'player:report'
export const PLAYER_READY = 'player:ready'
```

`src/shared/api.ts`:

```ts
import type { DisplaysSnapshot, PlayerCommand, PlayerState, Settings } from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  getDisplays(): Promise<DisplaysSnapshot>
  selectDisplay(id: number): Promise<DisplaysSnapshot>
  identifyDisplays(): Promise<void>
  getSettings(): Promise<Settings>
  sendCommand(cmd: PlayerCommand): void
  onState(cb: (state: PlayerState) => void): Unsubscribe
  onDisplaysChanged(cb: (snapshot: DisplaysSnapshot) => void): Unsubscribe
  onNotice(cb: (message: string) => void): Unsubscribe
}

export interface PlayerApi {
  ready(): void
  report(state: PlayerState): void
  onCommand(cb: (cmd: PlayerCommand) => void): Unsubscribe
}
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck`
Expected: sem erros.

Run: `npx vitest run --passWithNoTests`
Expected: sai com código 0 ("No test files found").

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite project and shared contracts"
```

---

### Task 2: Parser de URL do YouTube

**Files:**
- Create: `src/shared/parseYoutubeUrl.ts`
- Test: `src/shared/parseYoutubeUrl.test.ts`

**Interfaces:**
- Consumes: `YoutubeTarget` de `./types`
- Produces: `parseYoutubeUrl(input: string): YoutubeTarget | null`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { parseYoutubeUrl } from './parseYoutubeUrl'

const ID = 'dQw4w9WgXcQ'
const LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'

describe('parseYoutubeUrl', () => {
  it('parses a watch URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('parses youtu.be short links', () => {
    expect(parseYoutubeUrl(`https://youtu.be/${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('parses mobile and music hosts', () => {
    expect(parseYoutubeUrl(`https://m.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
    expect(parseYoutubeUrl(`https://music.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it.each(['shorts', 'embed', 'live'])('parses /%s/ URLs', (prefix) => {
    expect(parseYoutubeUrl(`https://www.youtube.com/${prefix}/${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('keeps the list on a video URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}&list=${LIST}`)).toEqual({
      type: 'video',
      id: ID,
      listId: LIST,
    })
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?list=${LIST}`)).toEqual({
      type: 'video',
      id: ID,
      listId: LIST,
    })
  })

  it('parses a playlist URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/playlist?list=${LIST}`)).toEqual({
      type: 'playlist',
      listId: LIST,
    })
  })

  it('falls back to playlist when watch has a list but no valid v', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=bad&list=${LIST}`)).toEqual({
      type: 'playlist',
      listId: LIST,
    })
  })

  it('accepts URLs without a scheme and with surrounding whitespace', () => {
    expect(parseYoutubeUrl(`  youtube.com/watch?v=${ID}  `)).toEqual({ type: 'video', id: ID })
  })

  it.each([
    '',
    'not a url',
    'javascript:alert(1)',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    `https://example.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
  ])('rejects %j', (input) => {
    expect(parseYoutubeUrl(input)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/shared/parseYoutubeUrl.test.ts`
Expected: FAIL (módulo `./parseYoutubeUrl` não existe).

- [ ] **Step 3: Implementar**

```ts
import type { YoutubeTarget } from './types'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{10,}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'music.youtube.com'])
const ID_PATH_PREFIXES = new Set(['shorts', 'embed', 'live'])

function video(id: string, list: string | null): YoutubeTarget {
  return list && LIST_ID.test(list) ? { type: 'video', id, listId: list } : { type: 'video', id }
}

export function parseYoutubeUrl(input: string): YoutubeTarget | null {
  const text = input.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const list = url.searchParams.get('list')

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? ''
    return VIDEO_ID.test(id) ? video(id, list) : null
  }
  if (!YOUTUBE_HOSTS.has(host)) return null

  const [first, second = ''] = url.pathname.split('/').filter(Boolean)
  if (first === 'watch') {
    const v = url.searchParams.get('v') ?? ''
    if (VIDEO_ID.test(v)) return video(v, list)
  }
  if (first === 'watch' || first === 'playlist') {
    return list && LIST_ID.test(list) ? { type: 'playlist', listId: list } : null
  }
  if (ID_PATH_PREFIXES.has(first) && VIDEO_ID.test(second)) return video(second, list)
  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/shared/parseYoutubeUrl.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/shared/parseYoutubeUrl.ts src/shared/parseYoutubeUrl.test.ts
git commit -m "feat: add YouTube URL parser"
```

---

### Task 3: Mapa de erros do player

**Files:**
- Create: `src/shared/playerErrors.ts`
- Test: `src/shared/playerErrors.test.ts`

**Interfaces:**
- Produces: `describeYtError(code: number): { message: string; skippable: boolean }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { describeYtError } from './playerErrors'

describe('describeYtError', () => {
  it.each([100, 101, 150, 5])('marks %i as skippable', (code) => {
    const info = describeYtError(code)
    expect(info.skippable).toBe(true)
    expect(info.message.length).toBeGreaterThan(0)
  })

  it('explains blocked embedding for 101 and 150', () => {
    expect(describeYtError(101).message).toBe('O dono do vídeo bloqueou a reprodução em players externos.')
    expect(describeYtError(150).message).toBe(describeYtError(101).message)
  })

  it.each([2, 153, 999])('does not skip on %i', (code) => {
    expect(describeYtError(code).skippable).toBe(false)
  })

  it('includes the code for unknown errors', () => {
    expect(describeYtError(999).message).toBe('Erro desconhecido do player (999).')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/shared/playerErrors.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export interface YtErrorInfo {
  message: string
  skippable: boolean
}

export function describeYtError(code: number): YtErrorInfo {
  switch (code) {
    case 2:
      return { message: 'Link inválido para o player.', skippable: false }
    case 5:
      return { message: 'Erro do player HTML5 neste vídeo.', skippable: true }
    case 100:
      return { message: 'Vídeo removido ou privado.', skippable: true }
    case 101:
    case 150:
      return { message: 'O dono do vídeo bloqueou a reprodução em players externos.', skippable: true }
    case 153:
      return { message: 'O YouTube recusou a origem do player (referrer ausente).', skippable: false }
    default:
      return { message: `Erro desconhecido do player (${code}).`, skippable: false }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/shared/playerErrors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/playerErrors.ts src/shared/playerErrors.test.ts
git commit -m "feat: add YouTube player error mapping"
```

---

### Task 4: Lógica de displays

**Files:**
- Create: `src/main/displays.ts`
- Test: `src/main/displays.test.ts`

**Interfaces:**
- Consumes: `DisplayInfo`, `SavedDisplay` de `../shared/types`
- Produces:
  - `interface RawDisplay { id: number; label: string; bounds: { x: number; y: number; width: number; height: number } }`
  - `toDisplayInfos(displays: RawDisplay[], primaryId: number): DisplayInfo[]`
  - `findSaved(saved: SavedDisplay | undefined, displays: DisplayInfo[]): DisplayInfo | undefined` (casa por id, depois por bounds)
  - `pickDisplay(saved: SavedDisplay | undefined, displays: DisplayInfo[]): DisplayInfo` (displays não vazio)
  - `toSavedDisplay(d: DisplayInfo): SavedDisplay`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import type { DisplayInfo } from '../shared/types'
import { findSaved, pickDisplay, toDisplayInfos, toSavedDisplay } from './displays'

const d = (id: number, x: number, isPrimary = false): DisplayInfo => ({
  id,
  label: `Monitor ${id}`,
  x,
  y: 0,
  width: 1920,
  height: 1080,
  isPrimary,
})

describe('toDisplayInfos', () => {
  it('numbers monitors and appends the system label when present', () => {
    const result = toDisplayInfos(
      [
        { id: 10, label: '', bounds: { x: 0, y: 0, width: 1440, height: 900 } },
        { id: 20, label: 'DELL U2720Q', bounds: { x: 1440, y: 0, width: 2560, height: 1440 } },
      ],
      10,
    )
    expect(result).toEqual([
      { id: 10, label: 'Monitor 1', x: 0, y: 0, width: 1440, height: 900, isPrimary: true },
      { id: 20, label: 'Monitor 2 — DELL U2720Q', x: 1440, y: 0, width: 2560, height: 1440, isPrimary: false },
    ])
  })
})

describe('pickDisplay', () => {
  const displays = [d(1, 0, true), d(2, 1920), d(3, 3840)]

  it('uses the saved display when its id still exists', () => {
    expect(pickDisplay(toSavedDisplay(displays[2]), displays).id).toBe(3)
  })

  it('matches by bounds when the id changed', () => {
    const saved = { id: 99, x: 1920, y: 0, width: 1920, height: 1080 }
    expect(pickDisplay(saved, displays).id).toBe(2)
  })

  it('defaults to the first non-primary display with nothing saved', () => {
    expect(pickDisplay(undefined, displays).id).toBe(2)
  })

  it('falls back to the first non-primary display when the saved one is gone', () => {
    const saved = { id: 99, x: 9999, y: 0, width: 800, height: 600 }
    expect(pickDisplay(saved, displays).id).toBe(2)
  })

  it('falls back to the primary display when it is the only one', () => {
    expect(pickDisplay(undefined, [d(1, 0, true)]).id).toBe(1)
  })
})

describe('findSaved', () => {
  it('returns undefined when nothing matches', () => {
    expect(findSaved({ id: 99, x: 5, y: 5, width: 1, height: 1 }, [d(1, 0, true)])).toBeUndefined()
  })

  it('returns undefined when nothing is saved', () => {
    expect(findSaved(undefined, [d(1, 0, true)])).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/displays.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/displays.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/displays.ts src/main/displays.test.ts
git commit -m "feat: add display selection logic"
```

---

### Task 5: Store de configurações

**Files:**
- Create: `src/main/settingsStore.ts`
- Test: `src/main/settingsStore.test.ts`

**Interfaces:**
- Consumes: `Settings`, `SavedDisplay` de `../shared/types`
- Produces: `class SettingsStore { constructor(file: string); get(): Settings; setDisplay(d: SavedDisplay): void; setVolume(v: number): void; addHistory(url: string): void }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from './settingsStore'

let file: string

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'settings-')), 'nested', 'settings.json')
})

describe('SettingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [] })
  })

  it('persists display, volume and history across instances', () => {
    const store = new SettingsStore(file)
    store.setDisplay({ id: 2, x: 1920, y: 0, width: 1920, height: 1080 })
    store.setVolume(40)
    store.addHistory('https://youtu.be/dQw4w9WgXcQ')

    expect(new SettingsStore(file).get()).toEqual({
      display: { id: 2, x: 1920, y: 0, width: 1920, height: 1080 },
      volume: 40,
      history: ['https://youtu.be/dQw4w9WgXcQ'],
    })
  })

  it('clamps and rounds volume, ignoring non-finite values', () => {
    const store = new SettingsStore(file)
    store.setVolume(150)
    expect(store.get().volume).toBe(100)
    store.setVolume(-5)
    expect(store.get().volume).toBe(0)
    store.setVolume(33.6)
    expect(store.get().volume).toBe(34)
    store.setVolume(Number.NaN)
    expect(store.get().volume).toBe(34)
  })

  it('keeps history deduplicated, most recent first, max 10', () => {
    const store = new SettingsStore(file)
    for (let i = 0; i < 12; i++) store.addHistory(`url-${i}`)
    store.addHistory('url-5')
    const { history } = store.get()
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('url-5')
    expect(history.filter((h) => h === 'url-5')).toHaveLength(1)
  })

  it('falls back to defaults on corrupt JSON', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, '{not json')
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [] })
  })

  it('drops invalid field types', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, JSON.stringify({ volume: 'loud', history: [1, 'ok'], display: { id: 'x' } }))
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: ['ok'] })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/settingsStore.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/settingsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/settingsStore.ts src/main/settingsStore.test.ts
git commit -m "feat: add JSON settings store"
```

---

### Task 6: Fila de comandos

**Files:**
- Create: `src/main/commandQueue.ts`
- Test: `src/main/commandQueue.test.ts`

**Interfaces:**
- Produces: `class CommandQueue<T> { constructor(send: (c: T) => void); push(c: T): void; markReady(): void; reset(): void }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { CommandQueue } from './commandQueue'

describe('CommandQueue', () => {
  it('buffers commands until ready, then flushes in order', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.push(2)
    expect(sent).toEqual([])
    queue.markReady()
    expect(sent).toEqual([1, 2])
  })

  it('sends immediately once ready', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.markReady()
    queue.push(3)
    expect(sent).toEqual([3])
  })

  it('does not flush twice on repeated markReady', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.markReady()
    queue.markReady()
    expect(sent).toEqual([1])
  })

  it('reset drops pending commands and requires ready again', () => {
    const sent: number[] = []
    const queue = new CommandQueue<number>((c) => sent.push(c))
    queue.push(1)
    queue.reset()
    queue.markReady()
    expect(sent).toEqual([])
    queue.reset()
    queue.push(2)
    expect(sent).toEqual([])
    queue.markReady()
    expect(sent).toEqual([2])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/commandQueue.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export class CommandQueue<T> {
  private ready = false
  private pending: T[] = []

  constructor(private readonly send: (command: T) => void) {}

  push(command: T): void {
    if (this.ready) this.send(command)
    else this.pending.push(command)
  }

  markReady(): void {
    this.ready = true
    const flush = this.pending
    this.pending = []
    for (const command of flush) this.send(command)
  }

  reset(): void {
    this.ready = false
    this.pending = []
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/commandQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/commandQueue.ts src/main/commandQueue.test.ts
git commit -m "feat: add command queue"
```

---

### Task 7: Servidor estático local

O player precisa de uma origem `http://` (não `file://`) para o YouTube aceitar o embed (evita erro 153). Em dev o electron-vite já serve via HTTP; em produção usamos este servidor.

**Files:**
- Create: `src/main/staticServer.ts`
- Test: `src/main/staticServer.test.ts`

**Interfaces:**
- Produces: `startStaticServer(root: string): Promise<{ url: string; close: () => Promise<void> }>` — serve arquivos sob `root` em `http://127.0.0.1:<porta>`; 404 se não existe; 403 se o caminho escapa de `root`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startStaticServer } from './staticServer'

let base: string
let root: string
let server: Awaited<ReturnType<typeof startStaticServer>>

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'static-'))
  root = join(base, 'public')
  mkdirSync(join(root, 'player'), { recursive: true })
  writeFileSync(join(root, 'player', 'index.html'), '<h1>oi</h1>')
  writeFileSync(join(base, 'secret.txt'), 'secret')
  server = await startStaticServer(root)
})

afterEach(async () => {
  await server.close()
})

function get(path: string): Promise<{ status: number; type: string | undefined; body: string }> {
  const { hostname, port } = new URL(server.url)
  return new Promise((resolve, reject) => {
    request({ hostname, port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], body }))
    })
      .on('error', reject)
      .end()
  })
}

describe('startStaticServer', () => {
  it('serves files with the right content type', async () => {
    const res = await get('/player/index.html')
    expect(res.status).toBe(200)
    expect(res.type).toBe('text/html; charset=utf-8')
    expect(res.body).toBe('<h1>oi</h1>')
  })

  it('returns 404 for missing files', async () => {
    expect((await get('/player/nope.html')).status).toBe(404)
  })

  it('refuses paths that escape the root', async () => {
    const res = await get('/%2e%2e/secret.txt')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('secret')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/main/staticServer.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

export function startStaticServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const base = resolve(root)
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      const file = normalize(join(base, path))
      if (!file.startsWith(base + sep)) {
        res.writeHead(403).end()
        return
      }
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/main/staticServer.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/main/staticServer.ts src/main/staticServer.test.ts
git commit -m "feat: add local static server for renderers"
```

---

### Task 8: Processo main, preloads e seção de monitores do controle

Entrega verificável manualmente: abrir o app, ver a lista de monitores, identificar e escolher monitor (persistido). Reprodução vem nas Tasks 9–10.

**Files:**
- Create: `src/main/windows.ts`, `src/main/playerController.ts`, `src/main/index.ts`
- Create: `src/preload/control.ts`, `src/preload/player.ts`
- Create: `src/renderer/env.d.ts`
- Create: `src/renderer/control/index.html`, `src/renderer/control/style.css`, `src/renderer/control/main.ts`, `src/renderer/control/displays.ts`
- Create: `src/renderer/identify/index.html`, `src/renderer/identify/main.ts`
- Create: `src/renderer/player/index.html`, `src/renderer/player/main.ts` (stub; implementado na Task 9)

**Interfaces:**
- Consumes: tudo de `src/shared/*`, `displays.ts`, `SettingsStore`, `CommandQueue`, `startStaticServer`.
- Produces:
  - `createControlWindow(baseUrl: string): BrowserWindow`
  - `createPlayerWindow(baseUrl: string, display: DisplayInfo, single: boolean): BrowserWindow`
  - `identifyDisplays(baseUrl: string, displays: DisplayInfo[]): void`
  - `interface PlayerTarget { display: DisplayInfo; single: boolean }`
  - `class PlayerController { constructor(baseUrl: string, onClosed: () => void); isOpen(): boolean; owns(sender: WebContents): boolean; markReady(): void; send(cmd: PlayerCommand, target: PlayerTarget): void; reposition(target: PlayerTarget): void; close(): void }`
  - `window.control: ControlApi`, `window.player: PlayerApi`
  - `initDisplays(): Promise<void>` (renderer controle)

- [ ] **Step 1: `src/main/windows.ts`**

```ts
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { DisplayInfo } from '../shared/types'

function webPreferences(preload?: string) {
  return {
    ...(preload ? { preload: join(__dirname, `../preload/${preload}.js`) } : {}),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

export function createControlWindow(baseUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 460,
    title: 'Player YouTube',
    backgroundColor: '#111111',
    webPreferences: webPreferences('control'),
  })
  void win.loadURL(`${baseUrl}/control/index.html`)
  return win
}

export function createPlayerWindow(baseUrl: string, display: DisplayInfo, single: boolean): BrowserWindow {
  const win = new BrowserWindow(
    single
      ? {
          width: 960,
          height: 540,
          title: 'Player',
          backgroundColor: '#000000',
          show: false,
          webPreferences: webPreferences('player'),
        }
      : {
          x: display.x,
          y: display.y,
          width: display.width,
          height: display.height,
          frame: false,
          resizable: false,
          fullscreenable: false,
          backgroundColor: '#000000',
          show: false,
          webPreferences: webPreferences('player'),
        },
  )
  win.setMenuBarVisibility(false)
  if (!single) win.setAlwaysOnTop(true, 'screen-saver')
  win.once('ready-to-show', () => win.show())
  void win.loadURL(`${baseUrl}/player/index.html`)
  return win
}

export function identifyDisplays(baseUrl: string, displays: DisplayInfo[]): void {
  displays.forEach((display, index) => {
    const win = new BrowserWindow({
      x: display.x + Math.round(display.width / 2) - 150,
      y: display.y + Math.round(display.height / 2) - 150,
      width: 300,
      height: 300,
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      webPreferences: webPreferences(),
    })
    win.setIgnoreMouseEvents(true)
    void win.loadURL(`${baseUrl}/identify/index.html#${index + 1}`)
    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
    }, 2500)
  })
}
```

- [ ] **Step 2: `src/main/playerController.ts`**

```ts
import type { BrowserWindow, WebContents } from 'electron'
import { CMD_TO_PLAYER } from '../shared/ipc'
import type { DisplayInfo, PlayerCommand } from '../shared/types'
import { CommandQueue } from './commandQueue'
import { createPlayerWindow } from './windows'

export interface PlayerTarget {
  display: DisplayInfo
  single: boolean
}

type Mode = 'screen' | 'window'

export class PlayerController {
  private win: BrowserWindow | null = null
  private mode: Mode = 'screen'
  private lastLoad: PlayerCommand | null = null
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
    if (!this.win && cmd.type !== 'load') return
    const replay = this.lastLoad
    if (cmd.type === 'load') this.lastLoad = cmd
    this.place(target, replay)
    this.queue.push(cmd)
  }

  reposition(target: PlayerTarget): void {
    if (this.win) this.place(target, this.lastLoad)
  }

  close(): void {
    if (!this.win) return
    this.destroy()
    this.lastLoad = null
    this.onClosed()
  }

  private place(target: PlayerTarget, replay: PlayerCommand | null): void {
    const mode: Mode = target.single ? 'window' : 'screen'
    if (this.win && this.mode !== mode) this.destroy()
    if (!this.win) {
      this.open(target, mode)
      if (replay) this.queue.push(replay)
    } else if (mode === 'screen') {
      const { x, y, width, height } = target.display
      this.win.setBounds({ x, y, width, height })
    }
  }

  private open(target: PlayerTarget, mode: Mode): void {
    const win = createPlayerWindow(this.baseUrl, target.display, target.single)
    this.win = win
    this.mode = mode
    this.queue.reset()
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.lastLoad = null
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

- [ ] **Step 3: `src/main/index.ts`**

```ts
import { join } from 'node:path'
import { app, ipcMain, screen, type BrowserWindow } from 'electron'
import {
  CMD_FROM_CONTROL,
  DISPLAYS_CHANGED,
  DISPLAYS_IDENTIFY,
  DISPLAYS_LIST,
  DISPLAYS_SELECT,
  NOTICE,
  PLAYER_READY,
  SETTINGS_GET,
  STATE_FROM_PLAYER,
  STATE_TO_CONTROL,
} from '../shared/ipc'
import { IDLE_STATE, type DisplaysSnapshot, type PlayerCommand, type PlayerState } from '../shared/types'
import { findSaved, pickDisplay, toDisplayInfos, toSavedDisplay } from './displays'
import { PlayerController, type PlayerTarget } from './playerController'
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
    return { display: selected, single: displays.length === 1 }
  }
  const toControl = (channel: string, payload: unknown) => controlWin?.webContents.send(channel, payload)

  const controller = new PlayerController(baseUrl, () => toControl(STATE_TO_CONTROL, IDLE_STATE))

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

  ipcMain.on(CMD_FROM_CONTROL, (event, cmd: PlayerCommand) => {
    if (event.sender !== controlWin?.webContents) return
    if (cmd.type === 'volume') store.setVolume(cmd.value)
    if (cmd.type === 'load') store.addHistory(cmd.url)
    controller.send(cmd, target())
    if (cmd.type === 'load') controller.send({ type: 'volume', value: store.get().volume }, target())
  })
  ipcMain.on(PLAYER_READY, (event) => {
    if (controller.owns(event.sender)) controller.markReady()
  })
  ipcMain.on(STATE_FROM_PLAYER, (event, state: PlayerState) => {
    if (controller.owns(event.sender)) toControl(STATE_TO_CONTROL, state)
  })

  const onDisplaysChanged = () => {
    const { displays } = resolveDisplays()
    if (controller.isOpen() && store.get().display && !findSaved(store.get().display, displays)) {
      toControl(NOTICE, 'Monitor desconectado — o player foi movido para outro monitor.')
    }
    controller.reposition(target())
    toControl(DISPLAYS_CHANGED, snapshot())
  }
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
    screen.on(event, onDisplaysChanged)
  }

  controlWin = createControlWindow(baseUrl)
  controlWin.on('closed', () => app.quit())
}

void main()
```

- [ ] **Step 4: Preloads**

`src/preload/control.ts`:

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
  onState: (cb) => subscribe(STATE_TO_CONTROL, cb),
  onDisplaysChanged: (cb) => subscribe(DISPLAYS_CHANGED, cb),
  onNotice: (cb) => subscribe(NOTICE, cb),
}

contextBridge.exposeInMainWorld('control', api)
```

`src/preload/player.ts`:

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { PlayerApi } from '../shared/api'
import { CMD_TO_PLAYER, PLAYER_READY, STATE_FROM_PLAYER } from '../shared/ipc'
import type { PlayerCommand } from '../shared/types'

const api: PlayerApi = {
  ready: () => ipcRenderer.send(PLAYER_READY),
  report: (state) => ipcRenderer.send(STATE_FROM_PLAYER, state),
  onCommand: (cb) => {
    const listener = (_event: IpcRendererEvent, cmd: PlayerCommand) => cb(cmd)
    ipcRenderer.on(CMD_TO_PLAYER, listener)
    return () => ipcRenderer.removeListener(CMD_TO_PLAYER, listener)
  },
}

contextBridge.exposeInMainWorld('player', api)
```

- [ ] **Step 5: Tipos globais e página de identify**

`src/renderer/env.d.ts`:

```ts
import type { ControlApi, PlayerApi } from '../shared/api'

declare global {
  interface Window {
    control: ControlApi
    player: PlayerApi
  }
}

export {}
```

`src/renderer/identify/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Identificar</title>
    <style>
      html, body { margin: 0; height: 100%; background: transparent; }
      body { display: grid; place-items: center; }
      #n {
        width: 240px; height: 240px; border-radius: 50%;
        display: grid; place-items: center;
        background: rgba(0, 0, 0, 0.8); color: #fff;
        font: 700 160px/1 system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="n"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/identify/main.ts`:

```ts
const el = document.getElementById('n')
if (el) el.textContent = location.hash.slice(1)
```

- [ ] **Step 6: Página do controle (HTML completo, CSS e seção de monitores)**

`src/renderer/control/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Player YouTube</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main>
      <section>
        <label for="url">Link do YouTube (vídeo ou playlist)</label>
        <div class="row">
          <input id="url" type="text" list="history" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" />
          <datalist id="history"></datalist>
          <button id="play-url" type="button">Tocar</button>
        </div>
        <p id="url-error" class="error" hidden></p>
      </section>

      <section>
        <label for="display">Monitor de reprodução</label>
        <div class="row">
          <select id="display"></select>
          <button id="identify" type="button">Identificar</button>
        </div>
        <p id="single-warning" class="warn" hidden>Só um monitor detectado — o player abrirá em janela comum.</p>
      </section>

      <section class="now">
        <h1 id="title">Nada tocando</h1>
        <p id="status" class="muted">Parado</p>
        <p id="player-error" class="error" hidden></p>
        <input id="seek" type="range" min="0" max="0" step="1" value="0" aria-label="Posição" />
        <div class="times"><span id="time">0:00</span><span id="duration">0:00</span></div>
        <div class="row center">
          <button id="prev" type="button" aria-label="Anterior">⏮</button>
          <button id="toggle" type="button" aria-label="Tocar ou pausar">▶</button>
          <button id="next" type="button" aria-label="Próximo">⏭</button>
          <button id="stop" type="button" aria-label="Parar e fechar o player">Parar</button>
        </div>
        <label for="volume">Volume</label>
        <input id="volume" type="range" min="0" max="100" step="1" value="100" />
      </section>

      <p id="notice" class="warn" hidden></p>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/control/style.css`:

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #111; color: #eee; font: 14px/1.4 system-ui, sans-serif; }
main { padding: 16px; display: grid; gap: 20px; }
section { display: grid; gap: 8px; }
label { font-weight: 600; }
.row { display: flex; gap: 8px; align-items: center; }
.row.center { justify-content: center; }
input[type='text'], select { flex: 1; min-width: 0; padding: 8px; background: #1e1e1e; color: inherit; border: 1px solid #444; border-radius: 6px; }
input[type='range'] { width: 100%; }
button { padding: 8px 14px; background: #2d6cdf; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font: inherit; }
button:hover { background: #3b7af0; }
#prev, #toggle, #next { font-size: 18px; min-width: 48px; }
#stop, #identify { background: #3a3a3a; }
.now h1 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.times { display: flex; justify-content: space-between; color: #aaa; font-variant-numeric: tabular-nums; }
.muted { margin: 0; color: #aaa; }
.error { margin: 0; color: #ff6b6b; }
.warn { margin: 0; color: #f0c040; }
[hidden] { display: none !important; }
```

`src/renderer/control/displays.ts`:

```ts
import type { DisplaysSnapshot } from '../../shared/types'

export async function initDisplays(): Promise<void> {
  const select = document.getElementById('display') as HTMLSelectElement
  const warning = document.getElementById('single-warning') as HTMLElement
  const identify = document.getElementById('identify') as HTMLButtonElement

  const render = (snapshot: DisplaysSnapshot) => {
    select.replaceChildren(
      ...snapshot.displays.map((d) => {
        const option = document.createElement('option')
        option.value = String(d.id)
        option.textContent = `${d.label} (${d.width}×${d.height})${d.isPrimary ? ' — principal' : ''}`
        option.selected = d.id === snapshot.selectedId
        return option
      }),
    )
    warning.hidden = snapshot.displays.length !== 1
  }

  render(await window.control.getDisplays())
  select.addEventListener('change', async () => render(await window.control.selectDisplay(Number(select.value))))
  identify.addEventListener('click', () => void window.control.identifyDisplays())
  window.control.onDisplaysChanged(render)
}
```

`src/renderer/control/main.ts`:

```ts
import { initDisplays } from './displays'

void initDisplays()
```

- [ ] **Step 7: Stub do player**

`src/renderer/player/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Player</title>
    <style>
      html, body, #stage { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
      #yt { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="stage"><div id="yt"></div></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/player/main.ts`:

```ts
export {}
```

- [ ] **Step 8: Verificar tipos e build**

Run: `npm run typecheck`
Expected: sem erros.

Run: `npm run build`
Expected: gera `out/main/index.js`, `out/preload/control.js`, `out/preload/player.js`, `out/renderer/control/index.html`, `out/renderer/player/index.html`, `out/renderer/identify/index.html`.

- [ ] **Step 9: Verificação manual**

Run: `npm run dev`
Expected:
- Abre a janela de controle; a seção "Monitor de reprodução" lista os monitores conectados (ex.: `Monitor 2 — DELL ... (2560×1440)`), com o selecionado = primeiro não-principal.
- "Identificar" mostra um círculo com o número em cada monitor por ~2,5 s.
- Trocar o monitor e fechar/reabrir o app mantém a escolha (arquivo `~/Library/Application Support/app-player-youtube/settings.json` contém `display`).
- Com um único monitor: aviso amarelo visível.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: main process, preloads and display selection UI"
```

---

### Task 9: Renderer do player (YouTube IFrame API)

**Files:**
- Modify (substituir conteúdo): `src/renderer/player/main.ts`

**Interfaces:**
- Consumes: `window.player: PlayerApi`, `describeYtError`, `PlayerCommand`, `PlayerState`, `YoutubeTarget`
- Produces: player que executa `load/play/pause/next/prev/volume/seek`, envia `ready()` quando o YT player está pronto e `report(state)` em mudanças de estado + a cada 500 ms enquanto toca.

- [ ] **Step 1: Substituir `src/renderer/player/main.ts`**

```ts
import { describeYtError } from '../../shared/playerErrors'
import { IDLE_STATE, type PlayerCommand, type PlayerState, type YoutubeTarget } from '../../shared/types'

interface YTPlayer {
  loadVideoById(id: string): void
  loadPlaylist(options: { list: string; listType: 'playlist'; index: number }): void
  playVideo(): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title: string }
  getPlaylist(): string[] | null
  destroy(): void
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
let backlog: PlayerCommand[] = []
let state: PlayerState = { ...IDLE_STATE }

function report(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch }
  api.report(state)
}

function build(initial?: { videoId: string; listId: string }): void {
  playerReady = false
  const stage = document.getElementById('stage')
  if (stage) stage.innerHTML = '<div id="yt"></div>'
  yt = new window.YT.Player('yt', {
    width: '100%',
    height: '100%',
    ...(initial ? { videoId: initial.videoId } : {}),
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
      ...(initial ? { list: initial.listId, listType: 'playlist' } : {}),
    },
    events: {
      onReady: () => {
        playerReady = true
        const pending = backlog
        backlog = []
        pending.forEach(exec)
        api.ready()
      },
      onStateChange: (event: { data: number }) => {
        const status = STATUS_BY_YT_STATE[event.data]
        if (!status || !yt) return
        report({
          status,
          title: yt.getVideoData().title || state.title,
          duration: yt.getDuration(),
          error: undefined,
        })
      },
      onError: (event: { data: number }) => {
        const info = describeYtError(event.data)
        report({ status: 'error', error: info.message })
        const list = yt?.getPlaylist()
        if (info.skippable && list && list.length > 1) yt?.nextVideo()
      },
    },
  })
}

function load(target: YoutubeTarget): void {
  report({ title: '', currentTime: 0, duration: 0, error: undefined })
  if (!yt) return
  if (target.type === 'playlist') {
    yt.loadPlaylist({ list: target.listId, listType: 'playlist', index: 0 })
  } else if (target.listId) {
    yt.destroy()
    build({ videoId: target.id, listId: target.listId })
  } else {
    yt.loadVideoById(target.id)
  }
}

function exec(cmd: PlayerCommand): void {
  if (!yt) return
  switch (cmd.type) {
    case 'load':
      load(cmd.target)
      break
    case 'play':
      yt.playVideo()
      break
    case 'pause':
      yt.pauseVideo()
      break
    case 'next':
      yt.nextVideo()
      break
    case 'prev':
      yt.previousVideo()
      break
    case 'volume':
      yt.setVolume(cmd.value)
      break
    case 'seek':
      yt.seekTo(cmd.seconds, true)
      break
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

window.onYouTubeIframeAPIReady = () => build()
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
document.head.append(script)
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/player/main.ts
git commit -m "feat: YouTube IFrame API player renderer"
```

---

### Task 10: Controles de reprodução na janela de controle

**Files:**
- Create: `src/renderer/control/playback.ts`
- Modify: `src/renderer/control/main.ts`

**Interfaces:**
- Consumes: `window.control`, `parseYoutubeUrl`, `PlayerState`
- Produces: `initPlayback(): Promise<void>`

- [ ] **Step 1: Criar `src/renderer/control/playback.ts`**

```ts
import { parseYoutubeUrl } from '../../shared/parseYoutubeUrl'
import type { PlayerState } from '../../shared/types'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const STATUS_TEXT: Record<PlayerState['status'], string> = {
  idle: 'Parado',
  playing: 'Tocando',
  paused: 'Pausado',
  buffering: 'Carregando…',
  ended: 'Terminou',
  error: 'Erro',
}

function format(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export async function initPlayback(): Promise<void> {
  const url = byId<HTMLInputElement>('url')
  const urlError = byId<HTMLElement>('url-error')
  const history = byId<HTMLDataListElement>('history')
  const title = byId<HTMLElement>('title')
  const statusEl = byId<HTMLElement>('status')
  const playerError = byId<HTMLElement>('player-error')
  const seek = byId<HTMLInputElement>('seek')
  const time = byId<HTMLElement>('time')
  const duration = byId<HTMLElement>('duration')
  const toggle = byId<HTMLButtonElement>('toggle')
  const volume = byId<HTMLInputElement>('volume')
  const notice = byId<HTMLElement>('notice')

  const addHistoryOption = (value: string) => {
    if ([...history.options].some((o) => o.value === value)) return
    const option = document.createElement('option')
    option.value = value
    history.prepend(option)
  }

  const settings = await window.control.getSettings()
  volume.value = String(settings.volume)
  settings.history.forEach((h) => history.append(Object.assign(document.createElement('option'), { value: h })))

  let seeking = false
  let status: PlayerState['status'] = 'idle'

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
  toggle.addEventListener('click', () =>
    window.control.sendCommand({ type: status === 'playing' ? 'pause' : 'play' }),
  )
  byId('prev').addEventListener('click', () => window.control.sendCommand({ type: 'prev' }))
  byId('next').addEventListener('click', () => window.control.sendCommand({ type: 'next' }))
  byId('stop').addEventListener('click', () => window.control.sendCommand({ type: 'stop' }))
  volume.addEventListener('input', () =>
    window.control.sendCommand({ type: 'volume', value: Number(volume.value) }),
  )
  seek.addEventListener('input', () => {
    seeking = true
    time.textContent = format(Number(seek.value))
  })
  seek.addEventListener('change', () => {
    seeking = false
    window.control.sendCommand({ type: 'seek', seconds: Number(seek.value) })
  })

  window.control.onState((s) => {
    status = s.status
    title.textContent = s.title || 'Nada tocando'
    statusEl.textContent = STATUS_TEXT[s.status]
    playerError.textContent = s.error ?? ''
    playerError.hidden = !s.error
    toggle.textContent = s.status === 'playing' ? '⏸' : '▶'
    seek.max = String(Math.floor(s.duration))
    duration.textContent = format(s.duration)
    if (!seeking) {
      seek.value = String(Math.floor(s.currentTime))
      time.textContent = format(s.currentTime)
    }
  })

  window.control.onNotice((message) => {
    notice.textContent = message
    notice.hidden = false
  })
}
```

- [ ] **Step 2: Atualizar `src/renderer/control/main.ts`**

```ts
import { initDisplays } from './displays'
import { initPlayback } from './playback'

void initDisplays()
void initPlayback()
```

- [ ] **Step 3: Verificar tipos e testes**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo; todos os testes das Tasks 2–7 passam.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/control
git commit -m "feat: playback controls in control window"
```

---

### Task 11: Verificação manual end-to-end e README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Criar `README.md`**

````markdown
# App Player YouTube

Toca vídeo/playlist do YouTube em um monitor secundário, controlado por uma janela na tela principal.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento
npm run build && npm run preview   # build de produção local
npm test           # testes unitários
```

## Uso

1. Cole o link de um vídeo ou playlist e clique em **Tocar**.
2. Escolha o monitor em "Monitor de reprodução" (use **Identificar** para ver o número em cada tela).
3. Use play/pause, anterior/próximo, seek e volume. **Parar** fecha o player.

## Limitações

- Anúncios do YouTube aparecem (limite da IFrame API).
- Alguns vídeos bloqueiam reprodução embutida; o app avisa e, em playlist, pula para o próximo.
````

- [ ] **Step 2: Checklist manual (multi-monitor real)**

Run: `npm run dev` e verificar cada item. Registrar resultado de cada um.

- [ ] Colar `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, clicar **Tocar**: vídeo toca em tela cheia no monitor escolhido, sem borda, cobrindo barra de menu/dock desse monitor. Controle mostra título, tempo e ⏸.
- [ ] Sem erro 153 (se aparecer "O YouTube recusou a origem", o player está sendo servido de origem inválida — conferir `location.origin` no player; deve ser `http://localhost:<porta>` em dev ou `http://127.0.0.1:<porta>` em build).
- [ ] Pause/play, seek (arrastar a barra), volume e Parar funcionam; Parar fecha a janela do player e o controle volta a "Parado".
- [ ] Trocar o monitor no select com vídeo tocando: janela move para o outro monitor sem interromper.
- [ ] Playlist (`.../playlist?list=...`): próximo/anterior funcionam.
- [ ] Link `watch?v=...&list=...`: começa no vídeo do link e segue a playlist.
- [ ] Item bloqueado para embed em uma playlist: aviso de erro no controle e o player pula para o próximo.
- [ ] URL inválida: mensagem vermelha inline, nada abre.
- [ ] Desconectar o monitor do player durante a reprodução: player move para outro monitor/tela, controle mostra aviso amarelo. Reconectar: player volta ao monitor salvo.
- [ ] Só um monitor: aviso amarelo, player abre em janela comum 960×540 e toca.
- [ ] Fechar a janela de controle encerra o app e fecha o player.
- [ ] Reabrir o app: monitor, volume e histórico (datalist do campo de URL) preservados.

Se o fullscreen em macOS não cobrir a barra de menu no monitor secundário, trocar `setAlwaysOnTop(true, 'screen-saver')` por `win.setSimpleFullScreen(true)` em `createPlayerWindow` (apenas no modo `screen`) e revalidar o item de reposicionamento.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README and manual QA checklist"
```
