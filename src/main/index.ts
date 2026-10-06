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
  const toControl = (channel: string, payload: unknown) => {
    if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(channel, payload)
  }

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
  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)
  screen.on('display-metrics-changed', onDisplaysChanged)

  controlWin = createControlWindow(baseUrl)
  controlWin.on('closed', () => {
    controlWin = null
    app.quit()
  })
}

void main()
