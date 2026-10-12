import { parseYoutubeUrl } from '../../shared/parseYoutubeUrl'
import type { PlayerState } from '../../shared/types'
import { icon } from './icons'
import { getCurrentUid } from './queue'

const URL_ERROR_MS = 5000

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

function setFill(input: HTMLInputElement): void {
  const max = Number(input.max)
  const pct = max > 0 ? (Number(input.value) / max) * 100 : 0
  input.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct))}%`)
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
  setFill(volume)
  settings.history.forEach((h) => history.append(Object.assign(document.createElement('option'), { value: h })))

  let seeking = false
  let status: PlayerState['status'] = 'idle'

  let urlErrorTimer: ReturnType<typeof setTimeout> | undefined
  const hideUrlError = () => {
    clearTimeout(urlErrorTimer)
    urlError.hidden = true
  }

  const submit = (playNow: boolean) => {
    notice.hidden = true
    if (!parseYoutubeUrl(url.value)) {
      urlError.textContent = 'Link inválido. Cole um link de vídeo ou playlist do YouTube.'
      urlError.hidden = false
      clearTimeout(urlErrorTimer)
      urlErrorTimer = setTimeout(hideUrlError, URL_ERROR_MS)
      return
    }
    hideUrlError()
    const value = url.value.trim()
    addHistoryOption(value)
    window.control.queueAdd(value, playNow)
    url.value = ''
  }

  url.addEventListener('input', hideUrlError)
  byId('add-url').addEventListener('click', () => submit(false))
  byId('play-now').addEventListener('click', () => submit(true))
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit(false)
  })
  toggle.addEventListener('click', () => {
    const uid = getCurrentUid()
    if (uid && (status === 'idle' || status === 'ended' || status === 'error')) window.control.queuePlayAt(uid)
    else window.control.sendCommand({ type: status === 'playing' ? 'pause' : 'play' })
  })
  byId('prev').addEventListener('click', () => window.control.sendCommand({ type: 'prev' }))
  byId('next').addEventListener('click', () => window.control.sendCommand({ type: 'next' }))
  byId('stop').addEventListener('click', () => window.control.sendCommand({ type: 'stop' }))
  volume.addEventListener('input', () => {
    setFill(volume)
    window.control.sendCommand({ type: 'volume', value: Number(volume.value) })
  })
  seek.addEventListener('input', () => {
    seeking = true
    time.textContent = format(Number(seek.value))
    setFill(seek)
  })
  seek.addEventListener('change', () => {
    seeking = false
    window.control.sendCommand({ type: 'seek', seconds: Number(seek.value) })
  })

  window.control.onState((s) => {
    status = s.status
    title.textContent = s.title || 'Nada tocando'
    title.title = title.textContent
    statusEl.textContent = STATUS_TEXT[s.status]
    playerError.textContent = s.error ?? ''
    playerError.hidden = !s.error
    const playing = s.status === 'playing'
    toggle.replaceChildren(icon(playing ? 'pause' : 'play'))
    toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Tocar')
    toggle.title = playing ? 'Pausar' : 'Tocar'
    seek.max = String(Math.floor(s.duration))
    duration.textContent = format(s.duration)
    if (!seeking) {
      seek.value = String(Math.floor(s.currentTime))
      time.textContent = format(s.currentTime)
    }
    setFill(seek)
  })

  window.control.onNotice((message) => {
    notice.textContent = message
    notice.hidden = false
  })
}
