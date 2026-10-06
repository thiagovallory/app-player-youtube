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
