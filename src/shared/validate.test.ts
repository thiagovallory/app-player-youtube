import { describe, expect, it } from 'vitest'
import {
  MAX_QUEUE_NAME,
  isListId,
  isLoadMode,
  isMoveIndex,
  isUid,
  isUrlText,
  isVideoId,
  PLAYBACK_RATES,
  isCaptionLang,
  isThemePref,
  parseVideoPrefsUpdate,
  parseQueueName,
} from './validate'

describe('isVideoId', () => {
  it('accepts an 11-character id', () => {
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true)
  })

  it.each(['', 'short', 'dQw4w9WgXcQ1', 'dQw4w9WgXc!', 42, null, undefined])('rejects %j', (value) => {
    expect(isVideoId(value)).toBe(false)
  })
})

describe('isListId', () => {
  it('accepts a playlist id', () => {
    expect(isListId('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe(true)
  })

  it.each(['', 'abc', 'PLrAXtmErZgOeiKm4sgN&x=1', 7, null])('rejects %j', (value) => {
    expect(isListId(value)).toBe(false)
  })
})

describe('isUid', () => {
  it('accepts uuid-like ids', () => {
    expect(isUid('a1b2-c3')).toBe(true)
    expect(isUid('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
  })

  it.each(['', 'a b', 'x'.repeat(65), 5, null])('rejects %j', (value) => {
    expect(isUid(value)).toBe(false)
  })
})

describe('parseQueueName', () => {
  it('trims the name', () => {
    expect(parseQueueName('  Rock  ')).toBe('Rock')
  })

  it('accepts exactly the maximum length', () => {
    expect(parseQueueName('a'.repeat(MAX_QUEUE_NAME))).toBe('a'.repeat(MAX_QUEUE_NAME))
  })

  it.each(['', '   ', 'a'.repeat(MAX_QUEUE_NAME + 1), 5, null, undefined])('rejects %j', (value) => {
    expect(parseQueueName(value)).toBeNull()
  })
})

describe('isMoveIndex', () => {
  it('accepts integers inside the range', () => {
    expect(isMoveIndex(0, 3)).toBe(true)
    expect(isMoveIndex(2, 3)).toBe(true)
  })

  it.each([3, -1, 1.5, '1', null, Number.NaN])('rejects %j for length 3', (value) => {
    expect(isMoveIndex(value, 3)).toBe(false)
  })
})

describe('isUrlText', () => {
  it('accepts non-empty strings up to 2048 characters', () => {
    expect(isUrlText('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isUrlText('a'.repeat(2048))).toBe(true)
  })

  it.each(['', 'a'.repeat(2049), 5, null])('rejects %j', (value) => {
    expect(isUrlText(value)).toBe(false)
  })
})

describe('isLoadMode', () => {
  it.each(['append', 'replace'])('accepts %j', (value) => {
    expect(isLoadMode(value)).toBe(true)
  })

  it.each(['', 'Append', 'play', 1, null, undefined, {}])('rejects %j', (value) => {
    expect(isLoadMode(value)).toBe(false)
  })
})

describe('isThemePref', () => {
  it('accepts only the three themes', () => {
    for (const t of ['system', 'light', 'dark']) expect(isThemePref(t)).toBe(true)
    for (const t of ['auto', '', null, 1, undefined]) expect(isThemePref(t)).toBe(false)
  })
})

describe('isCaptionLang', () => {
  it('accepts language codes', () => {
    for (const l of ['en', 'pt-BR', 'zh-Hans', 'es-419', 'pt_BR', 'haw']) expect(isCaptionLang(l)).toBe(true)
  })
  it('rejects junk', () => {
    for (const l of ['', 'x', '1en', 'en-', 'a'.repeat(36), 'en us', null, 5]) expect(isCaptionLang(l)).toBe(false)
  })
})

describe('parseVideoPrefsUpdate', () => {
  it('accepts valid partial updates', () => {
    expect(parseVideoPrefsUpdate({ captions: true })).toEqual({ captions: true })
    expect(parseVideoPrefsUpdate({ captionLang: null })).toEqual({ captionLang: null })
    expect(parseVideoPrefsUpdate({ captionLang: 'pt-BR', playbackRate: 1.25 })).toEqual({
      captionLang: 'pt-BR',
      playbackRate: 1.25,
    })
  })
  it('accepts every listed rate', () => {
    for (const r of PLAYBACK_RATES) expect(parseVideoPrefsUpdate({ playbackRate: r })).toEqual({ playbackRate: r })
  })
  it('rejects everything when any field is invalid', () => {
    expect(parseVideoPrefsUpdate({ captions: true, playbackRate: 3 })).toBeNull()
    expect(parseVideoPrefsUpdate({ captions: 'yes' })).toBeNull()
    expect(parseVideoPrefsUpdate({ captionLang: '!!' })).toBeNull()
  })
  it('rejects non-objects and objects with no valid field', () => {
    for (const v of [null, undefined, 5, 'x', [], {}, { other: 1 }]) expect(parseVideoPrefsUpdate(v)).toBeNull()
  })
})
