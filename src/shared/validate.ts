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
