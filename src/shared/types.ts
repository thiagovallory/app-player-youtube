export type YoutubeTarget =
  | { type: 'video'; id: string; listId?: string }
  | { type: 'playlist'; listId: string }

export type PlayerCommand =
  | { type: 'play-video'; videoId: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'volume'; value: number }
  | { type: 'seek'; seconds: number }
  | { type: 'stop' }

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

export interface PlayerState {
  status: PlayerStatus
  title: string
  currentTime: number
  duration: number
  error?: string
  skip?: boolean
}

export const IDLE_STATE: PlayerState = { status: 'idle', title: '', currentTime: 0, duration: 0 }

export interface DisplayInfo {
  id: number
  label: string
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
}

export interface SavedDisplay {
  id: number
  x: number
  y: number
  width: number
  height: number
}

export interface DisplaysSnapshot {
  displays: DisplayInfo[]
  selectedId: number
}

export interface Settings {
  display?: SavedDisplay
  volume: number
  history: string[]
  queues: SavedQueue[]
}

export interface QueueVideo {
  videoId: string
  title: string
}

export interface QueueItem extends QueueVideo {
  uid: string
}

export interface SavedQueue {
  name: string
  items: QueueVideo[]
}

export interface QueueState {
  items: QueueItem[]
  currentUid: string | null
  expanding: boolean
  saved: string[]
}

export type ProbeResult = { ok: true; ids: string[] } | { ok: false; error: string }
