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
