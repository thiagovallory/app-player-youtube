import type { CaptionTrack } from './types'

export function mapTracks(raw: unknown): CaptionTrack[] {
  if (!Array.isArray(raw)) return []
  const out: CaptionTrack[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>
    if (typeof t.languageCode !== 'string' || t.languageCode === '' || seen.has(t.languageCode)) continue
    seen.add(t.languageCode)
    const name =
      typeof t.languageName === 'string' && t.languageName
        ? t.languageName
        : typeof t.displayName === 'string' && t.displayName
          ? t.displayName
          : t.languageCode
    out.push({ code: t.languageCode, name })
  }
  return out
}

const norm = (code: string) => code.toLowerCase().replace(/_/g, '-')

export function pickTrack(tracks: CaptionTrack[], lang: string | null): string | null {
  if (!lang || tracks.length === 0) return null
  const want = norm(lang)
  const exact = tracks.find((t) => norm(t.code) === want)
  if (exact) return exact.code
  const prefix = want.split('-')[0]
  const loose = tracks.find((t) => norm(t.code).split('-')[0] === prefix)
  return loose ? loose.code : null
}

const baseLang = (code: unknown): string => {
  if (typeof code !== 'string') return ''
  return code.toLowerCase().split(/[-_]/)[0].trim()
}

// Always returns a caption language code. Auto-generated (ASR) captions do not show up in
// the tracklist, so the code is requested even when no listed track matches.
export function chooseCaptionCode(tracks: CaptionTrack[], lang: string | null, uiLang: string): string {
  if (lang) {
    // Auto-generated (ASR) tracks are not listed and use the bare language code.
    if (tracks.length === 0) return baseLang(lang) || lang
    return pickTrack(tracks, lang) ?? lang
  }
  const ui = typeof uiLang === 'string' ? uiLang : ''
  const fromUi = pickTrack(tracks, ui)
  if (fromUi) return fromUi
  if (tracks.length > 0) return tracks[0].code
  return baseLang(ui) || 'en'
}
