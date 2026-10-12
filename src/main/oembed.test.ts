import { describe, expect, it } from 'vitest'
import { fetchTitles, fetchVideoTitle, type FetchLike } from './oembed'

const ok = (body: unknown): FetchLike => async () => ({ ok: true, json: async () => body })

describe('fetchVideoTitle', () => {
  it('returns the trimmed title and queries the oEmbed endpoint', async () => {
    let requested = ''
    const fetchImpl: FetchLike = async (url) => {
      requested = url
      return { ok: true, json: async () => ({ title: '  Never Gonna Give You Up  ' }) }
    }
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBe('Never Gonna Give You Up')
    expect(requested).toBe(
      `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}&format=json`,
    )
  })

  it('returns null for non-ok responses', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, json: async () => ({}) })
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBeNull()
  })

  it('returns null when the request throws', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('offline')
    }
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl)).toBeNull()
  })

  it.each([{}, { title: 5 }, { title: '   ' }, null])('returns null for body %j', async (body) => {
    expect(await fetchVideoTitle('dQw4w9WgXcQ', ok(body))).toBeNull()
  })

  it('aborts and returns null after the timeout', async () => {
    const fetchImpl: FetchLike = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    expect(await fetchVideoTitle('dQw4w9WgXcQ', fetchImpl, 10)).toBeNull()
  })
})

describe('fetchTitles', () => {
  it('reports titles for unique ids and skips failures', async () => {
    const seen: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url)
      if (url.includes('bbbbbbbbbbb')) return { ok: false, json: async () => ({}) }
      return { ok: true, json: async () => ({ title: 'T' }) }
    }
    const titles: Record<string, string> = {}
    await fetchTitles(
      ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa'],
      (id, title) => {
        titles[id] = title
      },
      fetchImpl,
    )
    expect(seen).toHaveLength(2)
    expect(titles).toEqual({ aaaaaaaaaaa: 'T' })
  })

  it('respects the concurrency limit', async () => {
    let active = 0
    let peak = 0
    const fetchImpl: FetchLike = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return { ok: true, json: async () => ({ title: 'T' }) }
    }
    const ids = Array.from({ length: 7 }, (_, i) => String(i).padStart(11, 'x'))
    await fetchTitles(ids, () => {}, fetchImpl, 2)
    expect(peak).toBe(2)
  })
})
