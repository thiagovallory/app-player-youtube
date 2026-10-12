import type { ControlApi, PlayerApi, ProbeApi } from '../shared/api'

declare global {
  interface Window {
    control: ControlApi
    player: PlayerApi
    probe: ProbeApi
  }
}

export {}
