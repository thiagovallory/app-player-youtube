import { describe, expect, it } from 'vitest'
import { isYoutubeEmbedUrl } from './embedUrl'

describe('isYoutubeEmbedUrl', () => {
  it('accepts youtube embed urls', () => {
    expect(isYoutubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1')).toBe(true)
    expect(isYoutubeEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true)
  })
  it('rejects watch pages, other hosts and bad input', () => {
    expect(isYoutubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    expect(isYoutubeEmbedUrl('https://example.com/embed/x')).toBe(false)
    expect(isYoutubeEmbedUrl('https://www.youtube.com.evil.com/embed/x')).toBe(false)
    expect(isYoutubeEmbedUrl('https://evil.com/www.youtube.com/embed/x')).toBe(false)
    expect(isYoutubeEmbedUrl('not a url')).toBe(false)
    expect(isYoutubeEmbedUrl('')).toBe(false)
  })
})
