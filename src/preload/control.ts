import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ControlApi, Unsubscribe } from '../shared/api'
import {
  CMD_FROM_CONTROL,
  DISPLAYS_CHANGED,
  DISPLAYS_IDENTIFY,
  DISPLAYS_LIST,
  DISPLAYS_SELECT,
  NOTICE,
  PREFS_SET,
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
  WINDOW_COMPACT,
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
  setCompact: (compact, height) => ipcRenderer.send(WINDOW_COMPACT, { compact, height }),
  setPrefs: (update) => ipcRenderer.send(PREFS_SET, update),
  queueGet: () => ipcRenderer.invoke(QUEUE_GET),
  queueAdd: (url, playNow) => ipcRenderer.send(QUEUE_ADD, { url, playNow }),
  queueRemove: (uid) => ipcRenderer.send(QUEUE_REMOVE, uid),
  queueMove: (uid, toIndex) => ipcRenderer.send(QUEUE_MOVE, { uid, toIndex }),
  queueClear: () => ipcRenderer.send(QUEUE_CLEAR),
  queuePlayAt: (uid) => ipcRenderer.send(QUEUE_PLAY_AT, uid),
  queueSave: (name) => ipcRenderer.send(QUEUE_SAVE, name),
  queueLoadSaved: (name, mode) => ipcRenderer.send(QUEUE_LOAD_SAVED, { name, mode }),
  queueDeleteSaved: (name) => ipcRenderer.send(QUEUE_DELETE_SAVED, name),
  onState: (cb) => subscribe(STATE_TO_CONTROL, cb),
  onQueueState: (cb) => subscribe(QUEUE_STATE, cb),
  onDisplaysChanged: (cb) => subscribe(DISPLAYS_CHANGED, cb),
  onNotice: (cb) => subscribe(NOTICE, cb),
}

contextBridge.exposeInMainWorld('control', api)
