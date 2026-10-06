import { parseYoutubeUrl } from '../../shared/parseYoutubeUrl'
import type { PlayerState } from '../../shared/types'

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const STATUS_TEXT: Record<PlayerState['status'], string> = {
  idle: 'Parado',
  playing: 'Tocando',
  paused: 'Pausado',
  buffering: 'Carregando…',
  ended: 'Terminou',
  error: 'Erro',
}

function format(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export async function initPlayback(): Promise<void> {
  const url = byId<HTMLInputElement>('url')
  const urlError = byId<HTMLElement>('url-error')
  const history = byId<HTMLDataListElement>('history')
  const title = byId<HTMLElement>('title')
  const statusEl = byId<HTMLElement>('status')
  const playerError = byId<HTMLElement>('player-error')
  const seek = byId<HTMLInputElement>('seek')
  const time = byId<HTMLElement>('time')
  const duration = byId<HTMLElement>('duration')
  const toggle = byId<HTMLButtonElement>('toggle')
  const volume = byId<HTMLInputElement>('volume')
  const notice = byId<HTMLElement>('notice')

  const addHistoryOption = (value: string) => {
    if ([...history.options].some((o) => o.value === value)) return
    const option = document.createElement('option')
    option.value = value
    history.prepend(option)
  }

  const settings = await window.control.getSettings()
  volume.value = String(settings.volume)
  settings.history.forEach((h) => history.append(Object.assign(document.createElement('option'), { value: h })))

  let seeking = false
  let status: PlayerState['status'] = 'idle'

  const playFromUrl = () => {
    notice.hidden = true
    const target = parseYoutubeUrl(url.value)
    if (!target) {
      urlError.textContent = 'Link inválido. Cole um link de vídeo ou playlist do YouTube.'
      urlError.hidden = false
      return
    }
    urlError.hidden = true
    const value = url.value.trim()
    addHistoryOption(value)
    window.control.sendCommand({ type: 'load', target, url: value })
  }

  byId('play-url').addEventListener('click', playFromUrl)
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playFromUrl()
  })
  toggle.addEventListener('click', () =>
    window.control.sendCommand({ type: status === 'playing' ? 'pause' : 'play' }),
  )
  byId('prev').addEventListener('click', () => window.control.sendCommand({ type: 'prev' }))
  byId('next').addEventListener('click', () => window.control.sendCommand({ type: 'next' }))
  byId('stop').addEventListener('click', () => window.control.sendCommand({ type: 'stop' }))
  volume.addEventListener('input', () =>
    window.control.sendCommand({ type: 'volume', value: Number(volume.value) }),
  )
  seek.addEventListener('input', () => {
    seeking = true
    time.textContent = format(Number(seek.value))
  })
  seek.addEventListener('change', () => {
    seeking = false
    window.control.sendCommand({ type: 'seek', seconds: Number(seek.value) })
  })

  window.control.onState((s) => {
    status = s.status
    title.textContent = s.title || 'Nada tocando'
    statusEl.textContent = STATUS_TEXT[s.status]
    playerError.textContent = s.error ?? ''
    playerError.hidden = !s.error
    toggle.textContent = s.status === 'playing' ? '⏸' : '▶'
    seek.max = String(Math.floor(s.duration))
    duration.textContent = format(s.duration)
    if (!seeking) {
      seek.value = String(Math.floor(s.currentTime))
      time.textContent = format(s.currentTime)
    }
  })

  window.control.onNotice((message) => {
    notice.textContent = message
    notice.hidden = false
  })
}
