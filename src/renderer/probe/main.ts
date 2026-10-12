import { describeYtError } from '../../shared/playerErrors'
import type { ProbeResult } from '../../shared/types'

interface ProbePlayer {
  getPlaylist(): string[] | null
  mute(): void
}

interface ProbeWindow {
  YT: { Player: new (element: string, options: unknown) => ProbePlayer }
  onYouTubeIframeAPIReady: () => void
}

const w = window as unknown as ProbeWindow
const listId = location.hash.slice(1)
let poll: ReturnType<typeof setInterval> | undefined
let done = false

function finish(result: ProbeResult): void {
  if (done) return
  done = true
  if (poll) clearInterval(poll)
  window.probe.report(result)
}

function start(): void {
  const player: ProbePlayer = new w.YT.Player('yt', {
    width: '320',
    height: '180',
    playerVars: { listType: 'playlist', list: listId, autoplay: 0, controls: 0, origin: location.origin },
    events: {
      onReady: () => {
        player.mute()
        poll = setInterval(() => {
          const ids = player.getPlaylist()
          if (ids && ids.length > 0) finish({ ok: true, ids: [...ids] })
        }, 300)
      },
      onError: (event: { data: number }) => finish({ ok: false, error: describeYtError(event.data).message }),
    },
  })
}

w.onYouTubeIframeAPIReady = start
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
script.onerror = () => finish({ ok: false, error: 'Não foi possível carregar o player do YouTube.' })
document.head.append(script)
