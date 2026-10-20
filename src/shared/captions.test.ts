import { describe, expect, it } from 'vitest'
import { mapTracks, pickTrack } from './captions'

describe('mapTracks', () => {
  it('maps tracks using languageName, displayName or the code', () => {
    expect(
      mapTracks([
        { languageCode: 'pt-BR', languageName: 'Português (Brasil)', displayName: 'x' },
        { languageCode: 'en', displayName: 'Inglês' },
        { languageCode: 'ja' },
      ]),
    ).toEqual([
      { code: 'pt-BR', name: 'Português (Brasil)' },
      { code: 'en', name: 'Inglês' },
      { code: 'ja', name: 'ja' },
    ])
  })
  it('ignores garbage and duplicates', () => {
    expect(mapTracks(null)).toEqual([])
    expect(mapTracks('x')).toEqual([])
    expect(
      mapTracks([null, 5, {}, { languageCode: 3 }, { languageCode: '' }, { languageCode: 'en' }, { languageCode: 'en', languageName: 'Dup' }]),
    ).toEqual([{ code: 'en', name: 'en' }])
  })
})

describe('pickTrack', () => {
  const tracks = [
    { code: 'pt', name: 'Português' },
    { code: 'en-US', name: 'Inglês' },
    { code: 'de-DE', name: 'Alemão' },
  ]
  it('matches exactly ignoring case and separator', () => {
    expect(pickTrack(tracks, 'EN-us')).toBe('en-US')
    expect(pickTrack(tracks, 'en_US')).toBe('en-US')
  })
  it('falls back to language prefix', () => {
    expect(pickTrack(tracks, 'pt-BR')).toBe('pt')
    expect(pickTrack(tracks, 'en')).toBe('en-US')
    expect(pickTrack(tracks, 'de')).toBe('de-DE')
  })
  it('prefers exact over prefix', () => {
    expect(pickTrack([{ code: 'pt-PT', name: '' }, { code: 'pt-BR', name: '' }], 'pt-BR')).toBe('pt-BR')
  })
  it('returns null when absent or empty', () => {
    expect(pickTrack(tracks, 'ja')).toBeNull()
    expect(pickTrack(tracks, null)).toBeNull()
    expect(pickTrack(tracks, '')).toBeNull()
    expect(pickTrack([], 'en')).toBeNull()
  })
})
