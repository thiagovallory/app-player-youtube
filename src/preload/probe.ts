import { contextBridge, ipcRenderer } from 'electron'
import type { ProbeApi } from '../shared/api'
import { PROBE_RESULT } from '../shared/ipc'

const api: ProbeApi = {
  report: (result) => ipcRenderer.send(PROBE_RESULT, result),
}

contextBridge.exposeInMainWorld('probe', api)
