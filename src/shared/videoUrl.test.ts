import { describe, expect, it } from 'vitest'
import { parseYoutubeUrl } from './parseYoutubeUrl'
import { videoUrl } from './videoUrl'

describe('videoUrl', () => {
  it('builds the canonical watch URL', () => {
    expect(videoUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it.each(['dQw4w9WgXcQ', 'a_b-c123456'])('is parsed back as the same video (%s)', (id) => {
    expect(parseYoutubeUrl(videoUrl(id))).toEqual({ type: 'video', id })
  })
})
