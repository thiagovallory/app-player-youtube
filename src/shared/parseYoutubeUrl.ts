import type { YoutubeTarget } from './types'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{10,}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'music.youtube.com'])
const ID_PATH_PREFIXES = new Set(['shorts', 'embed', 'live'])

function video(id: string, list: string | null): YoutubeTarget {
  return list && LIST_ID.test(list) ? { type: 'video', id, listId: list } : { type: 'video', id }
}

export function parseYoutubeUrl(input: string): YoutubeTarget | null {
  const text = input.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const list = url.searchParams.get('list')

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? ''
    return VIDEO_ID.test(id) ? video(id, list) : null
  }
  if (!YOUTUBE_HOSTS.has(host)) return null

  const [first, second = ''] = url.pathname.split('/').filter(Boolean)
  if (first === 'watch') {
    const v = url.searchParams.get('v') ?? ''
    if (VIDEO_ID.test(v)) return video(v, list)
  }
  if (first === 'watch' || first === 'playlist') {
    return list && LIST_ID.test(list) ? { type: 'playlist', listId: list } : null
  }
  if (ID_PATH_PREFIXES.has(first) && VIDEO_ID.test(second)) return video(second, list)
  return null
}
