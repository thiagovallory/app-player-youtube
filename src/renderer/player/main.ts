import { describeYtError } from '../../shared/playerErrors'
import { IDLE_STATE, type PlayerCommand, type PlayerState, type YoutubeTarget } from '../../shared/types'

interface YTPlayer {
  loadVideoById(id: string): void
  loadPlaylist(options: { list: string; listType: 'playlist'; index: number }): void
  playVideo(): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getVideoData(): { title: string }
  getPlaylist(): string[] | null
  destroy(): void
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
let backlog: PlayerCommand[] = []
let state: PlayerState = { ...IDLE_STATE }
let errorAt = 0

function report(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch }
  api.report(state)
}

function build(initial?: { videoId: string; listId: string }): void {
  playerReady = false
  const stage = document.getElementById('stage')
  if (stage) stage.innerHTML = '<div id="yt"></div>'
  yt = new window.YT.Player('yt', {
    width: '100%',
    height: '100%',
    ...(initial ? { videoId: initial.videoId } : {}),
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      playsinline: 1,
      origin: location.origin,
      ...(initial ? { list: initial.listId, listType: 'playlist' } : {}),
    },
    events: {
      onReady: () => {
        playerReady = true
        while (playerReady && backlog.length) exec(backlog.shift()!)
        api.ready()
      },
      onStateChange: (event: { data: number }) => {
        const status = STATUS_BY_YT_STATE[event.data]
        if (!status || !yt) return
        const keepError = !(status === 'playing' && Date.now() - errorAt > 4000)
        report({
          status,
          title: yt.getVideoData().title || state.title,
          duration: yt.getDuration(),
          ...(keepError ? {} : { error: undefined }),
        })
      },
      onError: (event: { data: number }) => {
        const info = describeYtError(event.data)
        errorAt = Date.now()
        report({ status: 'error', error: info.message })
        const list = yt?.getPlaylist()
        if (info.skippable && list && list.length > 1) yt?.nextVideo()
      },
    },
  })
}

function load(target: YoutubeTarget): void {
  report({ title: '', currentTime: 0, duration: 0, error: undefined })
  if (!yt) return
  if (target.type === 'playlist') {
    yt.loadPlaylist({ list: target.listId, listType: 'playlist', index: 0 })
  } else if (target.listId) {
    yt.destroy()
    build({ videoId: target.id, listId: target.listId })
  } else {
    yt.loadVideoById(target.id)
  }
}

function exec(cmd: PlayerCommand): void {
  if (!yt) return
  switch (cmd.type) {
    case 'load':
      load(cmd.target)
      break
    case 'play':
      yt.playVideo()
      break
    case 'pause':
      yt.pauseVideo()
      break
    case 'next':
      yt.nextVideo()
      break
    case 'prev':
      yt.previousVideo()
      break
    case 'volume':
      yt.setVolume(cmd.value)
      break
    case 'seek':
      yt.seekTo(cmd.seconds, true)
      break
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

window.onYouTubeIframeAPIReady = () => build()
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
document.head.append(script)
