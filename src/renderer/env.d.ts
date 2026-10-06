import type { ControlApi, PlayerApi } from '../shared/api'

declare global {
  interface Window {
    control: ControlApi
    player: PlayerApi
  }
}

export {}
