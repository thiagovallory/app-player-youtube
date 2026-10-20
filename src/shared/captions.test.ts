import { describe, expect, it } from 'vitest'
import { chooseCaptionCode, mapTracks, pickTrack } from './captions'

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

describe('chooseCaptionCode', () => {
  const tracks = [
    { code: 'en-US', name: 'Inglês' },
    { code: 'pt', name: 'Português' },
  ]
  it('uses the exact or prefix match for an explicit language', () => {
    expect(chooseCaptionCode(tracks, 'pt', 'en')).toBe('pt')
    expect(chooseCaptionCode(tracks, 'pt-BR', 'en')).toBe('pt')
    expect(chooseCaptionCode(tracks, 'en', 'pt-BR')).toBe('en-US')
  })
  it('uses the explicit language itself when nothing matches or the list is empty (ASR)', () => {
    expect(chooseCaptionCode(tracks, 'ja', 'pt-BR')).toBe('ja')
    expect(chooseCaptionCode([], 'pt-BR', 'en')).toBe('pt-BR')
  })
  it('automatic: matches the UI language, else the first track', () => {
    expect(chooseCaptionCode(tracks, null, 'pt-BR')).toBe('pt')
    expect(chooseCaptionCode(tracks, null, 'de-DE')).toBe('en-US')
  })
  it('automatic with an empty list: base language of the UI', () => {
    expect(chooseCaptionCode([], null, 'pt-BR')).toBe('pt')
    expect(chooseCaptionCode([], null, 'EN_us')).toBe('en')
    expect(chooseCaptionCode([], null, 'fr')).toBe('fr')
  })
  it('falls back to en for garbage or missing UI language', () => {
    expect(chooseCaptionCode([], null, '')).toBe('en')
    expect(chooseCaptionCode([], null, '-BR')).toBe('en')
    expect(chooseCaptionCode([], null, undefined as unknown as string)).toBe('en')
    expect(chooseCaptionCode([], '', 'pt-BR')).toBe('pt')
  })
})
