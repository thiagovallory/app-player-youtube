import type { LoadMode } from './validate'
import type { DisplaysSnapshot, PlayerCommand, PlayerState, ProbeResult, QueueState, Settings } from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  getDisplays(): Promise<DisplaysSnapshot>
  selectDisplay(id: number): Promise<DisplaysSnapshot>
  identifyDisplays(): Promise<void>
  getSettings(): Promise<Settings>
  sendCommand(cmd: PlayerCommand): void
  setCompact(compact: boolean, height?: number): void
  setPrefs(update: { videoPrefs?: unknown; theme?: unknown }): void
  queueGet(): Promise<QueueState | null>
  queueAdd(url: string, playNow: boolean): void
  queueRemove(uid: string): void
  queueMove(uid: string, toIndex: number): void
  queueClear(): void
  queuePlayAt(uid: string): void
  queueSave(name: string): void
  queueLoadSaved(name: string, mode: LoadMode): void
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
