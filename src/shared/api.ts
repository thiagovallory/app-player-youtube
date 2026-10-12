import type { DisplaysSnapshot, PlayerCommand, PlayerState, ProbeResult, Settings } from './types'

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

export interface ProbeApi {
  report(result: ProbeResult): void
}
