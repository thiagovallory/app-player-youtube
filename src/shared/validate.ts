import type { ThemePref, VideoPrefs } from './types'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{10,}$/
const UID = /^[A-Za-z0-9-]{1,64}$/
const MAX_URL_LENGTH = 2048

export const MAX_QUEUE_NAME = 100
export const MAX_SAVED_QUEUES = 50
export const MAX_QUEUE_ITEMS = 200

export const isVideoId = (v: unknown): v is string => typeof v === 'string' && VIDEO_ID.test(v)

export const isListId = (v: unknown): v is string => typeof v === 'string' && LIST_ID.test(v)

export const isUid = (v: unknown): v is string => typeof v === 'string' && UID.test(v)

export function parseQueueName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  return name.length > 0 && name.length <= MAX_QUEUE_NAME ? name : null
}

export const isMoveIndex = (v: unknown, length: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length

export const isUrlText = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_URL_LENGTH

export type LoadMode = 'append' | 'replace'

export const isLoadMode = (v: unknown): v is LoadMode => v === 'append' || v === 'replace'

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

const CAPTION_LANG = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/

export const isThemePref = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark'

export const isCaptionLang = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 2 && v.length <= 35 && CAPTION_LANG.test(v)

export const isPlaybackRate = (v: unknown): v is number =>
  typeof v === 'number' && (PLAYBACK_RATES as readonly number[]).includes(v)

// All-or-nothing: any invalid known field rejects the whole update.
export function parseVideoPrefsUpdate(v: unknown): Partial<VideoPrefs> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const raw = v as Record<string, unknown>
  const out: Partial<VideoPrefs> = {}
  if ('captions' in raw) {
    if (typeof raw.captions !== 'boolean') return null
    out.captions = raw.captions
  }
  if ('captionLang' in raw) {
    if (raw.captionLang !== null && !isCaptionLang(raw.captionLang)) return null
    out.captionLang = raw.captionLang
  }
  if ('playbackRate' in raw) {
    if (!isPlaybackRate(raw.playbackRate)) return null
    out.playbackRate = raw.playbackRate
  }
  return Object.keys(out).length > 0 ? out : null
}

export const COMPACT_MIN_HEIGHT = 120
export const COMPACT_MAX_HEIGHT = 600

export type CompactRequest = { compact: true; height: number } | { compact: false }

export function parseCompactRequest(v: unknown): CompactRequest | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const { compact, height } = v as { compact?: unknown; height?: unknown }
  if (compact === false) return { compact: false }
  if (compact !== true) return null
  if (typeof height !== 'number' || !Number.isInteger(height)) return null
  if (height < COMPACT_MIN_HEIGHT || height > COMPACT_MAX_HEIGHT) return null
  return { compact: true, height }
}
