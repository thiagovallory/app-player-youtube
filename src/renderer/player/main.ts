import { describeYtError } from '../../shared/playerErrors'
import { IDLE_STATE, type PlayerCommand, type PlayerState } from '../../shared/types'

interface YTPlayer {
  loadVideoById(id: string): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title: string }
}

declare global {
  interface Window {
    YT: { Player: new (element: string, options: unknown) => YTPlayer }
    onYouTubeIframeAPIReady: () => void
  }
}

const STATUS_BY_YT_STATE: Record<number, PlayerState['status']> = {
  [-1]: 'buffering',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'paused',
}

const api = window.player
let yt: YTPlayer | null = null
let playerReady = false
const backlog: PlayerCommand[] = []
let state: PlayerState = { ...IDLE_STATE }

function report(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch }
  api.report(state)
}

function build(): void {
  yt = new window.YT.Player('yt', {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        playerReady = true
        while (backlog.length) exec(backlog.shift()!)
        api.ready()
      },
      onStateChange: (event: { data: number }) => {
        const status = STATUS_BY_YT_STATE[event.data]
        if (!status || !yt) return
        report({ status, title: yt.getVideoData().title || state.title, duration: yt.getDuration() })
      },
      onError: (event: { data: number }) => {
        const info = describeYtError(event.data)
        report({ status: 'error', error: info.message, skip: info.skippable })
      },
    },
  })
}

function exec(cmd: PlayerCommand): void {
  if (!yt) return
  switch (cmd.type) {
    case 'play-video':
      report({
        status: 'buffering',
        title: '',
        currentTime: 0,
        duration: 0,
        error: undefined,
        skip: undefined,
        uid: cmd.uid,
      })
      yt.loadVideoById(cmd.videoId)
      break
    case 'play':
      yt.playVideo()
      break
    case 'pause':
      yt.pauseVideo()
      break
    case 'volume':
      yt.setVolume(cmd.value)
      break
    case 'seek':
      yt.seekTo(cmd.seconds, true)
      break
    case 'next':
    case 'prev':
    case 'stop':
      break
  }
}

api.onCommand((cmd) => {
  if (playerReady) exec(cmd)
  else backlog.push(cmd)
})

setInterval(() => {
  if (yt && playerReady && state.status === 'playing') {
    report({ currentTime: yt.getCurrentTime(), duration: yt.getDuration() })
  }
}, 500)

window.onYouTubeIframeAPIReady = build
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
script.onerror = () => {
  report({ status: 'error', error: 'Não foi possível carregar o player do YouTube (sem internet?).' })
}
document.head.append(script)
