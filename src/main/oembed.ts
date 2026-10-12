import { mapWithConcurrency } from './concurrency'

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>

export async function fetchVideoTitle(
  videoId: string,
  fetchImpl: FetchLike,
  timeoutMs = 8000,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) return null
    const body = (await response.json()) as { title?: unknown } | null
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    return title || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchTitles(
  videoIds: string[],
  onTitle: (videoId: string, title: string) => void,
  fetchImpl: FetchLike,
  limit = 5,
): Promise<void> {
  const unique = [...new Set(videoIds)]
  await mapWithConcurrency(unique, limit, async (id) => {
    const title = await fetchVideoTitle(id, fetchImpl)
    if (title) onTitle(id, title)
  })
}
