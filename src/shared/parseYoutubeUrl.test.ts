import { describe, expect, it } from 'vitest'
import { parseYoutubeUrl } from './parseYoutubeUrl'

const ID = 'dQw4w9WgXcQ'
const LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'

describe('parseYoutubeUrl', () => {
  it('parses a watch URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('parses youtu.be short links', () => {
    expect(parseYoutubeUrl(`https://youtu.be/${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('parses mobile and music hosts', () => {
    expect(parseYoutubeUrl(`https://m.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
    expect(parseYoutubeUrl(`https://music.youtube.com/watch?v=${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it.each(['shorts', 'embed', 'live'])('parses /%s/ URLs', (prefix) => {
    expect(parseYoutubeUrl(`https://www.youtube.com/${prefix}/${ID}`)).toEqual({ type: 'video', id: ID })
  })

  it('keeps the list on a video URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=${ID}&list=${LIST}`)).toEqual({
      type: 'video',
      id: ID,
      listId: LIST,
    })
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?list=${LIST}`)).toEqual({
      type: 'video',
      id: ID,
      listId: LIST,
    })
  })

  it('parses a playlist URL', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/playlist?list=${LIST}`)).toEqual({
      type: 'playlist',
      listId: LIST,
    })
  })

  it('falls back to playlist when watch has a list but no valid v', () => {
    expect(parseYoutubeUrl(`https://www.youtube.com/watch?v=bad&list=${LIST}`)).toEqual({
      type: 'playlist',
      listId: LIST,
    })
  })

  it('accepts URLs without a scheme and with surrounding whitespace', () => {
    expect(parseYoutubeUrl(`  youtube.com/watch?v=${ID}  `)).toEqual({ type: 'video', id: ID })
  })

  it.each([
    '',
    'not a url',
    'javascript:alert(1)',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    `https://example.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
  ])('rejects %j', (input) => {
    expect(parseYoutubeUrl(input)).toBeNull()
  })
})
