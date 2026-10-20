import { join } from 'node:path'
import { app, clipboard, dialog, ipcMain, Menu, nativeTheme, net, screen, type BrowserWindow, type WebContents } from 'electron'
import {
  CMD_FROM_CONTROL,
  DISPLAYS_CHANGED,
  DISPLAYS_IDENTIFY,
  DISPLAYS_LIST,
  DISPLAYS_SELECT,
  NOTICE,
  PLAYER_READY,
  PREFS_SET,
  QUEUE_ADD,
  QUEUE_CLEAR,
  QUEUE_COPY_LINK,
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
  WINDOW_COMPACT,
} from '../shared/ipc'
import { videoUrl } from '../shared/videoUrl'
import { IDLE_STATE, type DisplaysSnapshot, type PlayerCommand, type PlayerState } from '../shared/types'
import { isLoadMode, isMoveIndex, isThemePref, isUid, isUrlText, parseCompactRequest, parseQueueName, parseVideoPrefsUpdate } from '../shared/validate'
import { buildMenuTemplate } from './appMenu'
import { findSaved, pickDisplay, shouldWindow, toDisplayInfos, toSavedDisplay } from './displays'
import { createFetch } from './electronFetch'
import { fetchTitles } from './oembed'
import { PlayerController, type PlayerTarget } from './playerController'
import { expandPlaylist } from './playlistExpander'
import { QueueManager } from './queueManager'
import { SettingsStore } from './settingsStore'
import { startStaticServer } from './staticServer'
import { createCompactController } from './compactMode'
import { createControlWindow, identifyDisplays } from './windows'

async function main(): Promise<void> {
  await app.whenReady()

  if (app.isPackaged) {
    const template = buildMenuTemplate(process.platform, app.name)
    Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template as Electron.MenuItemConstructorOptions[]) : null)
  }

  const baseUrl =
    process.env['ELECTRON_RENDERER_URL'] ?? (await startStaticServer(join(__dirname, '../renderer'))).url
  const store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  nativeTheme.themeSource = store.get().theme
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

  let manager: QueueManager
  const controller = new PlayerController(baseUrl, () => {
    manager.onPlayerClosed()
    toControl(STATE_TO_CONTROL, IDLE_STATE)
  })

  manager = new QueueManager({
    expandPlaylist: (listId) => expandPlaylist(baseUrl, listId),
    fetchTitles: (ids, onTitle) => fetchTitles(ids, onTitle, createFetch(net)),
    playVideo: (videoId, uid) => {
      controller.send({ type: 'play-video', videoId, uid }, target())
      controller.send({ type: 'volume', value: store.get().volume }, target())
      controller.send({ type: 'prefs', prefs: store.get().videoPrefs }, target())
    },
    stopPlayer: () => controller.close(),
    addHistory: (url) => store.addHistory(url),
    confirmDuplicates: async ({ duplicates, total }) => {
      const options = {
        type: 'question' as const,
        buttons: ['Adicionar mesmo assim', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        message: total === 1 ? 'Este vídeo já está na fila.' : `${duplicates} de ${total} vídeos já estão na fila.`,
        detail: 'Adicionar mesmo assim?',
      }
      const { response } =
        controlWin && !controlWin.isDestroyed()
          ? await dialog.showMessageBox(controlWin, options)
          : await dialog.showMessageBox(options)
      return response === 0
    },
    saved: {
      list: () => store.get().queues,
      names: () => store.queueNames(),
      save: (name, items) => store.saveQueue(name, items),
      delete: (name) => store.deleteQueue(name),
    },
    publish: (state) => toControl(QUEUE_STATE, state),
    notify: (message) => toControl(NOTICE, message),
    isPlayerOpen: () => controller.isOpen(),
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
  ipcMain.on(QUEUE_COPY_LINK, (event, uid: unknown) => {
    if (!isControl(event.sender) || !isUid(uid)) return
    const item = manager.state().items.find((i) => i.uid === uid)
    if (!item) return
    clipboard.writeText(videoUrl(item.videoId))
    toControl(NOTICE, 'Link copiado.')
  })
  ipcMain.on(QUEUE_SAVE, (event, name: unknown) => {
    if (!isControl(event.sender)) return
    const clean = parseQueueName(name)
    if (clean) manager.save(clean)
    else toControl(NOTICE, 'Nome de fila inválido (use de 1 a 100 caracteres).')
  })
  ipcMain.on(QUEUE_LOAD_SAVED, (event, payload: unknown) => {
    if (!isControl(event.sender)) return
    const { name, mode } = (payload ?? {}) as { name?: unknown; mode?: unknown }
    const clean = parseQueueName(name)
    if (clean && isLoadMode(mode)) manager.loadSaved(clean, mode).catch((err) => toControl(NOTICE, String(err)))
  })
  ipcMain.on(QUEUE_DELETE_SAVED, (event, name: unknown) => {
    if (!isControl(event.sender)) return
    const clean = parseQueueName(name)
    if (clean) manager.deleteSaved(clean)
  })

  ipcMain.on(CMD_FROM_CONTROL, (event, cmd: PlayerCommand) => {
    if (!isControl(event.sender)) return
    if (typeof cmd !== 'object' || cmd === null || typeof cmd.type !== 'string') return
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
        if (typeof cmd.value !== 'number' || !Number.isFinite(cmd.value)) return
        store.setVolume(cmd.value)
        controller.send({ type: 'volume', value: store.get().volume }, target())
        return
      case 'seek':
        if (!Number.isFinite(cmd.seconds)) return
        break
    }
    controller.send(cmd, target())
  })
  const compactMode = createCompactController(() => controlWin)
  ipcMain.on(WINDOW_COMPACT, (event, payload: unknown) => {
    if (!isControl(event.sender)) return
    const request = parseCompactRequest(payload)
    if (request) compactMode.apply(request)
  })
  ipcMain.on(PREFS_SET, (event, payload: unknown) => {
    if (!isControl(event.sender)) return
    const { videoPrefs, theme } = (typeof payload === 'object' && payload !== null ? payload : {}) as {
      videoPrefs?: unknown
      theme?: unknown
    }
    if (isThemePref(theme)) {
      store.setTheme(theme)
      nativeTheme.themeSource = theme
    }
    const update = parseVideoPrefsUpdate(videoPrefs)
    if (update) {
      store.setVideoPrefs(update)
      controller.send({ type: 'prefs', prefs: store.get().videoPrefs }, target())
    }
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
    compactMode.reset()
    controlWin = null
    app.quit()
  })
}

main().catch((err) => {
  dialog.showErrorBox('Erro ao iniciar', String(err))
  app.quit()
})
