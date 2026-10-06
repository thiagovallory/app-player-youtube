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
