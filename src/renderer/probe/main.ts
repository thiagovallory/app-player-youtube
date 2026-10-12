import { describeYtError } from '../../shared/playerErrors'
import type { ProbeResult } from '../../shared/types'

interface ProbePlayer {
  getPlaylist(): string[] | null
  mute(): void
  cuePlaylist(options: { listType: 'playlist'; list: string }): void
}

interface ProbeWindow {
  YT: { Player: new (element: string, options: unknown) => ProbePlayer }
  onYouTubeIframeAPIReady: () => void
}

const w = window as unknown as ProbeWindow
const listId = location.hash.slice(1)
let poll: ReturnType<typeof setInterval> | undefined
let done = false
const CUE_FALLBACK_MS = 3000

function finish(result: ProbeResult): void {
  if (done) return
  done = true
  if (poll) clearInterval(poll)
  window.probe.report(result)
}

function tryFinish(player: ProbePlayer): boolean {
  const ids = player.getPlaylist()
  if (!ids || ids.length === 0) return false
  finish({ ok: true, ids: [...ids] })
  return true
}

function start(): void {
  const player: ProbePlayer = new w.YT.Player('yt', {
    width: '320',
    height: '180',
    playerVars: { listType: 'playlist', list: listId, autoplay: 0, controls: 0, origin: location.origin },
    events: {
      onReady: () => {
        player.mute()
        const readyAt = Date.now()
        let cued = false
        poll = setInterval(() => {
          if (tryFinish(player)) return
          if (!cued && Date.now() - readyAt >= CUE_FALLBACK_MS) {
            cued = true
            player.cuePlaylist({ listType: 'playlist', list: listId })
          }
        }, 300)
      },
      onStateChange: (event: { data: number }) => {
        if (event.data === 5) tryFinish(player)
      },
      onError: (event: { data: number }) => {
        if (tryFinish(player)) return
        // Only an invalid parameter is definitive; other errors may recover, the main-process timeout decides.
        if (event.data === 2) finish({ ok: false, error: describeYtError(event.data).message })
      },
    },
  })
}

w.onYouTubeIframeAPIReady = start
const script = document.createElement('script')
script.src = 'https://www.youtube.com/iframe_api'
script.onerror = () => finish({ ok: false, error: 'Não foi possível carregar o player do YouTube.' })
document.head.append(script)
